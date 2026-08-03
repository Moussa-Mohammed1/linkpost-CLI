import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TmpProject {
  root: string;
  cleanup(): Promise<void>;
}

/**
 * Points POST_CONFIG_DIR at a fresh empty temp dir so tests never touch (or
 * depend on) the real ~/.post/config.json. Returns a restore callback.
 */
export async function isolateConfig(): Promise<() => void> {
  const dir = await mkdtemp(join(tmpdir(), "post-cli-config-"));
  const saved = process.env.POST_CONFIG_DIR;
  process.env.POST_CONFIG_DIR = dir;
  return () => {
    if (saved === undefined) delete process.env.POST_CONFIG_DIR;
    else process.env.POST_CONFIG_DIR = saved;
    rm(dir, { recursive: true, force: true }).catch(() => {});
  };
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