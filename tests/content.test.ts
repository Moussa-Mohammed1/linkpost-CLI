import { describe, expect, it } from "vitest";
import { generateContent, sanitize, extractHashtags, suggestHashtags } from "../src/content/generate.js";
import { templatePost } from "../src/content/template.js";
import { buildPrompt } from "../src/content/prompt.js";
import type { ProjectReport } from "../src/core/types.js";

function sampleReport(): ProjectReport {
  return {
    root: "/tmp/foo",
    projectName: "weather-api",
    primaryLanguages: ["TypeScript", "Go"],
    technologies: {
      byCategory: {
        language: ["TypeScript", "Go"],
        backend: ["Express"],
        testing: ["Vitest"],
      },
      all: ["TypeScript", "Go", "express", "Vitest"],
    },
    architecture: ["Client–server (UI + API)"],
    modules: [
      {
        relPath: "src",
        name: "src",
        summary: "20 file(s), ~1200 lines of code. mainly TypeScript. ~6 HTTP/API endpoints.",
        languages: ["TypeScript"],
        fileCount: 20,
        estimatedLoc: 1200,
        highlights: [],
      },
    ],
    businessPurpose: "A tiny API that aggregates weather forecasts for 30 cities.",
    features: [
      { name: "REST API backend", confidence: 0.9, evidence: ["express"] },
      { name: "Automated test suite", confidence: 0.9, evidence: ["vitest"] },
    ],
    engineeringHighlights: ["TypeScript with strict typing", "CI via GitHub Actions"],
    engineeringChallenges: ["Slimming a single container image"],
    notableFiles: ["src/index.ts", "src/server.ts"],
    generatedAt: new Date().toISOString(),
  };
}

describe("generateContent (fallback)", () => {
  it("produces a non-empty templated post without an LLM provider", async () => {
    const content = await generateContent(sampleReport(), {});
    expect(content.text.length).toBeGreaterThan(200);
    expect(content.provider).toBe("template");
    expect(content.hashtags.length).toBeGreaterThan(0);
    expect(content.text).toContain("weather-api");
    expect(content.text).toContain("TypeScript");
  });

  it("uses a provider result when one is available", async () => {
    const fake = {
      id: "fake",
      model: "fake-1",
      complete: async () => "My post body.\n\n#buildinpublic #testing",
    };
    const content = await generateContent(sampleReport(), { provider: fake });
    expect(content.provider).toBe("fake");
    expect(content.model).toBe("fake-1");
    expect(content.text).toBe("My post body.\n\n#buildinpublic #testing");
    expect(content.hashtags).toEqual(["#buildinpublic", "#testing"]);
  });

  it("falls back to the template when the LLM throws", async () => {
    const failing = {
      id: "fake-broken",
      complete: async () => {
        throw new Error("boom");
      },
    };
    const notes: string[] = [];
    const content = await generateContent(sampleReport(), { provider: failing, onNote: (m) => notes.push(m) });
    expect(content.provider).toBe("template");
    expect(notes.join(" ")).toContain("boom");
  });
});

describe("templatePost", () => {
  it("appends the hashtag line and cites facts", async () => {
    const { text, hashtags } = templatePost(sampleReport());
    expect(text).toContain("weather-api");
    expect(text.split("\n").pop()?.trim().startsWith("#")).toBe(true);
    expect(hashtags.length).toBeGreaterThan(1);
    expect(text.length).toBeLessThan(3000);
  });
});

describe("sanitize", () => {
it("strips code fences and leading model chatter", () => {
    const cleaned = sanitize("```markdown\nHere's your post:\nSomeone walked a dog.\n```");
    expect(cleaned).not.toContain("```");
    expect(/here'?s your post/i.test(cleaned)).toBe(false);
    expect(cleaned.length).toBeGreaterThan(0);
  });

  it("caps very long LLM output", () => {
    expect(sanitize("a".repeat(5000)).length).toBeLessThanOrEqual(2600);
  });
});

describe("extractHashtags / suggestHashtags", () => {
  it("extracts trailing hashtags", () => {
    expect(extractHashtags("Body here.\n\n#buildinpublic #typescript")).toEqual([
      "#buildinpublic",
      "#typescript",
    ]);
  });

  it("suggests hashtags from report facts", () => {
    const tags = suggestHashtags(sampleReport());
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.join(" ")).toMatch(/#typescript/);
  });
});

describe("buildPrompt", () => {
  it("carries the bounded report data", () => {
    const { system, user } = buildPrompt(sampleReport());
    expect(user).toContain("weather-api");
    expect(user).toContain("src");
    expect(user).toContain("express");
    expect(system).toContain("NEVER invent");
  });
});