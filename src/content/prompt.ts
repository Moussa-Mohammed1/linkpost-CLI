import type { ProjectReport } from "../core/types.js";

/**
 * Builds the LLM prompt from the bounded report. Only the per-module summaries
 * and tightly curated facts enter the prompt — never raw source files.
 */
export function buildPrompt(report: ProjectReport): { system: string; user: string } {
  const moduleBlock = report.modules
    .map((m) => `- ${m.name === "root" ? "Project root" : `"${m.name}"`} (${m.relPath || "./"}): ${m.summary}`)
    .join("\n");

  const techBlock = report.technologies.all.length
    ? report.technologies.all.join(", ")
    : "no external tech reliably detected";

  const featuresBlock = report.features.length
    ? report.features.map((f) => `- ${f.name}${f.evidence.length ? ` (${f.evidence.join(", ")})` : ""}`).join("\n")
    : "- (no concrete features detected)";

  const challenges = report.engineeringChallenges.length
    ? report.engineeringChallenges.join("; ")
    : "not specified";

  const decisions = report.engineeringHighlights.length
    ? report.engineeringHighlights.join("; ")
    : "not specified";

  const system = [
    "You are an expert technical writer and senior engineer who writes authentic LinkedIn posts for software projects.",
    "",
    "Rules:",
    "- Base EVERY claim strictly on the facts provided. NEVER invent features, libraries, metrics or outcomes not present in the facts.",
    "- Sound professional, genuine and slightly conversational. Avoid hype words like 'revolutionary', 'insane', 'game-changing'.",
    "- Write in the first person as the developer who built the project.",
    "- Structure: opening hook, project overview, major features (bullets), technologies, an engineering challenge, a lesson learned, a call to action.",
    "- Finish with 5-7 relevant hashtags.",
    "- Output ONLY the post text. No preamble, no code fences.",
    "- Keep the body under roughly 2000 characters.",
  ].join("\n");

  const user = [
    `Project: ${report.projectName}`,
    `Primary languages: ${report.primaryLanguages.join(", ") || "unknown"}`,
    `Architecture: ${report.architecture.join(", ") || "unknown"}`,
    `Business purpose: ${report.businessPurpose}`,
    "",
    `Technologies: ${techBlock}`,
    "",
    `Features:\n${featuresBlock}`,
    "",
    `Module summaries:\n${moduleBlock}`,
    "",
    `Engineering decisions: ${decisions}`,
    `Engineering challenges: ${challenges}`,
    "",
    "Write the LinkedIn post now.",
  ].join("\n");

  return { system, user };
}