import type { ProjectReport } from "../core/types.js";

/**
 * Deterministic fallback post generator used when no LLM provider is
 * configured or the LLM call fails. Every claim comes straight from the
 * analysis report — nothing is invented.
 */
export function templatePost(report: ProjectReport): { text: string; hashtags: string[] } {
  const langs = report.primaryLanguages.join(", ") || "several languages";
  const arch = report.architecture.join(", ") || "a focused codebase";
  const purpose = trimToPlain(report.businessPurpose);
  const techList = report.technologies.all.length
    ? report.technologies.all.slice(0, 14).join(", ")
    : langs;

  const featureBullets = report.features.length
    ? report.features
        .map((f) => `• ${f.name}`)
        .slice(0, 6)
        .join("\n")
    : "";

  const decisions = report.engineeringHighlights.length
    ? report.engineeringHighlights.slice(0, 3).map((h) => `• ${h}`).join("\n")
    : "";

  const challenge =
    report.engineeringChallenges[0] ?? "turning an idea into a maintainable codebase";

  const moduleNames = report.modules
    .filter((m) => m.name !== "root")
    .map((m) => m.name)
    .filter((n) => n)
    .slice(0, 4)
    .join(", ");

  const lines: string[] = [];
  lines.push(`I've been working on ${report.projectName} — ${purpose}`, "");
  lines.push(`It's ${arch}, written in ${langs}.`, "");
  if (featureBullets) {
    lines.push("What it does:", featureBullets, "");
  }
  lines.push(`Tech highlights: ${techList}.`, "");
  if (decisions) {
    lines.push("A few engineering decisions I'm glad we made:", decisions, "");
  }
  lines.push(
    `The hardest part was ${challenge}.`,
    "",
    "Worth it. The biggest lesson: good architecture compounds — invest in typing, tests, and simple seams early; it pays off within weeks.",
  );
  if (moduleNames) {
    lines.push("", `Quick tour of the structure: ${moduleNames}.`);
  }
  lines.push("", "Open to feedback and ideas. What would you build on top of this?");

  const hashtags = buildHashtags(report);
  const body = lines.join("\n").replace(/[ \t]+\n/g, "\n").trim();
  const text = `${body}\n\n${hashtags.join(" ")}`;
  return { text, hashtags };
}

function buildHashtags(report: ProjectReport): string[] {
  const tags = new Set<string>(["#buildinpublic", "#softwareengineering", "#developers"]);
  for (const lang of report.primaryLanguages) {
    const clean = lang.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (clean) tags.add(`#${clean}`);
  }
  for (const feature of report.features) {
    if (/(^|[^a-z])ai/i.test(feature.name) || /machine/i.test(feature.name)) tags.add("#ai");
    if (/auth/i.test(feature.name)) tags.add("#security");
    if (/test|coverage/i.test(feature.name)) tags.add("#quality");
    if (/database|data/i.test(feature.name)) tags.add("#databases");
  }
  for (const tech of report.technologies.all) {
    if (/React|Vue|Angular|Svelte|Next/i.test(tech)) tags.add("#frontend");
    if (/Node|Express|Fastify|NestJS/i.test(tech)) tags.add("#backend");
    if (/AWS|GCP|Azure|Vercel|Netlify/i.test(tech)) tags.add("#cloud");
    if (/Docker/i.test(tech)) tags.add("#devops");
  }
  return [...tags].slice(0, 8);
}

function trimToPlain(text: string): string {
  return text.replace(/[#*_`]/g, "").replace(/\s+/g, " ").trim() || "a software project";
}