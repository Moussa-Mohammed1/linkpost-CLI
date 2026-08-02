import type { FileSnap } from "../core/types.js";

/** Top-level folders expanded into individual modules when present. */
const CONTAINER_DIRS = new Set(["packages", "apps", "services", "modules", "libs", "components"]);

/** Hidden/irrelevant top-level folders never treated as modules. */
const SKIP_DIRS = new Set([
  ".git",
  ".github",
  ".vscode",
  ".idea",
  ".husky",
  "coverage",
  "node_modules",
  "dist",
  "build",
  "target",
  "obj",
  "bin",
  "vendor",
  "tmp",
  "temp",
  "logs",
  ".next",
  ".cache",
  ".yarn",
  ".config",
]);

export interface DiscoveredModule {
  relPath: string;
  name: string;
  files: FileSnap[];
}

/**
 * Splits the scanned file tree into a bounded list of modules. Containers like
 * `packages/`/`apps/` are expanded into their children; other top-level folders
 * become modules; root-level files (config, README) form the "root" module.
 */
export function discoverModules(files: FileSnap[], maxModules = 10): DiscoveredModule[] {
  const rootFiles: FileSnap[] = [];
  const byDir = new Map<string, FileSnap[]>();

  for (const file of files) {
    const slash = file.relPath.indexOf("/");
    if (slash === -1) {
      rootFiles.push(file);
      continue;
    }
    const first = file.relPath.slice(0, slash);
    byDir.set(first, byDir.get(first) ?? []);
    byDir.get(first)!.push(file);
  }

  const modules: DiscoveredModule[] = [];
  const registry = new Map<string, FileSnap[]>();

  const addModule = (relPath: string, memberFiles: FileSnap[]): void => {
    if (memberFiles.length === 0) return;
    const existing = registry.get(relPath);
    if (existing) {
      existing.push(...memberFiles);
    } else {
      registry.set(relPath, [...memberFiles]);
    }
  };

  for (const [dir, dirFiles] of byDir) {
    if (SKIP_DIRS.has(dir)) continue;

    if (CONTAINER_DIRS.has(dir)) {
      // group by second segment
      const children = new Map<string, FileSnap[]>();
      for (const f of dirFiles) {
        const rest = f.relPath.slice(dir.length + 1);
        const second = rest.indexOf("/");
        const child = second === -1 ? rest : rest.slice(0, second);
        children.set(child, children.get(child) ?? []);
        children.get(child)!.push(f);
      }
      if (children.size >= 2) {
        let added = 0;
        for (const [child, childFiles] of children) {
          if (added >= maxModules) break;
          addModule(`${dir}/${child}`, childFiles);
          added++;
        }
      } else {
        addModule(dir, dirFiles);
      }
    } else {
      addModule(dir, dirFiles);
    }
  }

  if (rootFiles.length > 0) {
    addModule("", rootFiles);
  }

  // sort by estimated size (number of files), name secondarily; cap result
  const sorted = [...registry.entries()]
    .map(([relPath, memberFiles]) => ({
      relPath,
      name: relPath ? relPath.split("/").pop() ?? relPath : "root",
      files: memberFiles,
    }))
    .sort((a, b) => b.files.length - a.files.length)
    .slice(0, maxModules);

  // stable order: root first, then alphabetic
  sorted.sort((a, b) => {
    if (a.relPath === "") return -1;
    if (b.relPath === "") return 1;
    return a.relPath.localeCompare(b.relPath);
  });
  return sorted;
}