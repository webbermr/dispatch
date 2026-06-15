# Dispatch — Multi-Developer Plan

Going from one developer to a team that shares a repo's board (cards + states, live).

## Decisions (locked)

1. **Control plane:** a central server with its own database owns the board. The git
   forge is used only for PRs + CI status — not as the source of truth for cards.
2. **Execution:** a card builds on **the dispatcher's own machine** (their agent = a
   "runner"), using their clone and credentials. No shared build pool in v1.
3. **Code/diffs:** diffs, logs, and chat **stream to the server** so anyone can review a
   card without the builder being online. Source code and credentials never leave the
   runner's machine.

## Architecture: two planes

```
   Browsers (devs)                         Runners (each dev's machine)
        │  https + ws                            │  outbound wss (runner token)
        ▼                                         ▼
 ┌──────────────────────────── Control-plane server ───────────────────────────┐
 │  Auth (forge OAuth) · Workspaces/Repos/Cards/Runs in Postgres ·              │
 │  per-repo pub/sub fan-out · job dispatch to runners · diff/log store          │
 └───────────────────────────────────────────────────────────────────────────┘
```

- **Control plane (shared):** the board — repos, cards, statuses, comments, runs,
  diffs/logs, PR/CI links. Lives in the server + Postgres. All browsers and all runners
  connect to it.
- **Execution plane (per-machine):** the existing agent, demoted to a **runner**. It
  connects *outbound* to the server (no inbound ports), advertises the repos it has cloned,
  accepts build jobs for its owner, runs codex/claude in a local worktree, and streams
  status back. Code + git/codex/claude credentials stay local.

Single-user **local mode stays** (loopback agent + local board, no server) as the default;
"workspace mode" is opt-in: point the agent at a server URL with a runner token.

## Data model (Postgres)

| Table | Key fields |
| --- | --- |
| `users` | id, forge, forge_user_id, login, name, avatar, email |
| `workspaces` | id, name, slug, owner_user_id |
| `memberships` | workspace_id, user_id, role (`admin`/`builder`/`viewer`) |
| `repos` | id, workspace_id, name, repo_slug, default_branch, forge, settings (merge/agent/repoMode/planFirst/autoRetry/preview), repo_mode |
| `cards` | id, repo_id, type, priority, status, title, desc, prompt, base, model, order, scaffold, blocked, parent_id, assignee_user_id, created_by, archived, timestamps |
| `runs` | id, card_id, repo_id, runner_id, user_id, agent_id, model, branch, status, progress, steps, pr_url, error, attempt, retry_of, timestamps |
| `run_logs` | run_id, seq, line, stream (append-only) |
| `run_diffs` | run_id, files (JSON) — latest captured diff |
| `messages` | card_id/run_id, user_id, role, text, ts (chat + comments) |
| `runners` | id, workspace_id, owner_user_id, name, hostname, token_hash, capabilities (agents/models), last_seen_at |
| `audit` | who/what/when (optional, Phase 4) |

`repos` has **no localPath** — that's per-runner. A runner advertises which repo it can
build and where it lives locally.

## Identity & authorization

- **Browser auth:** GitHub/GitLab **OAuth** → user + session/JWT. Devs already have forge
  accounts, and OAuth lets us scope repo access naturally.
- **Workspace membership** with roles: `viewer` (read board), `builder` (dispatch/build),
  `admin` (manage repos/members/runners).
- **Runner auth:** a member generates a **runner token** (scoped to a workspace) and pairs
  their agent with it. The runner authenticates over its outbound WS with that token.
- Authorization checks on every API/WS action: is the user a member of the card's repo's
  workspace, and does their role permit the action.

## Runner protocol (Phase 2)

1. **Register:** runner connects outbound `wss://server/runner`, authenticates with its
   token, and advertises `{ hostname, agents+models installed, repos it can build (slug → localPath) }`. Server marks it online + heartbeats.
