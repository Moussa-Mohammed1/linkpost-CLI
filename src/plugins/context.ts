import { readFile } from "node:fs/promises";
import type { FileSnap } from "../core/types.js";
import type { PluginContext } from "./types.js";

const MANIFEST_FILES = [
  "composer.json",
  "requirements.txt",
  "pyproject.toml",
  "Gemfile",
  "pubspec.yaml",
  "Cargo.toml",
  "build.gradle",
  "build.gradle.kts",
] as const;

export interface ContextOptions {
  cwd: string;
  files: FileSnap[];
  /** Cap for manifest reads (e.g. huge package.json or lockfiles). */
  maxManifestBytes?: number;
}

export function normalizeModuleName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9._/-]/g, "");
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Best-effort extraction of dependency-looking tokens from a manifest text.
 * Heuristics per file shape — not exhaustive, no SPDX resolution.
 */
export function extractDependencyTokens(manifest: string, text: string): string[] {
  const out = new Set<string>();
  const lines = text.split(/\r?\n/);
  const normalized = (m: string) => m.trim().toLowerCase();

  if (manifest === "requirements.txt" || manifest === "pyproject.toml") {
    for (const raw of lines) {
      const t = raw.trim();
      if (!t || t.startsWith("#") || t.startsWith("-") || t.startsWith("git+") || t.startsWith("http")) continue;
      if (t.startsWith("[") && t.includes("dependencies")) continue;
      // strip extras like flask[async]
      let name = t.split(/[({[]/)[0]?.trim();
      if (name) {
        name = name.split(/[<>=~!]/)[0]?.trim() ?? name.trim();
        if (name) out.add(normalized(name));
      }
    }
  } else if (manifest === "Gemfile") {
    for (const raw of lines) {
      for (const m of raw.matchAll(/(?:gem|source)\s+['"]([a-zA-Z0-9_./-]+)/g)) {
        if (m[1]) out.add(m[1].toLowerCase());
      }
    }
  } else if (manifest === "build.gradle" || manifest === "build.gradle.kts") {
    for (const raw of lines) {
      for (const m of raw.matchAll(/(?:implementation|api|compile)\s+['"]([a-zA-Z0-9_.-]+):([a-zA-Z0-9_.-]+)/g)) {
        out.add(`${m[1]?.toLowerCase()}:${m[2]?.toLowerCase()}`);
      }
    }
  } else if (manifest === "composer.json") {
    try {
      const j = JSON.parse(text) as Record<string, Record<string, string>>;
      for (const group of ["require", "require-dev"] as const) {
        const obj = j[group];
        if (obj) for (const k of Object.keys(obj)) out.add(k.toLowerCase());
      }
    } catch {
      // unparsable composer.json — ignore
    }
  } else if (manifest === "Cargo.toml") {
    for (const m of text.matchAll(/^([a-zA-Z0-9_-]+)\s*=/gm)) {
      if (m[1] && !/[\[(]/.test(m[1])) out.add(m[1].toLowerCase());
    }
  } else if (manifest === "pubspec.yaml") {
    for (const m of text.matchAll(/^\s{2}([a-zA-Z0-9_-]+):\s/gm)) {
      if (m[1]) out.add(m[1].toLowerCase());
    }
  } else if (manifest === "package.json") {
    try {
      const j = JSON.parse(text) as Record<string, Record<string, string>>;
      for (const group of ["dependencies", "devDependencies", "peerDependencies"] as const) {
        const obj = j[group];
        if (obj) for (const k of Object.keys(obj)) out.add(normalizeModuleName(k));
      }
    } catch {
      // ignore
    }
  }
  return [...out];
}

/**
 * Builds a {@link PluginContext} shared by every analyzer plugin. Manifest
 * files are read and indexed once, then cached for the lifetime of the run.
 */
export async function buildContext(opts: ContextOptions): Promise<PluginContext> {
  const cap = opts.maxManifestBytes ?? 64 * 1024;
  const filesOnly = opts.files.filter((f) => !f.isDir);
  const byPath = new Map<string, FileSnap>();
  for (const f of filesOnly) byPath.set(f.relPath, f);

  const textCache = new Map<string, string>();
  const readText = async (relPath: string): Promise<string> => {
    const cached = textCache.get(relPath);
    if (cached !== undefined) return cached;
    const snap = byPath.get(relPath);
    if (!snap) return "";
    try {
      const buf = await readFile(snap.absPath, "utf8");
      const text = buf.length > cap ? buf.slice(0, cap) : buf;
      textCache.set(relPath, text);
      return text;
    } catch {
      return "";
    }
  };

  const depNames = new Set<string>();
  const devNames = new Set<string>();
  const addPkgObj = (obj: Record<string, unknown> | undefined, dev: boolean): void => {
    if (!obj) return;
    for (const key of Object.keys(obj)) {
      const n = normalizeModuleName(key);
      depNames.add(n);
      if (dev) devNames.add(n);
    }
  };

  const pkgJsonText = await readText("package.json");
  let pkg: Record<string, unknown> | undefined;
  if (pkgJsonText) {
    try {
      pkg = JSON.parse(pkgJsonText) as Record<string, unknown>;
    } catch {
      pkg = undefined;
    }
  }
  const pkgAny = pkg as Record<string, Record<string, unknown>> | undefined;
  addPkgObj(pkgAny?.dependencies, false);
  addPkgObj(pkgAny?.devDependencies, true);
  addPkgObj(pkgAny?.peerDependencies, false);

  for (const name of MANIFEST_FILES) {
    const text = await readText(name);
    if (!text) continue;
    for (const token of extractDependencyTokens(name, text)) {
      depNames.add(normalizeModuleName(token));
    }
  }

  return {
    root: opts.cwd,
    files: filesOnly,
    hasFile: (rel) => byPath.has(rel),
    hasAnyFile: (...rels) => rels.some((r) => byPath.has(r)),
    hasExtension: (ext) => {
      const e = ext.startsWith(".") ? ext : `.${ext}`;
      const lower = e.toLowerCase();
      return filesOnly.some((f) => f.relPath.toLowerCase().endsWith(lower));
    },
    hasGlob(glob) {
      const re = new RegExp("^" + glob.split("*").map(esc).join("[^/]*") + "$");
      return filesOnly.some((f) => re.test(f.relPath));
    },
    readText,
    pkg,
    hasModule(name) {
      const raw = name.trim().toLowerCase();
      const n = normalizeModuleName(raw);
      if (depNames.has(n)) return true;
      // Gradle coordinates: "org.springframework.boot:spring-boot-starter-web"
      for (const dep of depNames) {
        if (dep === n) return true;
        if (dep.startsWith(`${n}:`) || n.startsWith(`${dep}:`)) return true;
      }
      // Wildcard prefix (e.g. "@aws-sdk/*", "@google-cloud/*")
      if (n.endsWith("/") || n.endsWith("/*")) {
        const prefix = n.replace(/\/\*?$/, "/");
        for (const dep of depNames) {
          if (dep.startsWith(prefix)) return true;
        }
      }
      return false;
    },
    modules(kind) {
      if (kind === "dev") return [...devNames];
      if (kind === "dependencies") return [...depNames].filter((n) => !devNames.has(n));
      return [...depNames];
    },
  } satisfies PluginContext;
}