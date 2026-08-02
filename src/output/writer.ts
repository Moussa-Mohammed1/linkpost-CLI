import { mkdir, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GeneratedContent, ProjectReport } from "../core/types.js";

export interface WriteInput {
  /** Output directory (e.g. `<cwd>/linkedin-post`). */
  dir: string;
  report: ProjectReport;
  content: GeneratedContent;
  logText: string;
}

export interface RunMeta {
  projectName: string;
  projectRoot: string;
  generatedAt: string;
  technologies: {
    categories: Record<string, string[]>;
    all: string[];
  };
  primaryLanguages: string[];
  architecture: string[];
  modules: Array<{ name: string; path: string; files: number; loc: number; summary: string }>;
  businessPurpose: string;
  hashtags: string[];
  summary: string;
  llmProvider: string;
  llmModel?: string;
  outputFiles: string[];
}

/**
 * Step 6 — creates the `linkedin-post/` output bundle and returns written paths.
 */
export async function writeOutput(input: WriteInput): Promise<string[]> {
  const { dir, report, content, logText } = input;
  await mkdir(dir, { recursive: true });

  const contentFile = join(dir, "content.txt");
  const logFile = join(dir, "logs.txt");
  const metaFile = join(dir, "metadata.json");
  const imagesDir = join(dir, "images");

  await mkdir(imagesDir, { recursive: true });

  await writeFile(contentFile, `${content.text.trim()}\n`, "utf8");
  await writeFile(logFile, logText.endsWith("\n") ? logText : `${logText}\n`, "utf8");

  const meta: RunMeta = {
    projectName: report.projectName,
    projectRoot: report.root,
    generatedAt: report.generatedAt,
    technologies: {
      categories: report.technologies.byCategory as Record<string, string[]>,
      all: report.technologies.all,
    },
    primaryLanguages: report.primaryLanguages,
    architecture: report.architecture,
    modules: report.modules.map((m) => ({
      name: m.name,
      path: m.relPath || "./",
      summary: m.summary,
      loc: m.estimatedLoc,
      files: m.fileCount,
    })),
    businessPurpose: report.businessPurpose,
    hashtags: content.hashtags,
    summary: content.summary,
    llmProvider: content.provider,
    ...(content.model ? { llmModel: content.model } : {}),
    outputFiles: [
      "content.txt",
      "metadata.json",
      "logs.txt",
      "images/",
    ],
  };

  await writeFile(metaFile, JSON.stringify(meta, null, 2) + "\n", "utf8");
  return [contentFile, logFile, metaFile, imagesDir];
}

/** Helper to resolve an existing output bundle dir from a cwd. */
export function findOutputDir(cwd: string): string {
  const candidate = join(cwd, "linkedin-post");
  return candidate;
}

/** Reads a text file with graceful error handling ('' on error). */
export async function readTextFileStrict(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

/** Ensures the images directory exists; creates it when missing. */
export async function ensureImagesDir(dir: string): Promise<void> {
  const { mkdir: make } = await import("node:fs/promises");
  await make(join(dir, "images"), { recursive: true });
}