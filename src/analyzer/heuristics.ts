import type { Detection, Feature, FileSnap, ModuleInfo, TechnologyInventory } from "../core/types.js";

const DATABASE_NAMES = new Set([
  "PostgreSQL", "MySQL", "MariaDB", "MongoDB", "Redis", "SQLite",
  "Elasticsearch", "Neo4j", "DuckDB", "ClickHouse", "Cassandra", "Memcached", "Firestore",
]);

const FEATURE_RULES: Array<{ name: string; categories: string[]; names: string[]; confidence: number }> = [
  { name: "AI integration", categories: ["ai"], names: ["OpenAI SDK", "Anthropic SDK", "LangChain", "LlamaIndex", "PyTorch", "Transformers", "Ollama"], confidence: 0.9 },
  { name: "Authentication & authorization", categories: ["authentication"], names: ["Passport.js", "Clerk", "Auth0", "Keycloak", "JWT", "NextAuth", "Supabase Auth", "Spring Security"], confidence: 0.9 },
  { name: "Automated CI/CD pipeline", categories: ["ci-cd"], names: ["GitHub Actions", "GitLab CI/CD", "Jenkins"], confidence: 0.9 },
  { name: "Containerized deployment", categories: ["docker"], names: ["Dockerfile", "Docker Compose"], confidence: 0.9 },
  { name: "Automated test suite", categories: ["testing"], names: ["Jest", "Vitest", "Pytest", "Playwright", "Cypress", "Mocha", "RSpec", "JUnit 5"], confidence: 0.9 },
  { name: "REST API backend", categories: ["backend-framework"], names: ["Express", "Fastify", "NestJS", "FastAPI", "Flask", "Django", "Spring Boot", "Rails", "Laravel", "Gin", "Axum", "Hono"], confidence: 0.85 },
  { name: "Interactive UI components", categories: ["frontend-framework"], names: ["React", "Vue.js", "Angular", "Svelte", "Next.js", "Flutter", "React Native"], confidence: 0.85 },
  { name: "Real-time data", categories: ["backend-framework"], names: ["Phoenix LiveView"], confidence: 0.75 },
];

/** Flatten detections into a deduplicated {category → names} inventory. */
export function buildInventory(detections: Detection[]): TechnologyInventory {
  const byCategory: TechnologyInventory["byCategory"] = {};
  for (const det of detections) {
    const list = byCategory[det.category] ?? (byCategory[det.category] = []);
    if (!list.includes(det.name)) list.push(det.name);
  }
  const all = Object.values(byCategory).flat().filter(Boolean);
  return { byCategory, all };
}

/** Friendly project name from package.json name or the folder basename. */
export function inferProjectName(cwd: string, pkg?: Record<string, unknown>): string {
  const pkgName = pkg?.name;
  if (typeof pkgName === "string" && pkgName.trim()) return pkgName;
  const base = cwd.split(/[\\/]/).pop() ?? cwd;
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || base;
}

/** Top N languages ranked by detection confidence and estimated LOC. */
export function primaryLanguages(detections: Detection[], modules: ModuleInfo[]): string[] {
  const scores = new Map<string, number>();
  for (const det of detections) {
    if (det.category !== "language") continue;
    scores.set(det.name, Math.max(scores.get(det.name) ?? 0, det.confidence));
  }
  for (const m of modules) {
    for (const lang of m.languages) {
      scores.set(lang, Math.max(scores.get(lang) ?? 0, Math.min(1, m.estimatedLoc / 2000)));
    }
  }
  const ordered = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  return ordered.slice(0, 3).map(([name]) => name);
}

function hasName(detections: Detection[], category: string, names: string[]): boolean {
  return detections.some((d) => d.category === category && names.includes(d.name));
}

/** High-level architecture descriptors for the post overview. */
export function inferArchitecture(detections: Detection[], modules: ModuleInfo[], files: FileSnap[]): string[] {
  const arch = new Set<string>();
  const hasFrontend = hasName(detections, "frontend-framework", ["React", "Vue.js", "Angular", "Svelte", "Next.js", "Flutter", "Astro", "Remix", "SolidJS"]);
  const hasBackend = hasName(detections, "backend-framework", ["Express", "Fastify", "NestJS", "FastAPI", "Flask", "Django", "Spring Boot", "Rails", "Laravel", "Axum", "Gin", "Hono", "ASP.NET Core", "Koa", "Fiber"]);

  if (hasFrontend && hasBackend) arch.add("Client–server (UI + API)");
  else if (hasBackend) arch.add("Backend service");
  else if (hasFrontend) arch.add("Frontend application");

  const containerKids = modules.filter((m) => m.relPath.includes("/") || m.relPath.startsWith("packages"));
  if (containerKids.length >= 2) arch.add("Monorepo project");
  if (hasName(detections, "docker", ["Docker Compose"])) arch.add("Multi-container orchestration");
  if (hasName(detections, "database", ["Redis"])) arch.add("Cache + store layering");
  if (files.length > 60) arch.add("Modular, growing codebase");

  if (arch.size === 0) arch.add("Standalone project");
  return [...arch];
}

/** Detector-driven feature bullets, each backed by concrete evidence. */
export function inferFeatures(detections: Detection[]): Feature[] {
  const features: Feature[] = [];
  for (const rule of FEATURE_RULES) {
    const hit = detections.some((d) => rule.categories.includes(d.category) && rule.names.includes(d.name));
    if (!hit) continue;
    const evidence = detections
      .filter((d) => rule.categories.includes(d.category) && rule.names.includes(d.name))
      .map((d) => d.evidence ?? d.name)
      .slice(0, 2);
    features.push({ name: rule.name, confidence: rule.confidence, evidence });
  }
  const dbHits = detections.filter((d) => d.category === "database" && DATABASE_NAMES.has(d.name));
  if (dbHits.length > 0) {
    features.push({
      name: "Persistent data layer",
      confidence: 0.85,
      evidence: dbHits.map((d) => d.evidence ?? d.name).slice(0, 3),
    });
  }
  const realtime = detections.some(
    (d) => !d.category.startsWith("language") && /(socket|ws|websocket|real.?time|stream)/i.test(d.name),
  );
  if (realtime) {
    features.push({ name: "Real-time data", confidence: 0.8, evidence: ["websocket / streaming signals"] });
  }
  return features.slice(0, 8);
}