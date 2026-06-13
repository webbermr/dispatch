# Handoff: Dispatch — Vibe-Coding Kanban

## Overview
**Dispatch** is a web-based Kanban board that lets a developer ("vibe coder") pick a card describing a feature / bug fix / enhancement and hand its instructions to **Codex CLI**, which builds it against their locally-cloned repo. The board is organized **one board per app/repo**, with a 5-stage pipeline: **Ideas → Ready → Building → Needs Review → Merged**. Selecting a card opens a drawer that morphs by stage — an editable agent prompt before dispatch, a live build timeline + terminal while building, and a diff viewer + chat in review.

Because browsers are sandboxed, the actual repo checks + Codex execution run through a **local agent daemon** the web app talks to over `localhost`. The UI for that connection (status chip + pairing modal) is in the prototype; the runtime is fully specified in **`Dispatch — Agent Bridge Spec.md`** (also in this bundle).

## About the Design Files
The files in this bundle are **design references created in HTML** — a streaming "Design Component" prototype showing the intended look and behavior. They are **not production code to copy directly**. The task is to **recreate these designs in the target codebase's environment** (React, Vue, Svelte, etc.) using its established patterns, component library, and data layer. If no frontend exists yet, choose the most appropriate framework and implement there. The **backend/runtime** is a separate effort — build it from `Dispatch — Agent Bridge Spec.md` (tickets T1–T9, with T10 planned).

`Dispatch.dc.html` depends on the project's MITRE design-system runtime (`_ds/…`) to render in its original environment; outside it, rely on this README + the spec as the self-sufficient source of truth. The **MITRE Design System** governs all visual tokens — recreate against your equivalent of it, or the tokens listed below.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions. Recreate pixel-faithfully using your codebase's libraries. All hex values, fonts, and measurements below are exact.

---

## Design Tokens (MITRE Design System)

### Colors
| Token | Hex | Use |
|---|---|---|
| MITRE Blue (`--brand-primary`) | `#005B94` | primary actions, links, "Ready" accent, Feature pill text |
| Brand primary hover | `#00497A` | primary button hover |
| Dark Navy | `#0B2338` | top bar, terminal bg, scrims, strong text |
| Navy | `#0D2F4F` | depth surfaces |
| Highlighter Yellow | `#FFF601` | logo mark, **Building** accent, live dots, "Start build" CTA |
| Light Blue | `#87DEFF` | lift |
| Neutral 0 / 50 / 100 / 200 / 300 / 400 / 500 / 600 / 700 | `#FFFFFF` / `#F7F9FA` / `#F1F3F4` / `#E4EDEE` / `#D4D4D3` / `#B9BDBF` / `#7E8284` / `#6F7981` / `#45525C` | surfaces, borders, muted text |
| Status success / surface | `#248541` / `#E6F3EA` | Merged, "cloned", diff-add bg |
| Status warning / surface | `#D4452D` / `#FCEAE3` | Needs Review, "not cloned" |
| Status danger / surface | `#D02027` / `#FBE7E8` | Bug pill, diff-del bg, danger actions |
| Status info / surface | `#157FAC` / `#E6F4FB` | info |
| Purple dark | `#5D4A9E` | Enhancement pill text |
| Green / Orange / Yellow light | `#4EB96F` / `#FF6D2D` / `#FDDB00` | agent status dot (on dark bg) |

**Derived/inline values used in the prototype:** Feature pill bg `#E1EEF6`; Enhancement pill bg `#EFEAF6`; "Sent to Codex" pill bg `#FFFBC2` / text `#5C5400`; diff-add text `#1c6b39`; diff-del text `#a3232a`; terminal text `#CFE6F5`, success-line `#7BE0A0`, edit-line `#9BD4FF`; build progress gradient `linear-gradient(90deg,#FFF601,#FFE94D)`.

### Typography
- **Display** (`--font-display`): **Barlow Semi Condensed** (700) — wordmark, big headings ("Your apps"), all-caps. Falls back to Trade Gothic / Arial Narrow.
- **Heading/UI** (`--font-heading`): **Barlow** (700) — card titles, labels, buttons, badges.
- **Body** (`--font-body`): **Arimo** (Arial-metric) — descriptions, paragraphs.
- **Mono** (`--font-mono`): `ui-monospace, "SF Mono", Menlo, Consolas` — repos, branches, prompts, logs, diffs.
- Scale (px): display-lg 46 · h2 28 · h3 22 · h4 18 · base 16 · sm 14 · xs 12. Body line-height 1.5 (508 minimum). Overline tracking `.12–.14em`, uppercase.

