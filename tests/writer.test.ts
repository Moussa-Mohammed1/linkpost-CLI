import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeOutput } from "../src/output/writer.js";
import type { GeneratedContent, ProjectReport } from "../src/core/types.js";

function report(): ProjectReport {
  return {
    root: "/tmp/x",
    projectName: "demo-app",
    primaryLanguages: ["TypeScript"],
    technologies: {
      byCategory: { language: ["TypeScript"], testing: ["Vitest"] },
      all: ["TypeScript", "Vitest"],
    },
    architecture: ["Backend service"],
    modules: [
      {
        relPath: "src",
        name: "src",
        summary: "10 files, 500 lines, mainly TypeScript.",
        languages: ["TypeScript"],
        fileCount: 10,
        estimatedLoc: 500,
        highlights: [],
      },
    ],
    businessPurpose: "A demo backend service.",
    features: [],
    engineeringHighlights: [],
    engineeringChallenges: [],
    notableFiles: ["src/index.ts"],
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function content(): GeneratedContent {
  return {
    text: "# A demo post\n\nSome content.\n\n#hashtag1 #hashtag2",
    hashtags: ["#hashtag1", "#hashtag2"],
    summary: "A demo backend service.",
    provider: "template",
  };
}

describe("writeOutput", () => {
  it("creates the full linkedin-post/ bundle with an empty images/ dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "post-out-"));
    try {
      const outDir = join(dir, "linkedin-post");
      const written = await writeOutput({ dir: outDir, report: report(), content: content(), logText: "[info] done" });

      const files = await readdir(outDir);
      expect(files).toEqual(expect.arrayContaining(["content.txt", "metadata.json", "logs.txt", "images"]));

      const images = await readdir(join(outDir, "images"));
      expect(images).toHaveLength(0);

      expect(written).toContain(join(outDir, "content.txt"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps existing images so `post publish` can use them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "post-out-"));
    try {
      const outDir = join(dir, "linkedin-post");
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir(join(outDir, "images"), { recursive: true });
      await writeFile(join(outDir, "images", "demo.png"), "fake", "binary");

      await writeOutput({ dir: outDir, report: report(), content: content(), logText: "log" });

      const images = await readdir(join(outDir, "images"));
      expect(images).toEqual(["demo.png"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});