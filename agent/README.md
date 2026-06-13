# @dispatch/agent — Local Agent Bridge

The local daemon that lets the Dispatch web board run **Codex CLI on your own
machine** against your **already-cloned local repos**, and streams the result
back into the board. This is the **runtime** the prototype only simulated —
built from `../design_handoff_dispatch_kanban/Dispatch — Agent Bridge Spec.md`.

Node ≥ 20. Binds **loopback only** (`127.0.0.1:4317`), never a routable
interface.

## Run

```bash
npm install
npm run dev          # tsx watch — http://127.0.0.1:4317, prints a pairing code
npm run build        # compile to dist/
npm start            # run from source (tsx)
node dist/cli.js     # run the built daemon
```

On launch it prints a one-time pairing code and (unless `--no-open`) opens the
board. The board's Connect modal shows the matching command:

```
npx @dispatch/agent --pair 7F3A-29C1
```

Flags: `--pair <code>` (use a specific code instead of a random one),
`--no-open` (don't launch a browser).

Environment overrides: `DISPATCH_HOME` (state dir, default `~/.dispatch`),
`DISPATCH_PORT` (default 4317), `DISPATCH_WEB_DIR` (web bundle to serve),
`DISPATCH_WEB_ORIGIN` (extra allowed page origin), `DISPATCH_CODEX_BIN`,
`DISPATCH_CODEX_FLAGS` (default `--full-auto`).

## Protocol (spec §4)

REST, base `http://127.0.0.1:4317`, all but `/health` + `/pair` require
`Authorization: Bearer <token>`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{ ok, version, codexVersion, codexInstalled }` — drives the header chip |
| POST | `/pair` | exchange a one-time code for a long-lived token |
| GET | `/apps` | registered repos + live git status |
| POST | `/apps` | register a repo `{ name, localPath, repoSlug?, defaultBranch? }` |
| GET | `/apps/:id` | single app status (pre-flight clone gate) |
| POST | `/apps/:id/clone` | clone `repoSlug` → `localPath`, streams progress |
| GET | `/cards` | board cards (backlog) |
| POST | `/cards` | create a card `{ appId, type, priority, title, desc, prompt }` |
| PATCH | `/cards/:id` | edit fields / move between non-build columns |
| POST | `/runs` | dispatch a card → `{ runId, branch }` (links the card) |
| GET | `/runs` · `/runs/:id` | run state (steps, logs, diff, chat) |
| POST | `/runs/:id/messages` | follow-up chat (continues the Codex session) |
| POST | `/runs/:id/request-changes` | re-run with feedback |
| POST | `/runs/:id/approve` | commit + PR/merge + worktree cleanup |
| POST | `/runs/:id/stop` | kill the child, keep partial work |

WebSocket `ws://127.0.0.1:4317/stream?token=…` — send
`{ type:"subscribe", runId }` (or `"*"`). Server pushes `run.step`, `run.log`,
`run.progress`, `run.diff`, `run.status`, `run.message`, `agent.status`. Step
ids (`cloning·planning·editing·testing·pr`) and statuses
(`ready→building→needs_review→merged`, `+interrupted/failed`) match the board.

## Tickets

- **T1 Health** ✅ — `/health` probes `codex --version`.
- **T2 Pairing** ✅ — one-time code → token allowlist; unpaired = 401; origin allowlist; loopback bind.
- **T3 Repo registry + status** ✅ — `config.json`, `/apps`, git cloned/clean/branch/ahead/behind. Plus a **cards API** (`/cards`, spec §9) so the board backlog is agent-backed; runs link to cards and sync their status.
- **T4 Clone flow** ✅ — `/apps/:id/clone` streams `git clone --progress`.
- **T5 Dispatch a run** ✅ — git worktree + branch + `codex exec`, diff capture on settle, persisted. Verified with real Codex.
- **T6 Live streaming** ✅ — WS event stream; real `codex exec --json` events → steps/logs/progress (heuristic fallback for plain lines).
- **T7 Review actions** ✅ — `messages` (resumes the Codex session), `request-changes`, `approve` (commit + PR/merge + worktree cleanup). Verified end-to-end.
- **T8 Resilience** ✅ — concurrency cap, crash reconciliation (`building`→`interrupted` on restart), `stop`.
- **T9 Packaging & security** ◐ — same-origin bundle serving, loopback bind, origin allowlist, bearer token, path containment, fixed command surface all in place; remaining: `npx` publish polish + signed release + a trusted-cert fallback for independently-deployed pages.
- **T10 Cloud board sync** — planned, post-v1 (not in scope).

## Verified locally (incl. real Codex, codex-cli 0.139)

Health, pairing (wrong code → 401, correct → token), auth gate, repo
registration with live git status, path containment (`/etc` → 403), crash
reconciliation, the diff parser, and the **full `codex exec` happy path
end-to-end**: dispatch → real worktree → Codex edits files → `--json` events
mapped to the step timeline + live terminal → diff captured & parsed → review →
**follow-up message resumes the same session** → **approve fast-forward merges
into `main` and removes the worktree**. Exercised both via the REST/WS API and
through the actual web UI in a browser.

### §6/§11 answered against codex-cli 0.139

- **Structured events:** yes — `codex exec --json` emits JSONL
  (`thread.started` → session id, `item.*` with `agent_message` / `file_change`
  / `command_execution`, `turn.completed`). Mapped in `lib/codex.ts`.
- **Session continuation:** `codex exec [flags] resume <sessionId> <prompt>`
  (the exec-level `--cd/--json/--sandbox` flags must precede `resume`). Not
  `--continue`.
- **Commit behaviour:** Codex does **not** commit on its own, so the diff is
  captured as `git diff --cached <baseBranch>` (robust whether or not it
  commits) and `approve` commits before merging.
- **Unattended:** `--sandbox workspace-write` (writes confined to the worktree),
  not the interactive `--full-auto`. `codex exec` never prompts.
- **stdin:** must be `/dev/null` (`stdio:['ignore',…]`) or Codex blocks on
  "Reading additional input from stdin…".

Override the binary/flags with `DISPATCH_CODEX_BIN` / `DISPATCH_CODEX_FLAGS`.

## State (`~/.dispatch/`, spec §9)

JSON store (local-first v1): `config.json` (apps, approved roots, merge
strategy, concurrency), `state.json` (runs/messages/diffs), `pairings.json`
(issued tokens), `worktrees/<runId>/` (one git worktree per run). Board state
lives agent-side; the web app re-fetches `/apps` + `/runs` and re-subscribes on
refresh.

## Security (spec §8)

Loopback bind only · one-time pairing → bearer token on every call · `Origin`
allowlist on REST + WS · fixed command surface (only known git/codex commands
with validated args, never shell from the page) · path containment (`localPath`
must live under an approved root; `..`/symlink escapes rejected).
```
