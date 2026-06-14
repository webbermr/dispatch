# AGENTS.md

> Context for AI coding agents (Codex / Dispatch) working in this repo. Read this
> before making changes. (Codex reads `AGENTS.md` automatically; this is also a
> good template for other repos.)

## What this is

**Dispatch** — a per-repo Kanban board for "vibe-coding": pick a card (a feature/
bug/enhancement), hand its prompt to **Codex CLI**, which builds it against a
local clone, then ship it back to GitHub/GitLab as a PR or a local merge.

Two parts:

- **`web/`** — the board UI. **Vite + React + TypeScript**, single **zustand**
  store. Faithful recreation of the design in `design_handoff_dispatch_kanban/`.
- **`agent/`** — `@dispatch/agent`, the local daemon (**Node + TypeScript**,
  Express + `ws`). Binds loopback `127.0.0.1:4317` only. Pairing/auth, repo
  registry, git worktrees, `codex exec` streaming, review/chat, approve.

## Run & build

```bash
# web
cd web && npm install && npm run build      # tsc + vite; dev: npm run dev (:5180)
# agent
cd agent && npm install && npm run build     # tsc → dist/; dev: npm run dev
node agent/dist/cli.js                        # start the daemon (serves web/dist)
```

There are no automated test suites yet; verify by `npm run build` (typechecks)
and exercising the flow. The agent must have `codex` (and `gh`/`glab` for PRs/MRs)
on its `PATH`.

## Conventions

- **TypeScript, strict.** `npm run build` must pass (it runs `tsc`). No `any`
  unless unavoidable; prefer explicit types at module boundaries.
- **Web UI uses inline styles + CSS variables** (the MITRE design tokens in
  `web/src/styles/tokens.css`). Match the existing token usage; don't introduce
  a CSS framework.
- **All agent network I/O lives in `web/src/lib/agentClient.ts`**; agent→store
  mapping in `web/src/lib/agentMap.ts`. Keep components transport-agnostic.
- **Store actions branch on `live`** (real agent) vs demo (in-memory seed +
  simulation). Keep both paths working.
- Match the surrounding code's naming, comment density, and idioms.

## Architecture notes / gotchas

- **The agent runs `codex exec` in an isolated git worktree** (`~/.dispatch/
  worktrees/<runId>`) by default, or the user's working copy in `workdir` mode.
  Changes are NOT in the user's main checkout until merge/checkout.
- **Statuses & step ids match 1:1** across web and agent: `ideas/ready/building/
  review/merged` and `cloning/planning/editing/testing/pr`.
- **Approve is per-app**: `mergeStrategy` `pr` (push + `gh pr create` / `glab mr
  create`, forge picked from the remote in `agent/src/lib/forge.ts`) or `merge`
  (local fast-forward). For PR mode, the base branch is pushed to the remote
  first if missing.
- **Agent state** is JSON under `~/.dispatch/` (config, runs, cards, pairings) —
  outside the repo. Never commit secrets.

## Working agreement (for agents)

- Keep each change focused on the card's task; don't refactor unrelated code.
- Keep the build green (`npm run build` in the package you touched).
- Web-only changes need just a browser refresh; agent (`agent/src/**`) changes
  need an agent restart.
- Prefer small, reviewable diffs.
