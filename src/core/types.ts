/**
 * Shared domain types for the post CLI.
 */

export type TechCategory =
  | "language"
  | "frontend-framework"
  | "backend-framework"
  | "database"
  | "orm"
  | "deployment"
  | "docker"
  | "ci-cd"
  | "testing"
  | "authentication"
  | "ai"
  | "cloud"
  | "other";

export interface Detection {
  /** Technology name, e.g. "React". */
  name: string;
  /** Category the technology belongs to. */
  category: TechCategory;
  /** Confidence 0..1 that this technology is really used. */
  confidence: number;
  /** Optional human-readable detail (version, purpose, framework flavor). */
  detail?: string;
  /** Evidence: file path or dependency key that triggered the match. */
  evidence?: string;
}

/** Aggregated, zero-I/O snapshot of a file inside the scanned tree. */
export interface FileSnap {
  /** Absolute path. */
  absPath: string;
  /** Path relative to the project root, always using `/`. */
  relPath: string;
  size: number;
  isDir: boolean;
}

/** High-level view of one module/folder inside the project. */
export interface ModuleInfo {
  /** Relative path of the module root, e.g. `src/` or `.` for root. */
  relPath: string;
  /** Display name derived from the folder name. */
  name: string;
  /** Short, human-summary computed by the summarizer. */
  summary: string;
  /** Language names that dominate the module. */
  languages: string[];
  /** Number of source files considered. */
  fileCount: number;
  /** Estimated lines of source code. */
  estimatedLoc: number;
  /** Key technical signals (APIs, entry points, interesting files). */
  highlights: string[];
}

export interface TechnologyInventory {
  /** Map of category -> de-duplicated technology names. */
  byCategory: Partial<Record<TechCategory, string[]>>;
  /** Flattened, de-duplicated list of all technologies. */
  all: string[];
}

export interface Feature {
  name: string;
  confidence: number;
  evidence: string[];
}

export interface ProjectReport {
  /** Absolute project root. */
  root: string;
  projectName: string;
  /** Primary languages of the project. */
  primaryLanguages: string[];
  /** Detected and grouped technology inventory. */
  technologies: TechnologyInventory;
  /** Architecture descriptors, e.g. "REST API", "Monorepo". */
  architecture: string[];
  /** Per-module summaries (computed before the global summary is created). */
  modules: ModuleInfo[];
  /** Business purpose inferred from README, naming, dependencies. */
  businessPurpose: string;
  /** Feature highlights backed by evidence. */
  features: Feature[];
  /** Interesting engineering decisions observed. */
  engineeringHighlights: string[];
  /** Signals of engineering challenges. */
  engineeringChallenges: string[];
  /** Relative paths to notable files (entrypoints, routers, README). */
  notableFiles: string[];
  /** ISO timestamp when the report was created. */
  generatedAt: string;
}

/** Final generated LinkedIn content. */
export interface GeneratedContent {
  text: string;
  hashtags: string[];
  summary: string;
  provider: string;
  model?: string;
}

export interface RunMetadata {
  projectName: string;
  projectRoot: string;
  generatedAt: string;
  technologies: TechnologyInventory;
  primaryLanguages: string[];
  architecture: string[];
  modules: ModuleInfo[];
  businessPurpose: string;
  hashtags: string[];
  summary: string;
  llmProvider: string;
  llmModel?: string;
}

export interface CliResult {
  ok: boolean;
  outputDir?: string;
  error?: string;
}