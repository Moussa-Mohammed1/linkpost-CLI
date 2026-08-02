import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";

/**
 * Marker files that indicate the current directory is a software project.
 */
export const PROJECT_MARKERS: readonly string[] = [
  ".git",
  "package.json",
  "composer.json",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "pubspec.yaml",
  "Gemfile",
  "Brewfile",
  "mix.exs",
  "rebar.config",
  "*.csproj",
  "*.sln",
  "gradlew",
  "Podfile",
  "Makefile",
  "CMakeLists.txt",
  "meson.build",
  "dub.json",
  "tsconfig.json",
];

export interface ProjectMarkers {
  markers: string[];
}

export function isProjectDirectory(root: string): boolean {
  return existsSync(join(root, ".git"));
}

/**
 * Returns the marker files present in `root`. Globs are resolved via
 * a shallow directory listing of the root.
 */
export async function detectProjectMarkers(
  root: string,
  fsap?: typeof import("node:fs/promises"),
): Promise<ProjectMarkers> {
  const found: string[] = [];
  for (const marker of PROJECT_MARKERS) {
    if (marker.includes("*")) {
      continue; // resolved by the glob pass below
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await access(join(root, marker));
      found.push(marker);
    } catch {
      // not present
    }
  }
  try {
    const dirents = await (fsap ?? (await import("node:fs/promises"))).readdir(
      root,
      { withFileTypes: true },
    );
    for (const ent of dirents) {
      if (ent.isFile() && /\.(csproj|sln)$/i.test(ent.name)) {
        found.push(ent.name);
      }
    }
  } catch {
    // directory unreadable - markers already determined
  }
  return { markers: found };
}

export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectValidationError";
  }
}

/**
 * Step 1 - Validate the project. Throws a friendly ProjectValidationError when
 * the current directory does not look like a software project.
 */
export async function validateProject(root: string): Promise<void> {
  let statErr: Error | undefined;
  try {
    const ap = await import("node:fs/promises");
    const st = await ap.stat(root);
    if (!st.isDirectory()) {
      throw new ProjectValidationError(
        `"${root}" is not a directory.\nRun \`post\` inside a software project folder.`,
      );
    }
  } catch (err) {
    if (err instanceof ProjectValidationError) throw err;
    statErr = err as Error;
  }
  if (statErr) {
    throw new ProjectValidationError(
      `Cannot read "${root}": ${statErr.message}\nRun \`post\` inside a software project folder.`,
    );
  }

  const { markers } = await detectProjectMarkers(root);
  if (markers.length === 0) {
    throw new ProjectValidationError(
      [
        `No software project markers were found in "${root}".`,
        "",
        "I look for things like: package.json, pyproject.toml, Cargo.toml, go.mod,",
        ".git, pom.xml, build.gradle, composer.json, requirements.txt, ...",
        "",
        "Move into your project directory and run `post` again.",
      ].join("\n"),
    );
  }
}