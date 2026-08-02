import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { IgnoreRules } from "./ignore.js";
import type { FileSnap } from "./types.js";

export interface WalkOptions {
  /** Root-level ignore rules (defaults + root .gitignore applied). */
  ignore: IgnoreRules;
  /** Do not follow directory symlinks. Defaults to true. */
  skipSymlinks?: boolean;
  /** Hard cap on scanned files (resilience for huge repos). Default 40k. */
  maxFiles?: number;
  /** Hard cap on scanned directories. Default 20k. */
  maxDirs?: number;
}

export interface WalkStats {
  files: number;
  dirs: number;
  bytes: number;
  truncated: boolean;
}

const DEFAULT_MAX_FILES = 40_000;
const DEFAULT_MAX_DIRS = 20_000;

/**
 * Recursively ingest a repository tree. Applies `.gitignore` semantics through
 * an `IgnoreRules` scope that gains rules from each directory's own
 * `.gitignore`, so deeper rules override shallower ones.
 *
 * Emits every non-ignored file and directory as a {@link FileSnap} and returns
 * aggregate {@link WalkStats}.
 */
export async function* walkRepository(
  root: string,
  options: WalkOptions,
): AsyncGenerator<FileSnap, WalkStats, undefined> {
  const skipSymlinks = options.skipSymlinks ?? true;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxDirs = options.maxDirs ?? DEFAULT_MAX_DIRS;

  let files = 0;
  let dirs = 0;
  let bytes = 0;
  let truncated = false;

  interface Task {
    dirRel: string;
    absDir: string;
    rules: IgnoreRules;
  }

  const queue: Task[] = [{ dirRel: "", absDir: root, rules: options.ignore.clone() }];

  while (queue.length > 0) {
    const task = queue.shift()!;
    if (dirs >= maxDirs) {
      truncated = true;
      break;
    }
    dirs++;

    // Skip if this directory itself is ignored by its parent scope.
    if (task.dirRel && task.rules.isIgnored(task.dirRel, true)) continue;

    let handle;
    try {
      handle = await opendir(task.absDir);
    } catch {
      continue; // unreadable dir — skip quietly
    }

    const scope = task.rules.clone();
    // Pull in this directory's own .gitignore for child entries.
    await scope.loadFrom(join(task.absDir, ".gitignore"), task.dirRel);

    for await (const entry of handle) {
      const rel = task.dirRel ? `${task.dirRel}/${entry.name}` : entry.name;
      const isDir = entry.isDirectory();
      const isSymlink = entry.isSymbolicLink();

      if (isDir && skipSymlinks && isSymlink) continue;
      if (!isDir && !isSymlink && !entry.isFile()) continue;

      if (scope.isIgnored(rel, isDir)) continue;

      if (isDir) {
        if (dirs + queue.length >= maxDirs) {
          truncated = true;
          continue;
        }
        queue.push({
          dirRel: rel,
          absDir: join(task.absDir, entry.name),
          rules: scope.clone(),
        });
      } else {
        if (files >= maxFiles) {
          truncated = true;
          continue;
        }
        files++;
        let size = 0;
        try {
          const fsp = await import("node:fs/promises");
          const st = await fsp.stat(join(task.absDir, entry.name));
          size = st.size;
        } catch {
          // failed to stat — treat as tiny
        }
        bytes += size;
        yield {
          absPath: join(task.absDir, entry.name),
          relPath: rel,
          size,
          isDir: false,
        };
      }
    }
  }

  const stats: WalkStats = { files, dirs, bytes, truncated };
  return stats;
}