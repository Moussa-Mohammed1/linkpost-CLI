import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TmpProject {
  root: string;
  cleanup(): Promise<void>;
}

/** Creates a temporary project fixture with the given files. */
export async function makeTmpProject(files: Record<string, string>): Promise<TmpProject> {
  const root = await mkdtemp(join(tmpdir(), "post-cli-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, content, "utf8");
  }
  return {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function npmPackage(json: Record<string, unknown>): string {
  return JSON.stringify(json, null, 2);
}

export function gitignoreFixture(): string {
  return [
    "# node artifacts",
    "node_modules/",
    "*.log",
    "!important.log",
    "build-output/",
    "dist/**",
    "",
  ].join("\n");
}