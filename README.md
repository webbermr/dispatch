# Dispatch

A per-repo Kanban board for vibe-coding: pick a card describing a feature / bug
fix / enhancement, hand its prompt to **Codex CLI**, and watch it build against
your **local clone** — Ideas → Ready → Building → Needs Review → Merged.

Because browsers are sandboxed, the web board talks to a small **local agent
daemon** over `localhost`; the agent runs git + `codex exec` on your machine, so
your code never leaves it.

```
┌──────────────┐   REST + WebSocket    ┌─────────────────┐   child process   ┌────────────┐
│  web (board) │ ◀──127.0.0.1:4317───▶ │ dispatch-agent  │ ────────────────▶ │ codex exec │
└──────────────┘                       │ git · worktrees │                   └────────────┘
                                        └─────────────────┘
```

## Layout

| Dir | What | Status |
|---|---|---|
| [`web/`](web/) | The Kanban board UI (Vite + React + TS). Faithful recreation of the design prototype. | ✅ built & verified |
| [`agent/`](agent/) | The local agent bridge daemon (`@dispatch/agent`). Spec tickets T1–T8, T9 mostly. | ✅ built & verified |
| `design_handoff_dispatch_kanban/` | The original design handoff — prototype, spec, screenshots. | reference |

Each has its own README with run instructions.

## Quick start

```bash
# 1. Build the web bundle (the agent serves it same-origin)
cd web && npm install && npm run build

# 2. Run the agent — serves the board at http://127.0.0.1:4317 + prints a pair code
cd ../agent && npm install && npm run dev
```

For UI development with hot reload, run `cd web && npm run dev`
(http://localhost:5180) alongside the agent — the agent's CORS + WS origin
allowlist already permits the Vite dev origin.

## Status

Both halves are built, **wired together**, and verified end-to-end.

The web app probes for a local agent on load (`GET /health`):

- **Agent reachable + paired → live mode.** Apps, cards, and runs load from the
  agent; dispatching a card hits `POST /runs`; a WebSocket subscription drives
  the build timeline/terminal/diff/chat in real time; review actions
  (chat, request-changes, approve) call the real endpoints. Pairing is a real
  handshake (the Connect modal's code is what you pass to `npx … --pair`), and
  the token is stored in `localStorage` so a refresh re-attaches.
- **No agent → demo mode.** Falls back to the in-memory seed + build simulation,
  so the UI is fully demoable with zero setup.

All agent network I/O lives in `web/src/lib/agentClient.ts`; the run/card status
ids match 1:1 on both sides.

**Verified end-to-end with real Codex (codex-cli 0.139)**, both via the API and
through the web UI in a browser: dispatch a card → Codex edits files in an
isolated worktree → `--json` events drive the live timeline + terminal → diff
captured and rendered in the review drawer → follow-up message resumes the same
Codex session → approve fast-forward merges into `main`. The demo board still
renders with no agent. (See `agent/README.md` for the §6/§11 CLI specifics.)

### Remaining

- T9 polish: `npx` publish, signed release, trusted-cert fallback for
  independently-deployed pages. T10 (cloud sync) remains out of scope.
