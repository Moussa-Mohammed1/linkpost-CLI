import type { FileSnap, ModuleInfo } from "../core/types.js";

export interface InferenceRead {
  readText: (relPath: string, maxBytes?: number) => Promise<string>;
  hasFile: (relPath: string) => boolean;
  hasModule: (name: string) => boolean;
}

const README_CANDIDATES = ["README.md", "README.markdown", "README.txt", "Readme.md", "README"];

function baseName(rel: string): string {
  const idx = rel.lastIndexOf("/");
  return idx === -1 ? rel : rel.slice(idx + 1);
}

/** One-line business purpose inferred from README/packages/module names. */
export async function inferPurpose(
  ctx: InferenceRead,
  modules: ModuleInfo[],
  fallbackHint?: string,
): Promise<string> {
  for (const candidate of README_CANDIDATES) {
    const text = (await ctx.readText(candidate, 64 * 1024)).trim();
    if (!text) continue;
    const plain = text.replace(/#{1,6}\s*/g, "").replace(/\r?\n/g, " ").replace(/\s+/g, " ");
    for (const part of plain.split(/(?<=[.!?])\s+/)) {
      if (part.trim().length >= 24) return part.trim().slice(0, 260);
    }
    return plain.slice(0, 260) || "Software project.";
  }
  if (fallbackHint && fallbackHint.trim().length >= 20) {
    return fallbackHint.trim().slice(0, 260);
  }
  const names = modules.filter((m) => m.name !== "root").map((m) => m.name);
  return names.length > 0
    ? `A software project built around ${names.slice(0, 3).join(", ")}.`
    : "A software project of unspecified business purpose.";
}

/** Notable deep links for the post and metadata. */
export function pickNotableFiles(files: FileSnap[]): string[] {
  const out: string[] = [];
  const readme = files.find((f) => /^readme(\.[a-z0-9]+)?$/i.test(baseName(f.relPath)));
  if (readme) out.push(readme.relPath);
  const entry = files.find(
    (f) => !/^readme\./i.test(baseName(f.relPath)) && /^(index|main|app|server|manage|cli|worker)\./i.test(baseName(f.relPath)),
  );
  if (entry) out.push(entry.relPath);
  const schema = files.find((f) => f.relPath === "prisma/schema.prisma" || /\.prisma$/.test(f.relPath));
  if (schema) out.push(schema.relPath);
  if (out.length === 0) {
    const anySource = files.find((f) => /\.(ts|tsx|js|py|go|rs)$/i.test(f.relPath));
    if (anySource) out.push(anySource.relPath);
  }
  return Array.from(new Set(out)).slice(0, 5);
}

/** Evidence-backed engineering decisions: linting, typing, CI, workspace. */
export function inferEngineeringHighlights(ctx: InferenceRead, files: FileSnap[], modules: ModuleInfo[]): string[] {
  const rels = new Set(files.map((f) => f.relPath));
  const has = (...names: string[]) => names.some((n) => rels.has(n) || ctx.hasFile(n));
  const out: string[] = [];

  if (rels.has("tsconfig.json")) out.push("TypeScript with strict typing");
  if (has("eslint.config.mjs", "eslint.config.js", ".eslintrc.cjs", ".eslintrc.json")) out.push("Linting with ESLint");
  if (has(".prettierrc", ".prettierrc.json", "prettier.config.js")) out.push("Consistent formatting with Prettier");
  if (has(".husky/pre-commit", ".lintstagedrc")) out.push("Pre-commit checks via Husky/lint-staged");
  if (has("docker-compose.yml", "docker-compose.yaml")) out.push("Reproducible dev stack with Docker Compose");
  if (rels.has("Dockerfile") || ctx.hasFile("Dockerfile")) out.push("Deployable via a Dockerfile");
  if (rels.has(".github/workflows") || [...rels].some((r) => r.startsWith(".github/workflows/"))) out.push("CI with GitHub Actions");
  if (rels.has("prisma/schema.prisma")) out.push("Type-safe ORM migrations with Prisma");
  if (has("pnpm-workspace.yaml", "turbo.json", "lerna.json", "nx.json")) out.push("Monorepo workspace tooling");

  const testStack = ["vitest", "jest", "playwright", "@playwright/test", "cypress", "pytest", "rspec", "junit"].find(
    (name) => ctx.hasModule(name),
  );
  if (testStack) out.push("Automated test suite configured");

  const totalLoc = modules.reduce((acc, m) => acc + m.estimatedLoc, 0);
  if (totalLoc > 20_000) out.push(`Sizable codebase (~${Math.round(totalLoc / 1000)}k LOC)`);

  return out.slice(0, 10);
}

/** Challenges inferred strictly from observable signals. */
export function inferChallenges(
  files: FileSnap[],
  modules: ModuleInfo[],
  hasTestingTool = false,
): string[] {
  const out: string[] = [];
  const totalFiles = files.length;
  const totalLoc = modules.reduce((acc, m) => acc + m.estimatedLoc, 0);

  if (totalLoc > 50_000 || totalFiles > 500) {
    out.push(`Keeping a ${totalFiles}+ file codebase coherent as it grows`);
  }
  const hasTests =
    hasTestingTool ||
    files.some((f) => /(\.test\.|\.spec\.|_test\.|_test\.spec\.)/.test(f.relPath));
  if (!hasTests) out.push("Moving from manual QA to an automated test culture");
  if (files.some((f) => f.relPath === "Dockerfile" || /docker-compose/.test(f.relPath)) && totalLoc > 10_000) {
    out.push("Slimming container images as the dependency graph grows");
  }
  if (files.some((f) => /(worker|queue|pubsub|realtime|async)/i.test(f.relPath))) {
    out.push("Coordinating asynchronous and background workloads");
  }
  if (files.some((f) => /(migration|seed|fixtures)/i.test(f.relPath))) {
    out.push("Keeping data migrations safe under schema churn");
  }
  if (out.length === 0) out.push("Carving out a clear domain model from early code");
  return out.slice(0, 6);
}