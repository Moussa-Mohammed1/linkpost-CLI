import { describe, expect, it } from "vitest";
import { IgnoreRules } from "../src/core/ignore.js";

describe("IgnoreRules", () => {
  it("ignores default directories", () => {
    const rules = new IgnoreRules();
    rules.addDefaults();
    expect(rules.isIgnored("node_modules/lib/index.js", false)).toBe(true);
    expect(rules.isIgnored("dist/main.js", false)).toBe(true);
    expect(rules.isIgnored(".git/HEAD", false)).toBe(true);
  });

  it("does not ignore normal source files", () => {
    const rules = new IgnoreRules();
    rules.addDefaults();
    expect(rules.isIgnored("src/index.ts", false)).toBe(false);
    expect(rules.isIgnored("package.json", false)).toBe(false);
  });

  it("handles anchored patterns", () => {
    const rules = new IgnoreRules();
    rules.addDefaults();
    rules.push("/foo", "");
    expect(rules.isIgnored("foo", false)).toBe(true);
    expect(rules.isIgnored("src/foo", false)).toBe(false);
  });

  it("handles negation", () => {
    const rules = new IgnoreRules();
    rules.addDefaults();
    rules.push("*.log", "");
    rules.push("!important.log", "");
    expect(rules.isIgnored("app.log", false)).toBe(true);
    expect(rules.isIgnored("important.log", false)).toBe(false);
  });

  it("handles directory-only patterns", () => {
    const rules = new IgnoreRules();
    rules.addDefaults();
    rules.push("build-out/", "");
    expect(rules.isIgnored("build-out", true)).toBe(true);
    expect(rules.isIgnored("build-out/keep.txt", false)).toBe(true); // dir ignored => file too
  });

  it("handles ** globs", () => {
    const rules = new IgnoreRules();
    rules.addDefaults();
    rules.push("dist/**", "");
    expect(rules.isIgnored("dist/a/b/c.js", false)).toBe(true);
    expect(rules.isIgnored("other/a.js", false)).toBe(false);
  });

  it("gives deeper rules precedence over shallower ones", () => {
    const rules = new IgnoreRules();
    rules.addDefaults();
    rules.push("*.ts", "", { baseDepth: 0 });
    rules.push("!*.test.ts", "", { baseDepth: 1 });
    expect(rules.isIgnored("src/foo.ts", false)).toBe(true);
    // the negated deeper rule wins for the file's own directory scope
    const nested = new IgnoreRules();
    nested.addDefaults();
    nested.push("/generated", "");
    expect(nested.isIgnored("generated", true)).toBe(true);
  });
});