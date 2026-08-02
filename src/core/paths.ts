/**
 * Path utilities. The analyzer always works with forward-slash relative paths
 * so pattern matching is identical on Windows, macOS and Linux.
 */

export function normalizeRelPath(rel: string): string {
  return rel.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function relJoin(...parts: string[]): string {
  const joined = parts
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => p.length > 0 && p !== ".")
    .join("/");
  return joined.replace(/\/+/g, "/");
}

/** Splits a relative path into its segments. */
export function pathSegments(relPath: string): string[] {
  return normalizePath(relPath).split("/").filter(Boolean);
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Parent of a relative path ('' at top level). */
export function parentDir(relPath: string): string {
  const idx = relPath.lastIndexOf("/");
  return idx === -1 ? "" : relPath.slice(0, idx);
}

export function basenameOf(relPath: string): string {
  const idx = relPath.lastIndexOf("/");
  return idx === -1 ? relPath : relPath.slice(idx + 1);
}

export function nameOfModule(relPath: string): string {
  const trimmed = relPath.replace(/\/+$/, "");
  if (!trimmed) return "root";
  return basenameOf(trimmed).replace(/[^A-Za-z0-9_-]/g, "");
}