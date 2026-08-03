# post

`post` automatically analyzes any software project in the current directory and
generates a high-quality LinkedIn post about it — then publishes it for you.

It is a cross-platform (Windows / macOS / Linux), plugin-based CLI written in
TypeScript with **zero runtime dependencies** (Node ≥ 18).

```
post            # analyze ./ and generate linkedin-post/
post publish    # publish linkedin-post/content.txt (+ images/) to LinkedIn
```

## Installation

```bash
npm install -g .
post --version
```

Builds are produced with `npm run build` (runs automatically during install),
output goes to `dist/`.

## Quick start

```bash
cd ~/dev/your-project
post
# → linkedin-post/content.txt   (the post)
# → linkedin-post/metadata.json (project facts, tags, summary)
# → linkedin-post/logs.txt      (analysis trail)
# → linkedin-post/images/       (drop screenshots here)

post publish
```

## Commands

### `post` — generate

The analyze pipeline:

1. **Validate** — confirms `./` is a software project (looks for `package.json`,
   `.git`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`,
   `composer.json`, `requirements.txt`, `pubspec.yaml`, …).
2. **Scan** — walks the tree asynchronously, honoring `.gitignore`, `.postignore`
   and built-in ignores (`node_modules`, `vendor`, `dist`, `build`, `coverage`,
   `.git`, `.next`, `target`, `bin`, `obj`, `.cache`, …).
3. **Detect technologies** — plugin-based detectors report languages, frontend
   and backend frameworks, databases, ORMs, Docker, CI/CD, testing frameworks,
   authentication, AI libraries and cloud platforms.
4. **Summarize modules** — each top-level module gets a short heuristic summary
   (`tests/summarizer.ts`). This local summarization step is what keeps the LLM
   context tiny: raw source is *never* sent to the model.
5. **Generate** — a pick-your-path writer:
   - **LLM path** (default when `OPENAI_API_KEY` or `POST_LLM_API_KEY` is set,
     or any OpenAI-compatible endpoint via `POST_LLM_BASE_URL` / `POST_LLM_MODEL`)
     produces an AI-polished post from the bounded, evidence-backed report.
   - **Built-in writer** (`--no-llm`, or when no key is configured) produces a
     deterministic, fact-accurate post from the same facts. Nothing is invented.
6. **Output** — writes `linkedin-post/` with `content.txt`, `metadata.json`,
   `logs.txt` and an empty `images/` directory. The generated `linkedin-post/`
   folder is automatically added to the project's `.gitignore` (the file is
   created when missing; an existing ignore rule is never duplicated).

### `post envs` — inspect configuration

Prints every environment variable the tool reads, with its current value
(`name=null` when unset). Use it to debug why the LLM or LinkedIn path isn't
picking up configuration:

```text
post: environment
  POST_LLM_API_KEY=null
  OPENAI_API_KEY=null
  POST_LLM_BASE_URL=null
  POST_LLM_MODEL=gpt-4o-mini
  LINKEDIN_CLIENT_ID=null
  ...
```

`post envs --json` prints the same data machine-readable.

### `post config` — persistent settings

Environment variables set in a shell (`$env:VAR="…"` on Windows) only last for
that terminal session. To keep credentials permanently until you change them,
persist them with `post config` — stored in `~/.post/config.json`:

```bash
post config set LINKEDIN_CLIENT_ID=…
post config set LINKEDIN_CLIENT_SECRET=…
post config set LINKEDIN_VISIBILITY=PUBLIC
post config              # list what is persisted
post config unset LINKEDIN_VISIBILITY
```

Every variable the tool reads (see `post envs`) can be persisted this way and
works in *any* new terminal, no re-export needed. A variable set in the current
shell session always takes precedence over the persisted value, and
`post envs` marks values that come from the config file with `(config)`.

Set `POST_CONFIG_DIR` to relocate the config file (default `~/.post`).

### `post publish` — publish

Reads `linkedin-post/content.txt`, uploads every supported image (PNG/JPEG/GIF/
WebP/BMP) in `linkedin-post/images/` through LinkedIn's REST media API, then
creates the post via the UGC Posts API with `POST /v2/ugcPosts`.

Auth resolution order:

1. `LINKEDIN_ACCESS_TOKEN` (env) — used directly.
2. `~/.post/linkedin.json` — cached credentials from a previous OAuth flow.
3. Full interactive OAuth 2.0 **authorization-code flow** with a local loopback
   server, requiring `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.

```bash
export LINKEDIN_CLIENT_ID=… LINKEDIN_CLIENT_SECRET=…
post publish
```

### LinkedIn permissions limitation

LinkedIn's API no longer grants third-party apps the ability to publish to a
**personal-profile feed** by default — you must be approved for the
[Community Management API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/)
(designed for organization Pages / `w_org_social`). If publishing is rejected
(a typical `403`/permission error), `post` explains exactly how to proceed rather
than working around it:

* The generated assets stay on disk (`content.txt` + `images/`) so you can post
  manually from the official app/web in seconds.
* This tool deliberately respects LinkedIn's Terms of Service — no scraping,
  no headless-browser automation, no token reuse outside the approved OAuth/API
  flows.

## LLM configuration

All env vars are optional — without a key the built-in writer is used.

| Variable             | Meaning                                            | Default                    |
| -------------------- | -------------------------------------------------- | -------------------------- |
| `OPENAI_API_KEY`     | OpenAI key (secondary alias)                       | —                          |
| `POST_LLM_API_KEY`   | LLM key (takes precedence)                         | `OPENAI_API_KEY`           |
| `POST_LLM_BASE_URL`  | OpenAI-compatible base URL (Ollama, OpenRouter…)   | `https://api.openai.com/v1`|
| `POST_LLM_MODEL`     | Model name                                         | `gpt-4o-mini`              |

## Custom analyzer plugins

The analyzer is plugin-backed. Built-in detectors live in `src/plugins/builtins/`.
To add support for a new language/framework, drop a module anywhere the loader
scans — `<project>/.post/plugins/` or `$POST_PLUGIN_DIR` — then:

```ts
// .post/plugins/my-lang.mjs
export default {
  id: "acme.framework",            // unique id; overrides builtins with same id
  title: "Acme Framework",
  detect: (ctx) => ({
    name: "Acme",                  // technology name
    category: "backend-framework",  // TechCategory literal
    confidence: 0.9,
    detail: "…",
    evidence: ctx.hasModule("acme-core") ? "acme-core" : undefined,
  }),
};
```

`ctx` provides `hasFile`, `hasAnyFile`, `hasExtension`, `hasGlob`, `readText`,
`hasModule`, `modules()` and the parsed `pkg`. Plugins are async-capable and
must never throw (errors are caught and logged).

Task: supported categories: `language | frontend-framework | backend-framework |
database | orm | deployment | docker | ci-cd | testing | authentication | ai |
cloud | other`.

## Development

```bash
npm install          # + build
npm run build        # tsc → dist/
npm test             # vitest (36 tests)
npm run typecheck    # tsc --noEmit
```

Architecture overview: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## License

MIT