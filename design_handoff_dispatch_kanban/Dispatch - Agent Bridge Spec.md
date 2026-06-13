# Dispatch — Build Spec: Local Agent Bridge

**Status:** ready for implementation · **Audience:** Claude Code
**Companion artifact:** `Dispatch.dc.html` (the approved UI prototype — treat it as the visual + interaction source of truth for the web app)

> This spec covers the **runtime** that the prototype only simulates: the local agent that actually checks repos and drives Codex CLI. It is written as small, independently-buildable tickets (see §10). Build them in order; each is shippable on its own.

---

## 1. Goal & non-goals

**Goal.** Let a browser-based Kanban board (the prototype) dispatch a card's instructions to **Codex CLI running on the user's own machine**, against their **already-cloned local repo**, and stream the result back into the board.

**Why a local agent (decided).** Browsers are sandboxed — a web page cannot read the filesystem, run `git`, or spawn `codex`. We deliberately rejected:
- a desktop wrapper (Electron/Tauri) — user wants a web app;
- a cloud runner — it clones a *fresh* copy and can't see the user's local working tree, dev server, `.env`, or uncommitted work, which breaks the vibe-coding loop;
- reimplementing the agent against the model API — throws away Codex.

So: **web UI (control surface) ↔ local daemon `dispatch-agent` (machine access) ↔ `codex exec` (the agent) against the local clone.**

**Non-goals (v1).** Multi-user/team accounts, hosted persistence, auth beyond local pairing, Windows-native (target macOS/Linux first; WSL for Windows).

---

## 2. Architecture

```
┌─────────────────────┐        HTTPS (static)         ┌──────────────────────┐
│   Browser (web app) │ ◀───────────────────────────▶ │  Dispatch web host    │
│  React board / UI   │                                │  (static hosting)     │
└─────────┬───────────┘                                └──────────────────────┘
          │  REST + WebSocket over http://127.0.0.1:4317  (loopback only)
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  dispatch-agent  (local daemon, started by `npx @dispatch/agent`)         │
│  • repo registry + git status        • spawns `codex exec`                │
│  • run manager (parallel, 1/worktree) • streams stdout/events             │
│  • diff/patch capture                 • SQLite state (~/.dispatch)         │
└─────────┬───────────────────────────────────────────┬────────────────────┘
          │ git / fs                                    │ child process
          ▼                                             ▼
   local cloned repos                            codex exec (Codex CLI)
   (git worktrees per run)
```

**Key point on connectivity:** the page is served over HTTPS but talks to `http://127.0.0.1:4317`. Plan for **mixed-content**: either (a) ship the agent with a locally-trusted cert for `https://127.0.0.1` / a `*.localhost` name, or (b) run the web app from the agent itself on first launch. See §8.

---

## 3. The daemon — `dispatch-agent`

**Runtime:** Node ≥ 20, distributed via `npx @dispatch/agent`. Single long-lived process. Binds **loopback only** (`127.0.0.1`), never `0.0.0.0`.

**Responsibilities**
1. Maintain a **repo registry**: `{ appId, name, repoSlug, localPath, defaultBranch }` in `~/.dispatch/config.json`.
2. Answer **clone/status checks** (§5).
3. **Dispatch runs**: create an isolated git worktree, spawn `codex exec`, parse its event stream, capture the resulting diff (§6).
4. **Stream** lifecycle + log events to subscribed WebSocket clients.
5. **Persist** runs/cards so a browser refresh re-attaches to in-flight builds (§9).
6. Enforce **pairing** before accepting commands (§8).

**Process model**
- One run = one detached child `codex exec` + one git worktree.
- Parallel runs allowed (the prototype shows parallel "Building" cards) — **cap concurrency** (default 3, configurable) and **one run per worktree/branch** so they never collide.
- On crash/restart, reconcile: mark orphaned `building` runs as `interrupted` and offer resume.

---

## 4. Localhost protocol (web ↔ agent)

Base: `http://127.0.0.1:4317`. All requests carry `Authorization: Bearer <pairing-token>` (§8). JSON bodies.

