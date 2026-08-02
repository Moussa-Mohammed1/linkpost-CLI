import type { Detection, FileSnap } from "../core/types.js";

/**
 * A small, zero-heavy facade exposed to every analyzer plugin. Plugins never
 * touch the filesystem directly; they consume the pre-indexed snapshots and
 * small manifest caches for portable, fast, testable detection.
 */
export interface PluginContext {
  /** Absolute project root. */
  root: string;
  /** Every non-ignored file in the tree (files only, no dirs here). */
  files: FileSnap[];

  /** True when a file with the exact relative path exists. */
  hasFile(relPath: string): boolean;
  /** True when any of the listed relative paths exists. */
  hasAnyFile(...relPaths: string[]): boolean;
  /** True when the tree contains at least one file with this extension (no dot → added). */
  hasExtension(ext: string): boolean;
  /** True when any relative path matches a fnmatch-style glob. */
  hasGlob(glob: string): boolean;

  /** Read a small text file (capped), never throws; '' when missing/unreadable. */
  readText(relPath: string, maxBytes?: number): Promise<string>;

  /** Parsed `package.json` (dependencies merged) if present. */
  pkg?: Record<string, unknown>;

  /**
   * True when a dependency/module name appears in package.json, composer.json,
   * requirements.txt, pyproject.toml, Gemfile, pubspec.yaml, Cargo.toml or
   * build.gradle. Matching is normalized (lowercase, scopes like
   * `@nestjs/core` match on `nestjs/core`).
   */
  hasModule(name: string): boolean;

  /** Names of all modules discovered in manifests (excludes dev-only). */
  modules(kind?: "all" | "dependencies" | "dev"): string[];
}

/** A descriptor emitted by a plugin. Normalizes the site surface for the UI. */
export interface TechReport extends Detection {}

/** An analyzer plugin. Loaded and run by the plugin registry. */
export interface AnalyzerPlugin {
  readonly id: string;
  readonly title?: string;
  /** Human description shown in debug/verbose output. */
  readonly description?: string;
  /** Run detection against the context. Must not throw. */
  detect(ctx: PluginContext): Promise<Detection[]> | Detection[];
}

/** Factory used for custom user plugins. */
export interface PluginFactoryArgs {
  cwd?: string;
}

export type PluginFactory = (args?: PluginFactoryArgs) => AnalyzerPlugin | Promise<AnalyzerPlugin>;

/** Namespaces used to group detections in results. */
export enum PluginNamespace {
  Language = "language",
  Framework = "framework",
  Data = "data",
  Tooling = "tooling",
}