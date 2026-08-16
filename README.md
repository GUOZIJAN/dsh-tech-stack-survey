# dsh-tech-stack-survey

English | [中文](README.zh.md)

Tech-Stack Survey Plugin for DeepSeek Harness (DSH).

When the user asks to *design / build / implement a project* without specifying a complete tech stack, this plugin makes the model call the `design_stack_survey` tool, which asks **2–5** adaptive multiple-choice questions (exactly **3** stack options each, each annotated with the scenario it fits) in an interactive card:

- **Hover** an option to read that stack's detailed info (scenario, pros/cons, alternatives);
- Only after the user **submits all** answers does the model continue the design with the chosen stack.

## Features

- 🧠 **Adaptive question count**: `clamp(2..5, round((complexity + (5 − promptDetail)) / 2))` — the more complex the project and the vaguer the prompt, the more questions.
- 🗂️ **Built-in knowledge bank**: 8 technology dimensions (frontend, backend, database, deployment, mobile/desktop, AI, state, testing), each with exactly 3 mainstream stack options.
- 🖱️ **Hover for details**: each option shows a one-line scenario; hovering (or keyboard focus) opens a popup with the full stack details.
- ✅ **One question at a time**: selecting an option auto-advances (with a "previous" button); the last question submits the whole batch, and the model continues in the same turn.
- 🔌 **Non-intrusive**: claims only its own interactions on the `conversation.composer` chain (`priority: -1` + the `dss_stack_` id prefix — the wire zod schema strips unknown fields, so the marker must live in a schema-allowed field); ordinary `ask_user_question` flows keep the built-in UI.

## How it works

```
user: "design a project management platform"
  │
  ▼
model (agent) calls design_stack_survey
  │  project_description / project_type / complexity / prompt_detail
  ▼
Host half: builds 2-5 questions × 3 options from the knowledge bank
  │  (option.description = "scenario line\n\ndetails")
  │  calls ctx.userQuestions.ask({ questions, agent, signal }) — blocks
  ▼
Client half: claims the interaction → renders the survey card
  │  user submits → wait.respond({ ok: true, value: { sessionId, answer } })
  ▼
Host: ask() resolves → tool returns the chosen stacks → model continues
```

- **Host half** (`lib/index.js`): registers the dynamic `design_stack_survey` tool; owns the knowledge bank `BANK`, dimension routing `ORDER_BY_TYPE`, question counting `questionCount`, and survey building `buildSurvey`; calls `ctx.userQuestions.ask()`.
- **Client half** (`lib/client.js`): registers a `conversation.composer` chain entry (`priority: -1` + `dss_stack_` id-prefix selector) rendering the `SurveyComposer` card — one question at a time, hover tooltips (`.dss-tip`), `Question n / N` progress, and a submit button; both submit and cancel reuse the built-in `wait.respond()` carrier protocol.

## Installation & Usage

### Option 1: Dynamic plugin (recommended for a quick trial)

In a DSH **cordis (creation) mode** session, ask the model to:

1. `cordis_define` — create the plugin:
   - `code.host` = the full content of [`host.js`](./host.js);
   - `code.client` = the full content of [`client.js`](./client.js);
   - suggested semantic prefix `dsts`.
2. `cordis_run` to activate; **approve** the Client half in the browser UI.
3. Then just say **"design a XX project"** (without a tech stack) — the model calls `design_stack_survey`, the survey card appears, and after you answer, the design continues with the chosen stack.

> The dynamic plugin lives only in the session process that defined it (lost on restart). For a permanent install see Option 2.

### Option 2: Permanent install (deployment-level)

The repo ships as a ready-to-install **dual-face package** (`package.json` + `lib/`), verified on a local DSH web profile:

1. **Package layout**: the Host half is `lib/index.js` (static ESM, injects `tools`/`userQuestions`, registers the tool via `ctx.tools.register(defineTool(...))`); the Client half is `lib/client.js` (a lazy-CJS `window.__ModuleLoader__.load({ id, factory })` bundle exporting `{ inject: ['slots','locale'], apply }`). `package.json` declares `dsh.client: { platform: 'web', inject: [...] }` and `exports['./client']`.
2. **Install the package**: copy `package.json` + `lib/` into the profile's hoisted `node_modules` root (e.g. `C:\Users\guozi\.dsh\profiles\node_modules\dsh-tech-stack-survey`), so it is resolvable from the profile directory.
3. **Compose**: append one row to the profile's `cordis.patch.yml` (e.g. `C:\Users\guozi\.dsh\profiles\web\cordis.patch.yml`):
   ```yaml
   - insert:
       - id: tech-stack-survey
         name: 'dsh-tech-stack-survey'
   ```
