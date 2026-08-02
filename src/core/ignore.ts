import { readFile } from "node:fs/promises";
import { pathSegments } from "./paths.js";

/**
 * Simplified-but-faithful .gitignore matching used to keep the scan fast and
 * scoped. Supports `#` comments, blank lines, negation (`!`), directory-only
 * patterns (`dir/`), anchored patterns (`/foo`), `*`, `?` and `**`.
 */

/** Directory names always skipped during analysis. */
export const DEFAULT_IGNORE_DIRS: readonly string[] = [
  "node_modules",
  "bower_components",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "coverage",
  ".git",
  ".hg",
  ".svn",
  ".cache",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".parcel-cache",
  ".yarn",
  ".pnpm-store",
  ".idea",
  ".vscode",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".gradle",
  "target",
  "bin",
  "obj",
  "tmp",
  "temp",
  "logs",
  ".terraform",
  ".serverless",
  "site-packages",
  "Pods",
  ".dart_tool",
];

/** File names ignored even if present in scanned directories. */
export const DEFAULT_IGNORE_FILES: readonly string[] = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "composer.lock",
  "Gemfile.lock",
  "poetry.lock",
  "Cargo.lock",
  "coverage.lcov",
  "npm-shrinkwrap.json",
  ".DS_Store",
  "Thumbs.db",
];

interface ImmuneRule {
  segs: string[];
  dirOnly: boolean;
  anchored: boolean;
  negated: boolean;
  baseDepth: number;
  order: number;
}

/**
 * A stackable set of gitignore rules with correct override precedence.
 * The walker pushes a fresh scope whenever it descends into a directory with
 * its own `.gitignore`, so deeper rules take precedence over shallower ones.
 */
export class IgnoreRules {
  private rules: ImmuneRule[] = [];
  private orderCounter = 0;

  /** Install default ignore rules at the lowest precedence. */
  addDefaults(): void {
    for (const name of DEFAULT_IGNORE_DIRS) {
      this.push(name, "", { dirOnly: true, baseDepth: -1 });
    }
    for (const name of DEFAULT_IGNORE_FILES) {
      this.push(name, "", { dirOnly: false, baseDepth: -1 });
    }
  }

  /**
   * Parse and register a single raw gitignore pattern.
   * `baseRel` is the relative dir that owns the rule ("" = project root).
   * Pass `dirDepth` explicitly when the base dir is not derivable from `baseRel`.
   */
  push(
    pattern: string,
    baseRel = "",
    opts: { dirOnly?: boolean; baseDepth?: number } = {},
  ): void {
    let body = pattern.trim();
    if (!body || body.startsWith("#")) return;

    let negated = false;
    if (body.startsWith("!")) {
      negated = true;
      body = body.slice(1);
    }
    if (!body) return;

    let dirOnly = opts.dirOnly ?? false;
    let anchored = false;
    if (body.endsWith("/")) {
      dirOnly = true;
      body = body.slice(0, -1);
    }
    if (body.startsWith("/")) {
      anchored = true;
      body = body.slice(1);
    } else if (body.includes("/")) {
      anchored = true;
    }

    const baseDepth =
      opts.baseDepth ?? pathSegments(baseRel).length;
    this.rules.push({
      segs: body.split("/").filter((s) => s !== ""),
      dirOnly,
      anchored,
      negated,
      baseDepth,
      order: this.orderCounter++,
    });
  }

  /** Load every pattern of a `.gitignore` file into these rules. */
  async loadFrom(absPath: string, baseRel: string): Promise<void> {
    let content: string;
    try {
      content = await readFile(absPath, "utf8");
    } catch {
      return;
    }
    for (const line of content.split(/\r?\n/)) {
      this.push(line, baseRel);
    }
  }

  /**
   * Evaluate a relative path. `relPath` uses forward slashes and no `./`
   * prefix; directories need a trailing slash conceptually - pass `isDir`.
   * Returns true (ignored), false (re-included via `!`), or null (unmatched).
   */
  matches(relPath: string, isDir: boolean): boolean | null {
    let result: boolean | null = null;
    let bestScore = -Infinity;
    const segs = pathSegments(relPath);
    for (const rule of this.rules) {
      if (!this.segsMatch(rule, segs, isDir)) continue;
      const score = rule.baseDepth * 100000 + rule.order;
      if (score >= bestScore) {
        bestScore = score;
        result = rule.negated ? false : true;
      }
    }
    return result;
  }

  isIgnored(relPath: string, isDir: boolean): boolean {
    return this.matches(relPath, isDir) === true;
  }

  /** Returns an independent copy sharing current rules (used per-directory). */
  clone(): IgnoreRules {
    const other = new IgnoreRules();
    other.rules = this.rules.map((r) => ({ ...r }));
    other.orderCounter = this.orderCounter;
    return other;
  }

  private segsMatch(rule: ImmuneRule, segs: string[], isDir: boolean): boolean {
    if (rule.dirOnly) {
      // A directory rule matches the dir itself AND everything beneath it.
      if (segs.length < rule.segs.length) return false;
      for (let i = 0; i < rule.segs.length; i++) {
        if (rule.segs[i] !== segs[i]) return false;
      }
      return true;
    }
    if (rule.anchored) {
      return globMatch(rule.segs, 0, segs, 0);
    }
    for (let start = 0; start <= segs.length; start++) {
      if (globMatch(rule.segs, 0, segs, start)) return true;
    }
    return false;
  }
}

function globMatch(
  pat: string[],
  pi: number,
  segs: string[],
  si: number,
  memo = new Map<string, boolean>(),
): boolean {
  const key = `${pi}:${si}`;
  if (memo.has(key)) return memo.get(key)!;
  let out: boolean;
  if (pi === pat.length) {
    out = si === segs.length;
  } else {
    const p = pat[pi]!;
    if (p === "**") {
      out = globMatch(pat, pi + 1, segs, si, memo);
      if (!out && si < segs.length) {
        out = globMatch(pat, pi, segs, si + 1, memo);
      }
    } else if (si < segs.length) {
      out =
        segmentMatch(p, segs[si]!) && globMatch(pat, pi + 1, segs, si + 1, memo);
    } else {
      out = false;
    }
  }
  memo.set(key, out);
  return out;
}

function segmentMatch(pattern: string, value: string): boolean {
  let re = "^";
  for (const c of pattern) {
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += escapeRegexChar(c);
  }
  re += "$";
  return new RegExp(re).test(value);
}

function escapeRegexChar(c: string): string {
  return /[.*+?^${}()|[\]\\]/g.test(c) ? `\\${c}` : c;
}