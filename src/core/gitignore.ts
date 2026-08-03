import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const GITIGNORE_ENTRY = "linkedin-post/";
export const GITIGNORE_HEADER = "# post CLI generated output";

/**
 * Ensures `<cwd>/.gitignore` ignores the generated `linkedin-post/` folder.
 * Creates the file when missing, appends when absent, never duplicates.
 * Returns true when the file was modified.
 */
export async function ensureGitIgnored(cwd: string): Promise<boolean> {
  const gitignorePath = join(cwd, ".gitignore");
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf8");
  } catch {
    // no .gitignore yet — will create it
  }

  const lines = content.split(/\r?\n/);
  const hasEntry = lines.some((l) => {
    const t = l.trim();
    return t === GITIGNORE_ENTRY || t === "linkedin-post";
  });
  if (hasEntry) return false;

  const additions: string[] = [];
  if (!lines.some((l) => l.trim() === GITIGNORE_HEADER)) additions.push(GITIGNORE_HEADER);
  additions.push(GITIGNORE_ENTRY);

  const suffix = content === "" || content.endsWith("\n") ? "" : "\n";
  await writeFile(gitignorePath, `${content}${suffix}${additions.join("\n")}\n`, "utf8");
  return true;
}