### Spacing / radius / shadow / motion
- Spacing 4px base: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64.
- Radius: xs 2 · **sm 4 (default)** · md 6 · lg 10 · pill 999. Brand reads structural — restrained corners.
- Shadows (cool, low): xs `0 1px 2px rgba(11,35,56,.06)` · sm · md `0 4px 12px rgba(11,35,56,.10)` · lg `0 12px 28px rgba(11,35,56,.14)` · xl.
- Motion: 120–280ms, ease `cubic-bezier(0.2,0,0.2,1)`. **No bounce.** Card hover lifts `translateY(-2px)` + larger shadow.
- Focus ring: `0 0 0 3px rgba(56,196,242,.45)`.

---

## Screens / Views

### A. Top bar (persistent, all screens)
- **Layout:** 58px tall, full-width, bg Dark Navy `#0B2338`, white text, horizontal flex, 22px side padding, gap 14px.
- **Components (left→right):** 30×30 Highlighter square (radius 4) with display "D" in Dark Navy → "DISPATCH" wordmark (Barlow Semi Condensed 22px) → divider → tagline "Pick a card. Ship a feature." (12.5px, muted `#AFC2D1`) → flex spacer → **Agent status chip** (see §E) → 1px divider → "BUILT WITH" overline → MITRE white wordmark SVG (16px tall).

### B. App picker (default landing)
- **Layout:** centered column, max-width 1080px, padding `52px 32px 72px`.
- **Header:** overline "WORKSPACE" (12px, brand blue) · h1 "Your apps" (display 46px, strong) · subtitle (16px muted, max-width 540px).
- **Grid:** `repeat(auto-fill, minmax(300px,1fr))`, gap 18px.
- **App card:** white, 1px border `#E4EDEE`, radius 6, padding 18, shadow-xs; **hover** → shadow-lg + `translateY(-3px)`; cursor pointer.
  - Row: 44×44 initials square (radius 4, app accent color bg, white display 19px) + name (Barlow 17px strong) + repo slug (mono 12px muted, ellipsis).
  - Stack line (13px muted).
  - Footer (top border): **clone status pill** — pill, 24px tall; cloned = success-surface bg / success text + dot; not-cloned = warning-surface / warning. Right: card count (mono 12.5px subtle, e.g. "8 cards · 1 building").
- **Seed apps:** Pocket Ledger (`maya/pocket-ledger`, cloned, accent brand-blue), TrailMix (`maya/trailmix`, cloned, navy), Glassbox CMS (`maya/glassbox`, **not cloned**, blue2-dark), Hearth (`maya/hearth-iot`, cloned, purple-dark).

### C. Board (per app)
- **Sub-header bar:** white, bottom border, padding `12px 22px`, flex. Back button (34×34 bordered) + app name (Barlow 18px) & repo (mono 12px) + clone-status pill + spacer + "**+ New card**" button (36px, bordered, brand-blue text).
- **Columns row:** horizontal scroll, padding 22, gap 16, `align-items:flex-start`.
- **Column:** width 304px (fixed), bg neutral-100 `#F1F3F4`, 1px border, radius 6, `max-height: calc(100vh - 154px)`, vertical flex.
  - **Header:** 3px top accent border in column color; title (Barlow 13px, uppercase, tracking .07em); count chip (pill, neutral-200 bg). **Building** column shows a pulsing highlighter dot (animation `dppulse` 1.3s) when it has cards.
  - **Column accent colors:** Ideas `--neutral-400`, Ready brand-blue, **Building highlighter `#FFF601`**, Needs Review warning, Merged success.
  - Empty column → dashed-border hint text.
