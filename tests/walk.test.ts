import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { walkRepository } from "../src/core/walk.js";
import { IgnoreRules } from "../src/core/ignore.js";
import { makeTmpProject } from "./helpers.js";
import type { FileSnap } from "../src/core/types.js";

async function walk(root: string, extraGitignore: string): Promise<FileSnap[]> {
  const ignore = new IgnoreRules();
  ignore.addDefaults();
  if (extraGitignore) {
    await writeFile(join(root, ".gitignore"), extraGitignore, "utf8");
  }
  const files: FileSnap[] = [];
  for await (const snap of walkRepository(root, { ignore })) files.push(snap);
  return files;
}

describe("walkRepository", () => {
  it("skips default-ignored dirs and files", async () => {
    const proj = await makeTmpProject({
      "src/index.ts": "export const a = 1;",
      "node_modules/dep/index.js": "fake",
      "dist/bundle.js": "bundled",
      "hidden.ts": "x",
    });
    try {
      const rels = (await walk(proj.root, "")).map((f) => f.relPath).sort();
      expect(rels).toContain("src/index.ts");
      expect(rels).toContain("hidden.ts");
      expect(rels).not.toContain("node_modules/dep/index.js");
      expect(rels).not.toContain("dist/bundle.js");
    } finally {
      await proj.cleanup();
    }
  });

  it("honors root .gitignore plus negation", async () => {
    const proj = await makeTmpProject({
      "a.log": "x",
      "important.log": "y",
      "src/keep.ts": "code",
    });
    try {
      const rels = (await walk(proj.root, "*.log\n!important.log\n")).map((f) => f.relPath).sort();
      expect(rels).toContain("important.log");
      expect(rels).not.toContain("a.log");
      expect(rels).toContain("src/keep.ts");
    } finally {
      await proj.cleanup();
    }
  });

  it("applies nested .gitignore scopes", async () => {
    const proj = await makeTmpProject({
      "src/.gitignore": "secret.ts\n",
      "src/secret.ts": "x",
      "src/ok.ts": "x",
      "top.txt": "x",
    });
    try {
      const rels = (await walk(proj.root, "")).map((f) => f.relPath).sort();
      expect(rels).toContain("src/ok.ts");
      expect(rels).toContain("src/.gitignore");
      expect(rels).not.toContain("src/secret.ts");
    } finally {
      await proj.cleanup();
    }
  });
});