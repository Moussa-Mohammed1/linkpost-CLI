import type { GeneratedContent, ProjectReport } from "../core/types.js";
import type { LlmProvider } from "../llm/provider.js";
import { buildPrompt } from "./prompt.js";
import { templatePost } from "./template.js";

const MAX_CHARS = 2600;

export interface GenerateOptions {
  provider?: LlmProvider;
  onNote?: (message: string) => void;
}

/**
 * Generates the final LinkedIn post. Prefers the configured LLM provider,
 * falling back to the deterministic template on any failure so the CLI always
 * produces output.
 */
export async function generateContent(
  report: ProjectReport,
  opts: GenerateOptions = {},
): Promise<GeneratedContent> {
  const { onNote } = opts;

  if (opts.provider) {
    try {
      const { system, user } = buildPrompt(report);
      const raw = await opts.provider.complete({ system, prompt: user, maxTokens: 1200 });
      const cleaned = sanitize(raw);
      if (cleaned.length > 0) {
        const hashtags = extractHashtags(cleaned);
        return {
          text: cleaned,
          hashtags: hashtags.length ? hashtags : suggestHashtags(report),
          summary: report.businessPurpose,
          provider: opts.provider.id,
          model: opts.provider.model,
        };
      }
      onNote?.("LLM returned empty content; using built-in writer.");
    } catch (err) {
      onNote?.(`LLM generation failed (${(err as Error).message}); using built-in writer.`);
    }
  }

  const fallback = templatePost(report);
  return {
    text: fallback.text,
    hashtags: fallback.hashtags,
    summary: report.businessPurpose,
    provider: "template",
  };
}

/**
 * Sanitizes LLM output: strips code fences, leading commentary, excessive blank
 * lines and truncates to LinkedIn's practical length.
 */
export function sanitize(text: string): string {
  let out = text.trim();
  out = out.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/m, "");
  // Drop leading model chatter like "Sure, here's your post:"
  out = out.replace(/^(here(?:')?s (?:your|a|the)|sure,)|^(of course,?\s*)?(here|okay)[,:!]*\s*/i, "");
  out = out.split("\n").map((l) => l.trimEnd()).join("\n");
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out.slice(0, MAX_CHARS);
}

/** Strips terminal hashtags into a list; deduped, in order. */
export function extractHashtags(text: string): string[] {
  const tail = text.split(/\n{2,}/);
  const last = tail[tail.length - 1] ?? "";
  const tags = last.match(/#[a-zA-Z0-9_]+/g) ?? [];
  const hashtags = [...new Set(tags.map((t) => t.toLowerCase()))];
  return hashtags.filter((t) => /^#[a-z0-9]+$/i.test(t)).slice(0, 8);
}

/** Evidence-backed hashtag suggestions from report facts. */
export function suggestHashtags(report: ProjectReport): string[] {
  const set = new Set([...extractLanguageTags(report), "#buildinpublic"]);
  return [...set].slice(0, 8);
}

function extractLanguageTags(report: ProjectReport): string[] {
  const tags: string[] = [];
  for (const lang of report.primaryLanguages) {
    const clean = lang.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (clean) tags.push(`#${clean}`);
  }
  for (const tech of report.technologies.all) {
    if (/React|Vue|Angular|Svelte|Next/i.test(tech)) tags.push("#frontend");
    if (/Node|Express|Fastify|NestJS|Flask|Django|FastAPI/i.test(tech)) tags.push("#backend");
    if (/AWS|GCP|Azure|Vercel|Netlify/i.test(tech)) tags.push("#cloud");
    if (/Docker|CI\/CD/i.test(tech)) tags.push("#devops");
    if (/Redis|PostgreSQL|MySQL|Mongo/i.test(tech)) tags.push("#databases");
  }
  return tags.filter(Boolean);
}