- **Card (article):** white, 1px border, **3px left border in the card's type color**, radius 4, padding `12px 13px`, shadow-xs; hover lift; `draggable`.
  - Row1: **type pill** (Feature = `#E1EEF6`/blue, Bug = danger-surface/danger, Enhancement = `#EFEAF6`/purple; 20px tall, radius 2, uppercase 10.5px Barlow) + spacer + **priority** dot+label (High=danger, Medium=warning, Low=neutral-500).
  - Title (Barlow 15px strong) · description (12.5px muted, clamp 2 lines).
  - Footer varies by status:
    - **Building:** current step (mono 11px) + percent (mono 11px bold) + 6px striped progress bar (highlighter gradient, animation `dpstripe` .8s linear infinite, width = live %).
    - **Needs Review:** "+adds −dels · N files" (mono 11.5px) + "Review →" (Barlow 12px, warning).
    - **Branch** (ideas/ready/merged with a branch): "⎇ branch" (mono 11.5px subtle).

### D. Card drawer (right slide-over, 580px, full height)
Scrim `rgba(11,35,56,.55)` + 2px blur; click scrim to close. Header: type pill + **status pill** + title (Barlow 21px) + × close. Body scrolls; content depends on status:

1. **Plan (Ideas / Ready):** Description block · 3 meta tiles (Type / Priority / Base branch, mono) · **Agent instructions** label + "Sent to Codex" pill + helper "This exact prompt is what Codex receives. Edit it before you dispatch." + **editable `<textarea>`** (mono 12.5px, neutral-50 bg, min-height 188, resizable) · repo-ready callout (left-accent bar, success if cloned / warning if not) · actions: **"Start build →"** (highlighter button) + "Close" (secondary).
2. **Building:** status row (pulsing highlighter dot + "Codex is building…" + branch mono) · live progress bar + % · **timeline** of 5 steps (Cloning context / Planning changes / Editing files / Running tests / Opening pull request) — done = green check, active = blue spinner (`dpspin` .8s), pending = hollow dot · **Raw log** toggle → dark-navy terminal panel (mono 12px, auto-scrolls to bottom; lines colorized: `$`=highlighter, ✓/PASS=green `#7BE0A0`, ✎ edits=blue `#9BD4FF`, else `#CFE6F5`) · footer "Stop build" (secondary).
3. **Needs Review:** summary bar (branch + +adds/−dels/files, mono) · **Diff | Chat** tab bar (underline tabs, brand-blue active).
   - **Diff:** per file: header (neutral-100 bg, mono filename + +/− counts) then unified diff lines — add = bg `#E6F3EA` text `#1c6b39` prefix `+`; del = bg `#FBE7E8` text `#a3232a` prefix `−`; ctx = white. Mono 12px.
   - **Chat:** message thread (agent left = neutral-100 bubble, user right = brand-blue bubble; role label above each) + input textarea (Enter sends, Shift+Enter newline) + Send button.
   - Footer (both tabs): **"Approve & merge"** (primary) + "Request changes" (secondary).
4. **Merged:** centered success — 64px green check circle · "Merged to main" (Barlow 24px) · description · branch chip (mono, "⎇ branch → main") · +/− stats · "View pull request →" link · timestamp.

### E. Agent connection (the local-bridge UI)
- **Status chip** (top bar): pill, 32px, translucent white border on navy; dot color = connected→green-light `#4EB96F`, connecting→yellow-light, offline→orange-light `#FF6D2D`; label mono 12px: "Agent · localhost:4317" / "Connecting…" / "Agent offline". Click → opens Connect modal.
- **Connect modal:** centered card, max-width 468, radius 6, 4px brand-blue top border, scrim + blur.
  - Icon tile (38px, `#E1EEF6`/blue) + "Connect your machine" (Barlow 19px) · explanatory paragraph ("Dispatch runs Codex on your own machine through a small local agent, so your code never leaves your computer…") · **command block** (dark-navy bg, mono: `$ npx @dispatch/agent --pair 7F3A-29C1`, highlighter `$`, "copy" affordance) · **status row** in a neutral-50 box: connected = green check + "Connected · localhost:4317 · codex 0.42"; connecting = spinner + "Waiting for the agent to pair…"; offline = warning dot + "No agent detected on this machine."
  - Footer: connected → "Done" (primary) + "Disconnect" (secondary); offline → "I've run it →" (primary, simulates pairing) + "Cancel".

---

