import { join } from "node:path";
import { analyzeProject } from "../analyzer/analyze.js";
import { generateContent } from "../content/generate.js";
import { ensureGitIgnored } from "../core/gitignore.js";
import { Logger } from "../core/logger.js";
import { resolveProvider } from "../llm/provider.js";
import { writeOutput } from "../output/writer.js";
import type { AnalyzerPlugin } from "../plugins/types.js";
import type { ProjectReport } from "../core/types.js";

export interface GeneratePostInput {
  cwd: string;
  /** Skip LLM even when configured. */
  templateOnly?: boolean;
  /** LLM overrides (key/baseUrl/model). */
  llm?: { apiKey?: string; baseUrl?: string; model?: string };
  plugins?: AnalyzerPlugin[];
  emit?: (msg: string) => void;
  verbose?: boolean;
}

export interface GeneratePostResult {
  ok: boolean;
  outputDir?: string;
  contentFile?: string;
  provider?: string;
  template?: boolean;
  error?: string;
}

/**
 * The `post` pipeline: analyze → generate → write `linkedin-post/`. Always
 * produces output, using the deterministic writer when no LLM is configured.
 */
export async function generatePost(input: GeneratePostInput): Promise<GeneratePostResult> {
  const emit = input.emit ?? console.log;
  const logger = new Logger({ level: input.verbose ? "debug" : "info" });
  logger.addSink({ log: (_lv, msg) => emit(msg) });

  let report: ProjectReport;
  try {
    report = await analyzeProject({ cwd: input.cwd, logger, plugins: input.plugins });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const provider = input.templateOnly
    ? undefined
    : resolveProvider(input.llm ?? {});

  const content = await generateContent(report, {
    provider,
    onNote: (msg) => emit(msg),
  });

  const dir = join(input.cwd, "linkedin-post");
  await writeOutput({
    dir,
    report,
    content,
    logText: logger.toText(),
  });

  const ignored = await ensureGitIgnored(input.cwd);
  if (ignored) emit("Added linkedin-post/ to .gitignore");

  return {
    ok: true,
    outputDir: dir,
    contentFile: join(dir, "content.txt"),
    provider: content.provider,
    template: content.provider === "template",
  };
}