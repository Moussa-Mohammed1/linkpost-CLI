import type { Detection } from "../../core/types.js";
import type { AnalyzerPlugin, PluginContext } from "../types.js";
import { detect, uniqByName } from "./util.js";

/** Extension -> language name. */
export const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  rb: "Ruby",
  php: "PHP",
  c: "C",
  h: "C",
  cpp: "C++",
  hpp: "C++",
  cc: "C++",
  cs: "C#",
  swift: "Swift",
  dart: "Dart",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  scala: "Scala",
  hs: "Haskell",
  ex: "Elixir",
  exs: "Elixir",
  clj: "Clojure",
  lua: "Lua",
  r: "R",
  sql: "SQL",
  vue: "Vue",
  svelte: "Svelte",
  astro: "Astro",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  styl: "Stylus",
  pug: "Pug",
  md: "Markdown",
  fs: "F#",
  zig: "Zig",
  nim: "Nim",
};

/** Fills a Detection with stable version notes based on language presence. */
function primaryLanguage(ctx: PluginContext): string | undefined {
  const counts = new Map<string, number>();
  for (const file of ctx.files) {
    const dot = file.relPath.lastIndexOf(".");
    if (dot === -1) continue;
    const ext = file.relPath.slice(dot + 1).toLowerCase();
    const lang = LANGUAGE_BY_EXT[ext];
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  let best: string | undefined;
  let bestCount = 0;
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}

export const languagePlugin: AnalyzerPlugin = {
  id: "builtin.language",
  title: "Languages",
  description: "Detects programming languages from file extensions.",
  detect(ctx: PluginContext): Detection[] {
    const counts = new Map<string, number>();
    for (const file of ctx.files) {
      const dot = file.relPath.lastIndexOf(".");
      if (dot === -1) continue;
      const ext = file.relPath.slice(dot + 1).toLowerCase();
      const lang = LANGUAGE_BY_EXT[ext];
      if (!lang) continue;
      counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    const peak = Math.max(...counts.values());
    const out: Detection[] = [];
    for (const [lang, count] of counts) {
      const confidence = Math.min(
        0.95,
        0.6 + 0.3 * (count / total) + 0.1 * (count / peak),
      );
      out.push(
        detect(lang, "language", confidence, undefined, `${count} file(s)`),
      );
    }
    const primary = primaryLanguage(ctx);
    for (const det of out) {
      if (det.name === primary) det.detail = "primary language";
    }
    return uniqByName(out);
  },
};