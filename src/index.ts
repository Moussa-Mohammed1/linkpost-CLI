import { join } from "node:path";
import { generatePost } from "./commands/analyze.js";
import { publishPost } from "./commands/publish.js";
import { ENV_VARS, readEnvs } from "./commands/envs.js";
import {
  configFilePath,
  loadConfig,
  setConfigValue,
  unsetConfigValue,
  effectiveValue,
} from "./config/persist.js";
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
  post envs             Show the effective env/config values this tool uses
  post config           List values stored in the persistent config file
  post config set K=V   Persist K=V in ~/.post/config.json (survives restarts)
  post config unset K   Remove K from the persistent config

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

Values set with 'post config set' persist across terminal sessions. A variable
set in the current shell (e.g. $env:LINKEDIN_CLIENT_ID="...") takes precedence
over the persisted value.

For 'post publish' OAuth: register http://localhost:8000/callback in your
LinkedIn app (Auth tab) and set LINKEDIN_REDIRECT_URI=http://localhost:8000/callback.
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
      process.stdout.write(`  ${v.name}=${v.value ?? "null"}${v.source === "config" ? " (config)" : ""}\n`);
    }
    return 0;
  }

  if (command === "config") {
    return runConfig(argv, flags.json);
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
    effectiveValue("POST_PLUGIN_DIR").value,
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

const KNOWN_KEYS = new Set<string>(ENV_VARS);

/**
 * `post config [set K=V | unset K]` — manages the persistent config file
 * (~/.post/config.json). Values survive terminal restarts until changed.
 */
async function runConfig(argv: string[], json: boolean): Promise<number> {
  const args = argv.filter((a) => !a.startsWith("-"));
  const sub = args[1] ?? "list";

  if (sub === "set") {
    const pair = args[2];
    if (!pair || !pair.includes("=")) {
      process.stderr.write("Usage: post config set NAME=VALUE\n");
      return 2;
    }
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1);
    if (!KNOWN_KEYS.has(name)) {
      process.stderr.write(`post: "${name}" is not a known variable. Known: ${ENV_VARS.join(", ")}\n`);
      return 2;
    }
    await setConfigValue(name, value);
    const msg = `Saved ${name} to ${configFilePath()}`;
    if (json) process.stdout.write(JSON.stringify({ ok: true, name, value, file: configFilePath() }) + "\n");
    else process.stdout.write(`${msg}\n`);
    return 0;
  }

  if (sub === "unset") {
    const name = args[2]?.trim();
    if (!name) {
      process.stderr.write("Usage: post config unset NAME\n");
      return 2;
    }
    await unsetConfigValue(name);
    if (json) process.stdout.write(JSON.stringify({ ok: true, name }) + "\n");
    else process.stdout.write(`Removed ${name} from ${configFilePath()}\n`);
    return 0;
  }

  if (sub !== "list") {
    process.stderr.write(`post: unknown config subcommand "${sub}".\nUsage: post config [set NAME=VALUE | unset NAME]\n`);
    return 2;
  }

  const stored = loadConfig();
  if (json) {
    process.stdout.write(JSON.stringify(stored, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(`post: config (${configFilePath()})\n`);
  const keys = Object.keys(stored);
  if (keys.length === 0) {
    process.stdout.write("  (empty — use `post config set NAME=VALUE`)\n");
    return 0;
  }
  for (const name of keys) {
    const value = stored[name];
    process.stdout.write(`  ${name}=${value?.trim() ? value : "(blank)"}\n`);
  }
  return 0;
}