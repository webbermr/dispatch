# Dispatch — Web App

The browser-based Kanban board for vibe-coding: pick a card, hand its prompt to
Codex CLI, watch it build against your local repo. This is the **web UI** (the
control surface). It's a faithful recreation of the approved design prototype
in `../design_handoff_dispatch_kanban/Dispatch.dc.html`.

Built with **Vite + React + TypeScript**. State lives in a single
[zustand](https://github.com/pmndrs/zustand) store. The MITRE design-system
tokens are recreated as CSS variables in `src/styles/tokens.css`.

## Run

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # type-check + production bundle to dist/
```

## What's implemented

All five screens / states from the handoff, pixel-faithful to the prototype:

- **App picker** — per-repo cards with clone status + card counts.
- **Board** — 5-column pipeline (Ideas → Ready → Building → Needs Review →
  Merged), drag-and-drop between columns, live "Building" pulse.
- **Card drawer** that morphs by status:
  - *Plan* (Ideas/Ready) — editable "Sent to Codex" prompt + repo-ready callout.
  - *Building* — step timeline, striped progress bar, auto-scrolling terminal.
  - *Needs Review* — colored diff viewer + chat thread (Diff/Chat tabs).
  - *Merged* — success summary with branch + diff stats.
- **Connect modal** — local-agent pairing UI (status chip in the top bar).
- **Clone modal** — pre-flight gate when a repo isn't on the machine.
- **Toasts**, the full dispatch flow (agent gate → clone gate → dispatch), and
  the build simulation (advances the timeline/terminal, then moves to review).

## Data layer — live + demo

On load the store probes for the local agent (`GET /health`) and picks a mode:

- **Live** (agent reachable + paired): apps, cards, and runs come from the agent
  via `src/lib/agentClient.ts`; dispatch/review actions call the REST endpoints;
  a WebSocket subscription streams `run.*` / `card.update` events that drive the
  board in real time. The pairing token is kept in `localStorage` so a refresh
  re-attaches. Agent payloads are mapped to the store's `App`/`Card` shapes in
  `src/lib/agentMap.ts`, so the components are identical in both modes.
- **Demo** (no agent): the in-memory seed + simulated build timers (mirrors the
  original prototype), so the UI works with zero setup.

The agent is the bridge daemon in `../agent/` (spec
`../design_handoff_dispatch_kanban/Dispatch — Agent Bridge Spec.md`). Statuses
(`ideas/ready/building/review/merged`) and step ids
(`cloning/planning/editing/testing/pr`) match the protocol 1:1.

Point at a specific agent with `VITE_AGENT_URL` (defaults to same-origin when
served by the agent on :4317, else `http://127.0.0.1:4317`).

## Structure

```
src/
  store/        zustand store, types, seed data
  lib/          visual maps (TYPE/PRI/STATUS/COLS) + helpers
  components/   TopBar, AppPicker, Board, Card, modals, Toast
    drawer/     PlanDetail, BuildingDetail, ReviewDetail, MergedDetail
  styles/       tokens.css (MITRE DS), global.css (keyframes, resets)
```