### REST

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | `{ ok, version, codexVersion, codexInstalled }` — drives the header status chip |
| `POST` | `/pair` | exchange a one-time pairing code for a long-lived token |
| `GET` | `/apps` | registered repos + live git status (§5) |
| `POST` | `/apps` | register a repo `{ name, localPath }` (validates it's a git repo) |
| `POST` | `/apps/:id/clone` | clone `repoSlug` to `localPath` if missing → streams progress |
| `POST` | `/runs` | **dispatch a card** `{ appId, cardId, prompt, type, baseBranch }` → `{ runId, branch }` |
| `GET` | `/runs/:id` | full run state (steps, logs, diff, chat) |
| `POST` | `/runs/:id/messages` | follow-up chat → continues the Codex session |
| `POST` | `/runs/:id/approve` | commit + open PR (or merge) |
| `POST` | `/runs/:id/request-changes` | re-run with feedback (new Codex turn) |
| `POST` | `/runs/:id/stop` | kill the child process, keep partial work |

### WebSocket  `ws://127.0.0.1:4317/stream?token=…`

Client subscribes: `{ "type": "subscribe", "runId": "…" }` (or `"*"` for all).
Server pushes newline-delimited events:

```jsonc
{ "type": "run.step",   "runId": "r_123", "step": "editing", "state": "active" }
{ "type": "run.log",    "runId": "r_123", "line": "✎ editing src/foo.ts", "stream": "stdout" }
{ "type": "run.progress","runId": "r_123", "pct": 62 }
{ "type": "run.diff",   "runId": "r_123", "files": [ /* see §6 */ ] }
{ "type": "run.status", "runId": "r_123", "status": "needs_review" }
{ "type": "agent.status","online": true }
```

Canonical step ids (match the prototype timeline): `cloning · planning · editing · testing · pr`.
Canonical run statuses (match the board columns): `ready → building → needs_review → merged` (+ `interrupted`, `failed`).

---

## 5. Repo & clone checks

On `GET /apps`, for each registered repo return:
```jsonc
{ "id":"a2","name":"TrailMix","repoSlug":"maya/trailmix",
  "localPath":"/Users/maya/code/trailmix",
  "cloned": true,            // localPath exists AND is a git repo
  "clean": false,            // `git status --porcelain` empty?
  "currentBranch":"main",
  "ahead": 0, "behind": 2 }
```
- `cloned` = `fs.existsSync(path)` **and** `git rev-parse --is-inside-work-tree` succeeds.
- If not cloned, the UI's clone modal calls `POST /apps/:id/clone`, which runs `git clone git@github.com:<slug>.git <localPath>` and streams progress lines as `run.log`-style events.
- **Pre-flight gate (prototype behavior):** the web app calls `GET /apps/:id` right before dispatch; if `cloned === false`, show the clone modal first, then dispatch on success.

---

## 6. Codex invocation & diff capture

**Invoke (verify exact flags against the installed Codex CLI version — treat these as the intended shape, not gospel):**
```bash
codex exec \
  --cd "<worktreePath>" \
  --json \                       # machine-readable event stream if available
  "<card.prompt>"
```
- Run inside a **dedicated git worktree** on a new branch:
  `git worktree add ../.dispatch-worktrees/<runId> -b <branch> <baseBranch>`
  Branch name from card type: `feat/… | fix/… | enh/…` (slug of title).
- **Map Codex output → step events.** If `--json` events exist, map them to `cloning/planning/editing/testing/pr`. If only plain stdout is available, **derive steps heuristically** (file-edit lines → `editing`, test runner output → `testing`) and forward raw lines verbatim to `run.log` so the prototype's terminal panel shows the real thing.
- **Progress** is advisory: emit `run.progress` from step transitions (cloning 10 → planning 30 → editing 65 → testing 90 → pr 100). Don't fake a number Codex doesn't give.

**Capture the diff** when the run settles:
```bash
git -C <worktreePath> add -A
git -C <worktreePath> diff --cached
```
Parse into the shape the prototype's diff viewer already consumes:
```jsonc
{ "file":"src/screens/FavoritesScreen.tsx", "add":6, "del":1,
  "lines":[ {"t":"ctx","text":"…"}, {"t":"del","text":"…"}, {"t":"add","text":"…"} ] }
```
(`t ∈ ctx|add|del`.) Keep hunks reasonable; for huge/binary files emit `{ file, add, del, lines: [] }` and let the UI show "view on GitHub".

---

## 7. Review, chat & merge

- **Needs Review** = run finished, diff captured, working tree left intact in the worktree.
- **Follow-up chat** (`POST /runs/:id/messages`) continues the **same Codex session** (reuse session/conversation id if the CLI supports `--continue`/session resume; else start a fresh `codex exec` in the same worktree with the prior context summarized). Re-capture diff after each turn → push `run.diff`.
- **Request changes** = a chat turn that also flips status back to `building` and re-streams.
- **Approve & merge:**
  - commit (if Codex didn't): `git commit -am "<card.title>"`,
  - push branch, open PR via `gh pr create` **or** fast-forward merge into `defaultBranch` (make it a per-app setting),
  - remove the worktree: `git worktree remove`,
  - status → `merged`, emit `run.status`.

---

## 8. Pairing & security (loopback is not "safe" by default)

Any local process / malicious page could hit `127.0.0.1:4317`. Required:
1. **Pairing token.** On first launch the agent prints a one-time code (shown in the CLI and encoded in the prototype as `--pair 7F3A-29C1`). The web app `POST /pair {code}` → receives a token stored in the agent's allowlist + the browser's `localStorage`. All later calls require it.
2. **Origin allowlist.** Reject requests whose `Origin` isn't the Dispatch web host (CORS + server-side check). Handle WS `Origin` too.
3. **Loopback bind only.** Never bind a routable interface.
4. **Mixed content — DECIDED: the agent serves the web bundle.** `npx @dispatch/agent` serves the web app from `http://127.0.0.1:4317` and opens it in the browser, so the page origin and the agent are **same-origin** — no mixed-content blocking, no certificates, nothing to add to the OS trust store. The web app is still built/hosted normally for marketing + preview, and `npx` always fetches the latest bundle so update cadence is preserved.
   - *Fallback (only if the page must be deployed independently of the agent):* serve `https://127.0.0.1:4317` with a locally-trusted cert generated + consented on first run (`mkcert`-style local CA). Avoid shipping a private key inside the public npm package.
5. **Command surface is fixed.** The agent only ever runs known git/codex commands with validated args — never arbitrary shell from the page.
6. **Path containment.** `localPath` must be inside a user-approved roots list; reject `..`/symlink escapes.

---

## 9. State & persistence

- SQLite (or a JSON store) at `~/.dispatch/state.db`: `apps`, `cards`, `runs`, `messages`, `pairings`.
- **DECIDED: board state lives agent-side for v1** — the web app is a thin client and survives refresh by re-fetching `/apps` + `/runs`. Local-first matches the local-agent premise and ships fastest. Cross-device / team sync is **planned as T10** (§10), not v1 scope.
- On reconnect, the web app: `GET /health` → `/apps` → for each `building` run, WS `subscribe` to resume the live log exactly where the prototype left off.

---

## 10. Build order (compartmentalized tickets)

Each ticket is independently testable. Ship top-to-bottom.

**T1 — Agent skeleton + health.** `npx @dispatch/agent` boots, binds `127.0.0.1:4317`, `GET /health` returns version + `codexInstalled` (probe `codex --version`). *Done when:* the prototype's header chip can flip to "connected" against the real `/health`.

**T2 — Pairing.** One-time code, `POST /pair`, token allowlist, origin check. *Done when:* unpaired requests 401; the prototype's Connect modal completes a real handshake.

**T3 — Repo registry + status.** `config.json`, `GET/POST /apps`, git status fields (§5). *Done when:* the app picker shows real cloned/clean state.

**T4 — Clone flow.** `POST /apps/:id/clone` with streamed progress. *Done when:* the clone modal clones a missing repo and dispatch proceeds.

**T5 — Dispatch a run (no streaming yet).** Worktree + branch + `codex exec`, capture final diff, persist. `POST /runs`, `GET /runs/:id`. *Done when:* a card produces a real branch + diff.

**T6 — Live streaming.** WS event stream; map Codex output → steps/logs/progress (§6). *Done when:* the Building drawer shows the real terminal + timeline live.

**T7 — Review actions.** `messages`, `request-changes`, `approve` (commit/PR/merge + worktree cleanup). *Done when:* the full Ideas→Merged loop works end-to-end on a real repo.

**T8 — Resilience.** Concurrency cap, crash reconciliation, refresh-resume, stop. *Done when:* killing/restarting the agent recovers cleanly.

**T9 — Packaging & security hardening.** `npx` UX, **agent-serves-bundle** wiring (§8.4: same-origin `http://127.0.0.1:4317`, auto-open browser), path containment, signed release.

**T10 — Cloud board sync (PLANNED, post-v1, not in scope yet).** Optional hosted store so cards/boards sync across devices and teammates while runs still execute on each user's local agent. Adds: a backend cards/runs API, account auth, and a local↔cloud reconciliation layer (local agent remains the source of truth for run execution + diffs; cloud holds card metadata + status mirror). Gate behind a "Team workspace" setting; single-user stays fully local. *Trigger to build:* first multi-user / multi-device requirement.

---

## 11. Open questions to confirm with the Codex CLI you target
1. Does the installed `codex exec` emit structured (`--json`) events, or only stdout? (Determines §6 mapping fidelity.)
2. Session continuation flag for follow-up chat (`--continue` / resume by id)?
3. Does Codex commit on its own, or do we always commit post-run?
4. Sandbox/approval flags — run unattended (`--auto`/`--full-auto` equivalent) vs. require approvals (we want unattended for dispatch).

*(Verify all CLI flags against the version you install; this spec specifies intent, the CLI specifies syntax.)*
