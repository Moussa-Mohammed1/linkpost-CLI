import type { FileSnap, ModuleInfo } from "../core/types.js";
import { LANGUAGE_BY_EXT } from "../plugins/builtins/language.js";

/** Extensions counted as source code (excludes config, docs and binary). */
const SOURCE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "kt",
  "rb", "php", "c", "h", "cpp", "hpp", "cs", "swift", "dart", "sh", "scala",
  "hs", "ex", "exs", "clj", "lua", "r", "sql", "vue", "svelte", "astro",
]);

const INSPECTABLE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "kt",
  "rb", "php", "cs", "swift", "dart", "vue", "svelte",
]);

const INSPECT_BUDGET = 10;
const FILE_READ_CAP = 8 * 1024;

export interface ModuleScanInput {
  /** Relative path used for labels; "" for the project root. */
  relPath: string;
  name: string;
  files: FileSnap[];
  readText: (relPath: string, maxBytes?: number) => Promise<string>;
}

const IMPORT_RE = /\bfrom\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
const ROUTE_RE =
  /(app\.(?:get|post|put|patch|delete|all)\s*\()|(@(?:app\.|router\.)?(?:get|post|put|patch|delete)\s*\()|(@(?:Get|Post|Put|Patch|Delete|GetMapping|PostMapping)\s*\()|\/api\//gi;

function extensionOf(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? "" : path.slice(idx + 1).toLowerCase();
}

function languageOf(path: string): string | undefined {
  const ext = extensionOf(path);
  return LANGUAGE_BY_EXT[ext];
}

/**
 * Computes a concise, single-paragraph summary for one module using only local
 * heuristics: dominant languages, top imports, API-route markers and structural
 * hints. No LLM is used here — this local summarization step is what keeps each
 * module's LLM context minimal before the global post is generated.
 */
export async function summarizeModule(input: ModuleScanInput): Promise<ModuleInfo> {
  const { relPath, name, files, readText } = input;

  // Dominant languages
  const langCounts = new Map<string, number>();
  for (const f of files) {
    const lang = languageOf(f.relPath);
    if (lang) langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
  }
  const languages = [...langCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([lang]) => lang);

  // Inspect a bounded set of the largest source files.
  const inspectable = files.filter((f) => INSPECTABLE_EXT.has(extensionOf(f.relPath)));
  inspectable.sort((a, b) => b.size - a.size);
  const toRead = inspectable.slice(0, INSPECT_BUDGET);

  const imports = new Set<string>();
  let endpointCount = 0;
  const flags = new Set<string>();

  for (const file of toRead) {
    const text = await readText(file.relPath, FILE_READ_CAP);
    for (const m of text.matchAll(IMPORT_RE)) {
      const dep = (m[1] ?? m[2] ?? m[3])?.trim();
      if (!dep || dep.startsWith(".")) continue;
      const head = dep.startsWith("@") ? dep.split("/").slice(0, 2).join("/") : dep.split("/")[0];
      if (head) imports.add(head);
    }
    endpointCount += (text.match(ROUTE_RE) ?? []).length;
    if (/\bsocket\.io\b/i.test(text) || /websocket/i.test(text)) flags.add("WebSockets");
    if (/\b(worker_threads|child_process|queue|bullmq|amqp|scheduler|cron)\b/i.test(text)) flags.add("background tasks");
    if (/\b(TODO|FIXME|HACK)\b/.test(text)) flags.add("in-progress areas");
  }

  const hasTsConfig = files.some((f) => f.relPath === "tsconfig.json");
  const hasReadme = files.some(
    (f) => /^readme(_|\.|$)/i.test(f.relPath.split("/").pop() ?? "") || f.relPath.toLowerCase().startsWith("readme."),
  );

  const fileCount = files.length;
  const estimatedLoc = Math.round(
    files.reduce((acc, f) => {
      const ext = extensionOf(f.relPath);
      return SOURCE_EXT.has(ext) ? acc + Math.max(2, f.size / 40) : acc;
    }, 0),
  );

  const parts: string[] = [];
  parts.push(`${fileCount} file(s), ~${estimatedLoc} lines of code`);
  if (languages.length) parts.push(`mainly ${languages.join(", ")}`);
  if (imports.size) {
    const top = [...imports].sort().slice(0, 5).join(", ");
    parts.push(`key modules: ${top}${imports.size > 5 ? ", …" : ""}`);
  }
  if (endpointCount > 0) parts.push(`~${endpointCount} HTTP/API endpoints`);
  if (flags.size) parts.push([...flags].join(", "));
  if (hasTsConfig) parts.push("TypeScript-typed");
  if (hasReadme) parts.push("documented");

  return {
    relPath,
    name,
    summary: parts.join(". ") + ".",
    languages,
    fileCount,
    estimatedLoc,
    highlights: [...flags],
  };
}