2. **Dispatch:** a builder dispatches card C in repo R. Server picks a runner —
   **the dispatcher's own online runner that has R** (so the build uses *their* clone +
   credentials). If they have none online → actionable error ("connect your machine / clone
   this repo"). Server creates the run, marks the card `building` (locked to that run), and
   sends the job `{ runId, repo, prompt, type, baseBranch, mode, model }`.
3. **Stream:** runner executes the existing worktree/codex-claude flow and streams the
   current events (`run.step/log/progress/diff/status/message/plan`) **up** to the server,
   which persists them and **fans out** to every browser viewing R.
4. **Approve / PR:** runner does the commit + push + `gh`/`glab` PR with the dispatcher's
   credentials; reports `pr_url`. CI status is fetched by the runner (it has the creds) and
   reported; later a forge webhook/GitHub App can update CI without a runner online.
5. **Liveness:** heartbeats; if a runner drops mid-build, the server marks the run
   `interrupted` after a timeout and the card returns to `ready` (server-side version of
   today's reconcile). Re-dispatchable by anyone.
6. **Locking:** exactly one active run per card; the scaffold gate + queue logic move
   server-side so they apply across developers, not just one machine.

## What flows where

- **To the server (shared):** card content + state, run status/steps/progress, diffs, logs,
  chat/comments, PR/CI links, presence.
- **Stays on the runner (private):** the repo working copy, git worktrees, SSH keys, and
  `codex`/`claude`/`gh` auth. The server can orchestrate a build but can't read the code
  except via the diffs/logs the runner chooses to stream.

## Real-time

Per-repo channels on the server. A browser subscribes to the repos it can access; runner
and browser events both publish to the repo channel and fan out. The existing `ServerEvent`
shapes are reused almost verbatim; `card.update` etc. just gain a `repoId` scope.

## Reuse vs. new

- **Reuse:** card/run state machine, `ServerEvent` model, git/worktree/codex-claude
  execution, forge + CI-status layer, scaffold gate, race, queue, the agent itself (becomes
  the runner).
- **New:** the server + Postgres, OAuth + workspaces/roles, the runner registration/dispatch
  protocol (outbound), server-side pub/sub + locking, and a `~/.dispatch` → workspace import.

## Phased roadmap

**Phase 1 — Shared board + auth (no server-driven builds yet).**
Stand up the server + Postgres + forge OAuth + workspaces/members/repos. Web app points at
the server; cards CRUD, drag, priorities, comments, and statuses sync live across devs.
Ships "everyone sees the repo and its cards/states." Builds still run in today's local mode.
- Endpoints: `/auth/*`, `/workspaces`, `/workspaces/:id/members`, `/repos`,
  `/repos/:id/cards`, `PATCH /cards/:id`, `/cards/:id/comments`, `GET /repos/:id/stream` (WS).

**Phase 2 — Runners (distributed execution).**
Agent gains workspace mode + runner token; implements the runner protocol above. Dispatch
routes to the dispatcher's runner; status/diffs/logs stream to the board for all viewers.
Server-side locking + scaffold gate + queue. Run history/metrics become team-wide.

**Phase 3 — Collaboration polish.**
Assignment + presence ("Alice is building card X"), @mentions/comments, cross-dev
notifications, deeper forge integration (optional cards↔issues, webhook-driven CI), and an
optional **shared/cloud runner pool** for builds that shouldn't depend on a laptop.

**Phase 4 — Hardening / product.**
RBAC polish, audit log, secrets, rate limits, SSO, and self-hosted vs hosted packaging.

## Risks / open questions

- **Offline builder** mid-build → run interrupted + reassign; fully solved only by shared
  runners (Phase 3).
- **CI visibility without a runner online** → needs a forge webhook / GitHub App (Phase 3).
- **State migration** from `~/.dispatch/*.json` to Postgres, and keeping local mode working.
- **Cross-dev merge conflicts** on parallel cards → rely on PRs/CI + generalize the scaffold
  gate; surface conflicts on the board.
- **Hosted vs self-hosted** and where the server lives (affects company-code policy).