## Interactions & Behavior
- **Open app** → board view for that app; **back arrow** → picker.
- **Open card** → drawer (review cards default to the Diff tab).
- **Start build / drag a card into Building** → dispatch flow:
  1. **Agent gate:** if the agent isn't connected, open the Connect modal + toast "Connect your machine to dispatch".
  2. **Clone gate:** if the app's repo isn't cloned, open the clone modal (`git clone …`); on confirm, mark cloned then dispatch.
  3. **Dispatch:** card → Building, branch generated from type+title (`feat/… | fix/… | enh/…`), toast "Dispatched to local agent · branch", build begins streaming.
- **Build sim (prototype only):** advances a step timeline + appends log lines until 100%, then auto-moves the card to Needs Review with a generated diff + an initial agent chat message. *(In production this is driven by real Codex output — see spec §6.)*
- **Chat send** → appends user bubble, simulated agent reply after ~1.1s. **Request changes** → card back to Building, re-runs. **Approve & merge** → card to Merged + toast.
- **Drag & drop:** cards are draggable between columns; dropping into Building triggers the dispatch flow; other drops just set status.
- **Animations:** `dppulse` (live dots), `dpspin` (spinners), `dpstripe` (progress bar), `dpfade` (modals/toasts). Drawer appears instantly (no entrance animation — intentional, avoids re-render fl: see note in Files).
- **Toast:** bottom-center, dark-navy, highlighter dot, auto-dismiss ~2.4s.

## State Management
Single board store. Key state:
- `view` (`picker`|`board`), `appId`, `openCardId`, `detailTab` (`diff`|`chat`), `draggingId`.
- `apps[]`: `{id, name, repo, stack, cloned, base, accent}`.
- `cards[]`: `{id, appId, type, priority, status, title, desc, prompt, branch?, build?, diff?, chat?, mergedAt?}` where `build = {progress, currentStep, logs[]}` and `diff = [{file, add, del, lines:[{t,text}]}]`.
- Agent: `agentStatus` (`connected`|`offline`), `agentBusy`, `agentPort`, `connectOpen`.
- UI: `cloneModal`, `logOpen{}`, `chatDrafts{}`, `toast`.
- **Data fetching (production):** replace the in-memory seed + simulated timers with the agent REST/WebSocket protocol in `Dispatch — Agent Bridge Spec.md` §4. Statuses and step ids map 1:1 to the board columns and the build timeline.

## Assets
- `assets/mitre-wordmark-white.svg` — official MITRE wordmark (white, for the dark top bar). Included in this bundle.
- The "D" logo mark and the framing motifs are CSS/text, no image asset.
- Icons are inline glyphs/SVG (✓, ⎇, ▶, ×, ⎘). Recommended icon set for production: **Lucide** (2px stroke) to match the MITRE line style.
- **Brand note:** use your codebase's existing MITRE design-system tokens/components rather than re-deriving these values.

## Screenshots
Reference captures of every screen/state are in `screenshots/`:
- `01-app-picker.png` — App picker (clone status per app)
- `02-board.png` — TrailMix board, all 5 columns (note the live "Building" card)
- `03-building-drawer.png` — Building drawer: timeline + striped progress + raw terminal log
- `04-plan-drawer.png` — Plan drawer: editable agent prompt ("Sent to Codex")
- `05-review-drawer.png` — Review drawer: colored diff + Diff/Chat tabs + Approve/Request-changes
- `06-connect-modal.png` — "Connect your machine" (local agent pairing)
- `07-clone-modal.png` — Pre-flight "Repo not cloned" gate before dispatch

## Files
- `Dispatch.dc.html` — the interactive prototype (all screens + states + the build simulation). Reference for layout, copy, and behavior. *(Note: the drawer's entrance animation was intentionally removed — repeated re-renders re-triggered the CSS keyframe and left it stuck at the start frame; recreate the drawer without a re-triggering entrance animation, or drive it from mount-once state.)*
- `Dispatch — Agent Bridge Spec.md` — the **backend/runtime** spec: architecture, localhost REST + WebSocket protocol, repo/clone checks, Codex `exec` invocation + diff capture, review/merge, pairing & security (decided: agent serves the web bundle, same-origin), persistence (decided: local v1), and **10 ordered build tickets** (T1–T9 for v1, T10 = planned cloud sync).
