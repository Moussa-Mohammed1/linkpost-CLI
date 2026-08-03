import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureGitIgnored, GITIGNORE_ENTRY, GITIGNORE_HEADER } from "../src/core/gitignore.js";
import { generatePost } from "../src/commands/analyze.js";
import { makeTmpProject, npmPackage, isolateConfig } from "./helpers.js";

const sampleFiles = () => ({
  "package.json": npmPackage({ name: "orderly" }),
  "README.md": "Orderly handles batch order syncs.",
  "src/index.ts": "export const x = 1;",
});

describe("ensureGitIgnored", () => {
  it("creates .gitignore with the entry when missing", async () => {
    const proj = await makeTmpProject({});
    try {
      const changed = await ensureGitIgnored(proj.root);
      expect(changed).toBe(true);
      const content = await readFile(join(proj.root, ".gitignore"), "utf8");
      expect(content).toContain(GITIGNORE_HEADER);
      expect(content).toContain(GITIGNORE_ENTRY);
    } finally {
      await proj.cleanup();
    }
  });

  it("appends to an existing .gitignore without touching other rules", async () => {
    const proj = await makeTmpProject({
      ".gitignore": "node_modules/\n*.log\n",
      "package.json": npmPackage({ name: "x" }),
    });
    try {
      const changed = await ensureGitIgnored(proj.root);
      expect(changed).toBe(true);
      const content = await readFile(join(proj.root, ".gitignore"), "utf8");
      expect(content).toContain("node_modules/");
      expect(content).toContain("*.log");
      expect(content).toContain(GITIGNORE_ENTRY);
    } finally {
      await proj.cleanup();
    }
  });

  it("does not duplicate the entry when already ignored", async () => {
    const proj = await makeTmpProject({ ".gitignore": `node_modules/\n${GITIGNORE_ENTRY}\n` });
    try {
      const changed = await ensureGitIgnored(proj.root);
      expect(changed).toBe(false);
      const content = await readFile(join(proj.root, ".gitignore"), "utf8");
      expect(content.match(/linkedin-post/g)).toHaveLength(1);
    } finally {
      await proj.cleanup();
    }
  });

  it("recognizes an entry without a trailing slash", async () => {
    const proj = await makeTmpProject({ ".gitignore": "linkedin-post\n" });
    try {
      expect(await ensureGitIgnored(proj.root)).toBe(false);
    } finally {
      await proj.cleanup();
    }
  });
});

describe("generatePost gitignore integration", () => {
  it("adds linkedin-post/ to .gitignore when generating output", async () => {
    const restore = await isolateConfig();
    const proj = await makeTmpProject(sampleFiles());
    try {
      const result = await generatePost({ cwd: proj.root, templateOnly: true });
      expect(result.ok).toBe(true);
      const content = await readFile(join(proj.root, ".gitignore"), "utf8");
      expect(content).toContain(GITIGNORE_ENTRY);
    } finally {
      await proj.cleanup();
      restore();
    }
  });
});
