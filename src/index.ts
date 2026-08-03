import { join } from "node:path";
import { generatePost } from "./commands/analyze.js";
import { publishPost } from "./commands/publish.js";
import { readEnvs } from "./commands/envs.js";
import { loadPluginsFromDirs } from "./plugins/registry.js";

export const VERSION = "1.0.0";

interface Flags {
  help: boolean;
  version: boolean;
  json: boolean;
  noLlm: boolean;
  verbose: boolean;
  noBrowser: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { help: false, version: false, json: false, noLlm: false, verbose: false, noBrowser: false };
  for (const arg of argv) {
    switch (arg) {
      case "--help":
      case "-h":
        flags.help = true;
        break;
      case "--version":
      case "-v":
        flags.version = true;
        break;
      case "--json":
        flags.json = true;
        break;
      case "--no-llm":
      case "--template-only":
        flags.noLlm = true;
        break;
      case "--verbose":
        flags.verbose = true;
        break;
      case "--no-browser":
        flags.noBrowser = true;
        break;
      default:
        break;
    }
  }
  return flags;
}

const HELP = `post — analyze a project and draft a LinkedIn post about it.

Usage:
  post                  Analyze ./ and generate linkedin-post/
  post publish          Publish linkedin-post/content.txt (+ images/) to LinkedIn
  post envs             Show the env vars this tool reads (name=null when unset)

Options:
  --help, -h            Show this help
  --version, -v         Show the version
  --no-llm              Force the built-in writer (never call an LLM)
  --json                Print a machine-readable result object
  --verbose             Enable detailed logging
  --no-browser          Don't open a browser during OAuth; print the URL

Environment:
  OPENAI_API_KEY or POST_LLM_API_KEY + POST_LLM_BASE_URL + POST_LLM_MODEL
    Configure the LLM used to polish the post (optional).
  LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / LINKEDIN_ACCESS_TOKEN
    Credentials for 'post publish' (OAuth flow when first two are set).
`;

export async function runCli(argv: string[]): Promise<number> {
  const flags = parseFlags(argv);
  const command = argv.find((a) => !a.startsWith("-")) ?? "";

  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (flags.version) {
    process.stdout.write(`post ${VERSION}\n`);
    return 0;
  }

  const cwd = process.cwd();

  if (command === "publish") {
    const result = await publishPost({ cwd, noBrowser: flags.noBrowser });
    if (flags.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return result.ok ? 0 : 1;
    }
    if (!result.ok) {
      process.stderr.write(`\n${result.error}\n\n`);
      return 1;
    }
    const link = result.shareUrl ?? "";
    process.stdout.write("\n✦ Post published to LinkedIn\n");
    if (link) process.stdout.write(`  ${link}\n`);
    if (result.mediaSkipped) process.stdout.write("  (published as text-only; images were skipped)\n");
    process.stdout.write("\n");
    return 0;
  }

  if (command === "envs") {
    const vars = readEnvs();
    if (flags.json) {
      process.stdout.write(JSON.stringify(vars, null, 2) + "\n");
      return 0;
    }
    process.stdout.write("post: environment\n");
    for (const v of vars) {
      process.stdout.write(`  ${v.name}=${v.value ?? "null"}\n`);
    }
    return 0;
  }

  if (command !== "" && command !== "analyze") {
    process.stderr.write(`post: unknown command "${command}".\n\n${HELP}`);
    return 2;
  }

  if (command === "analyze") {
    // analyze subcommand = same pipeline
  }

  // Custom user plugins from .post/plugins (project) or $POST_PLUGIN_DIR
  const pluginDirs = [
    process.env.POST_PLUGIN_DIR,
    join(cwd, ".post", "plugins"),
  ].filter((p): p is string => Boolean(p));

  let plugins: Awaited<ReturnType<typeof loadPluginsFromDirs>> = [];
  try {
    plugins = await loadPluginsFromDirs(pluginDirs, {
      onWarn: (msg) => (flags.verbose ? console.warn(msg) : undefined),
    });
  } catch {
    plugins = [];
  }

  const emit = (msg: string) => process.stdout.write(`post: ${msg}\n`);
  const result = await generatePost({
    cwd,
    templateOnly: flags.noLlm,
    verbose: flags.verbose,
    plugins,
    emit,
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return result.ok ? 0 : 1;
  }
  if (!result.ok) {
    process.stderr.write(`\n✗ ${result.error}\n\n`);
    return 1;
  }

  process.stdout.write("\n");
  process.stdout.write(`✦ Generated your LinkedIn post\n`);
  emit(result.template ? "Wrote with the built-in writer (no LLM key configured). Add OPENAI_API_KEY for an AI-polished draft." : `AI draft by ${result.provider ?? "llm"}.`);
  emit(`Output: ${result.outputDir}`);
  emit("  → content.txt    the post itself");
  emit("  → metadata.json  project facts, tags, summary");
  emit("  → logs.txt       the analysis trail");
  emit("  → images/        add screenshots here, then run: post publish");
  process.stdout.write("\n");
  return 0;
}

/** Programmatic API used by bin/post.js and tests. */
export async function main(argv: string[]): Promise<void> {
  const code = await runCli(argv);
  process.exitCode = code;
}