4. **Restart**: restart `dsh web`. No web-artifact rebuild is needed — the client-modules node half scans Loader entries at runtime and serves `/plugins/<id>/client.js`, which the browser pulls via `window.__DSH_BOOT__`.
5. **Verify**: `GET /plugins/dsh-tech-stack-survey/client.js` answers 200; the `/api/pluginInventory/list` RPC shows `include:tech-stack-survey` with `fiberPhase: active`.

> Notes: the Host half registers its tool from the host plane, landing in the tools registry's **global layer**, which every agent preset inherits (presets apply no allow/deny restrictions) — so **new sessions** see `design_stack_survey`; sessions created before the install keep their fixed tool catalog. If you later run `pnpm install` in the profile directory, also add this package to the profile's `package.json` dependencies so pnpm does not prune it.

## Tool parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `project_description` | string | ✅ | The project description (shown at the top of the survey; truncated at 240 chars) |
| `project_type` | string | – | `web / fullstack / mobile / desktop / ai / cli / other` — picks the question dimensions |
| `complexity` | integer | – | Complexity 1–5, default 3 |
| `prompt_detail` | integer | – | Prompt detail 1–3, default 2 |

**Question count**

| complexity \ promptDetail | 1 (vague) | 2 (normal) | 3 (detailed) |
| --- | --- | --- | --- |
| 1 (simple) | 3 | 2 | 2 |
| 3 (medium) | 4 | 3 | 3 |
| 5 (complex) | 5 | 4 | 4 |

**Knowledge bank dimensions** (3 options each)

| Dimension | Question | Example options |
| --- | --- | --- |
| `frontend` | Web frontend stack? | React 18 + Vite · Vue 3 + Vite · Svelte 5 + Vite |
| `backend` | Backend stack? | Node.js (NestJS/Fastify) · Python (FastAPI/Django) · Go (Gin/Echo) |
| `database` | Data storage? | PostgreSQL + Redis · MongoDB · SQLite + Prisma |
| `deployment` | Deployment & hosting? | Docker + PaaS · Kubernetes + cloud · VPS/bare metal |
| `mobile` | Mobile/desktop stack? | React Native (Expo) · Flutter · Tauri |
| `ai` | AI integration? | LLM API + LangChain · Local models (Ollama) · Fine-tuned OSS (HF + LoRA) |
| `state` | State & data fetching? | TanStack Query + Zustand · Pinia · Redux Toolkit |
| `testing` | Testing & quality? | Vitest + Playwright · Pytest · Jest + RTL |

Dimension routing (`ORDER_BY_TYPE`): `web/fullstack → frontend, backend, database, deployment, state`; `mobile/desktop → mobile, backend, database, deployment`; `ai → ai, backend, database, deployment`; `cli → backend, testing, deployment`; unknown types fall back to `other`.

## Structure

```
dsh-tech-stack-survey/
├── package.json         # dual-face package: dsh.client + exports["./client"]
├── shared/
│   ├── survey-core.js   # Host single source of truth (bank, routing, tool options)
│   └── client-core.js   # Client single source of truth (composer, dicts, styles)
├── scripts/
│   └── build.mjs        # twin generator: rebuilds the 4 files below from shared/
├── lib/
│   ├── index.js         # Host half — GENERATED (static ESM twin)
│   ├── client.js        # Client half — GENERATED (__ModuleLoader__ bundle twin)
│   └── types/           # .d.ts type surfaces
├── host.js              # GENERATED — code.host for the dynamic install (cordis_define)
├── client.js            # GENERATED — code.client for the dynamic install
├── tests/
│   ├── host.test.cjs        # VM unit tests of the dynamic Host body
│   ├── static-host.test.js  # tests of lib/index.js against real defineTool
│   ├── client.test.js       # VM structure tests of the client bundle
│   └── consistency.test.js  # anti-drift: twins must match shared/ regeneration
└── README.md / README.zh.md
```

**Single source of truth.** The dynamic twins (`host.js`, `client.js`) and the static twins (`lib/index.js`, `lib/client.js`) are **generated** from `shared/survey-core.js` + `shared/client-core.js` by `scripts/build.mjs` — they are not hand-edited. Edit the shared sources, then run `npm run build`; `npm test` (via `tests/consistency.test.js`) and `npm run check` fail on any drift, so the two install modes cannot silently diverge.

## Test

```bash
npm test        # node --test tests/
npm run check   # syntax-check shared + generated files, then fail on any twin drift
npm run build   # regenerate the four twins from shared/ (after editing a shared source)
```

Covers: question-count bounds (2–5), dimension routing and fallback, exactly 3 options per question (`label` + `description` with "scenario + blank line + details"), the `dss_stack_` id-prefix marker, schema-allowed fields only, the tool definition (parameters/output schema/render), the full `execute` flow (incl. `ask()` call, agent/signal passthrough, custom-answer passthrough), and generated-twin consistency.

## License

[MIT](./LICENSE)
