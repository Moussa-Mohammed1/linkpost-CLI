# Architecture

`post` is split into small, single-purpose modules. Dependency direction is
always inward: **commands → orchestrators → core/primitives**.

```
src/
├── index.ts                 CLI entry: arg parsing, command dispatch
├── commands/
│   ├── analyze.ts           `post` — analyze + generate + write bundle
│   └── publish.ts           `post publish` — auth, image upload, share
├── core/
│   ├── types.ts             shared domain types (ProjectReport, Detection…)
│   ├── paths.ts             forward-slash relative-path helpers
│   ├── project.ts           project validation + marker detection
│   ├── ignore.ts            .gitignore-compatible matcher (stackable scopes)
│   ├── walk.ts              async repository walker (opendir / BFS, caps)
│   └── logger.ts            structured buffer-backed logger
├── plugins/
│   ├── types.ts             AnalyzerPlugin / PluginContext contracts
│   ├── context.ts           cached manifest reader + dependency index
│   ├── registry.ts          built-in plugin registry + external loader
│   └── builtins/            language, framework, database, orm, docker,
│                            cicd, deployment, testing, auth, ai, cloud
├── analyzer/
│   ├── analyze.ts           orchestrates the whole pipeline
│   ├── discover (modules.ts)  top-level module/container segmentation
│   ├── summarizer.ts        per-module heuristic summaries (local-only)
│   ├── heuristics.ts        pure helpers (architecture, features, langs…)
│   └── inference.ts         purpose, highlights, challenges, notable files
├── content/
│   ├── prompt.ts            bounded LLM prompt builder
│   ├── generate.ts          LLM → sanitize → fallback decision
│   └── template.ts          deterministic fact-accurate post writer
├── llm/
│   └── provider.ts          OpenAI-compatible chat provider + env resolution
├── output/
│   └── writer.ts            linkedin-post/ bundle writer (content/metadata/logs/images)
└── linkedin/
    ├── oauth.ts            authorization-code flow + local loopback server
    ├── client.ts           REST API client (userinfo, media upload, ugcPosts)
    └── browser.ts          cross-platform browser opener
```

## Data flow

```
validate → walk (ignore rules) → buildContext (manifest cache)
                                        │
                                        ▼
               ┌─────────────── plugin registry ───────────────┐
               ▼                                              ▼
        Detections  ───────────►  TechnologyInventory
               ▼
        discoverModules ──► summarizeModule (per module)   ← context stays O(modules)
               ▼
        ProjectReport ──► content/generate
                             ├─ LLM provider (env)  → sanitize
                             └─ template fallback
               ▼
        output/writer  → linkedin-post/{content.txt, metadata.json, logs.txt, images/}
```

## Resilience on large repositories

- The walker is an explicit-queue BFS (no recursion-depth ceiling) with hard
  caps on files/directories (`maxFiles`, `maxDirs`) and reports truncation.
- Only a bounded set of representative files per module is ever read, and each
  read is capped in bytes. Anything read is discarded after summarization.
- Every plugin failure is caught and logged; a failure never aborts the run.
- The LLM only ever receives module summaries and curated facts, never source.

## Extensibility

- New language/framework support = a new plugin implementing
  `AnalyzerPlugin.detect(ctx)` placed in `.post/plugins/` or `$POST_PLUGIN_DIR`.
- Custom plugins override built-ins by shared `id`.
- New output steps or post-processing can be added in `output/` without touching
  the analyzer.

## Testing

`tests/` covers ignore semantics, the walker, manifest/context indexing,
built-in detectors, heuristics, summarizer, content generation/sanitization,
output bundling, analyzer integration and CLI/publish guardrails — all against
temporary fixtures (no network, no real LinkedIn calls).