import { create } from 'zustand'
import { agent, AgentError, type AgentCard, type AgentRun, type ServerEvent } from '../lib/agentClient'
import { currentStepLabel, mapApp, mapCard, runStatusToCard } from '../lib/agentMap'
import { EXAMPLE_DESC, EXAMPLE_PROMPT } from '../lib/constants'
import { branchSlug } from '../lib/helpers'
import type {
  AgentStatus,
  App,
  Card,
  CardStatus,
  CardType,
  ChatMessage,
  CloneModalState,
  CodingAgentId,
  DetailTab,
  DiffFile,
  View,
} from './types'

export interface BoardFilter {
  text: string
  type: CardType | 'all'
  agent: CodingAgentId | 'all'
}

interface DispatchState {
  // ---- navigation / view ----
  view: View
  appId: string | null
  openCardId: string | null
  /** A freshly-created card whose title should be focused + selected once. */
  focusTitleCardId: string | null
  detailTab: DetailTab
  draggingId: string | null

  // ---- data ----
  apps: App[]
  cards: Card[]

  // ---- agent (local bridge) ----
  /** Health reachable (an agent process is listening). */
  agentPresent: boolean
  /** Paired + data loaded from the agent (vs. the demo seed + simulation). */
  live: boolean
  agentStatus: AgentStatus
  agentBusy: boolean
  agentPort: number
  connectOpen: boolean
  addAppOpen: boolean
  pairCode: string
  health: {
    codexInstalled: boolean
    codexVersion: string | null
    ghInstalled: boolean
    ghAuthed: boolean
    glabInstalled: boolean
    glabAuthed: boolean
    concurrency: number
    agents: { id: 'codex' | 'claude'; label: string; installed: boolean; version: string | null; models: { id: string; label: string }[] }[]
  } | null
  /** Build-queue snapshot surfaced in the board header. */
  queue: { concurrency: number; active: number; queued: number }
  /** App id whose AGENTS.md is being generated right now (for progress UI). */
  agentsMdBusy: string | null
  /** Card ids currently being split into sub-cards (for progress UI). */
  decomposing: string[]

  // ---- ui ----
  cloneModal: CloneModalState | null
  /** Generic in-app confirmation dialog (replaces window.confirm). */
  confirm: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void } | null
  askConfirm: (c: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void }) => void
  closeConfirm: () => void
  logOpen: Record<string, boolean>
  chatDrafts: Record<string, string>
  toast: string | null

  // ---- lifecycle ----
  init: () => Promise<void>

  // ---- actions ----
  openApp: (id: string) => void
  backToPicker: () => void
  openCard: (id: string) => void
  closeCard: () => void
  consumeTitleFocus: () => void
  setTab: (t: DetailTab) => void
  toggleLog: (id: string) => void
  newCard: () => void
  editCard: (id: string, patch: Partial<Pick<Card, 'title' | 'desc' | 'prompt' | 'type' | 'priority' | 'base'>>) => void
  editPrompt: (id: string, val: string) => void
  deleteCard: (id: string) => void

  startCard: (id: string) => void
  confirmClone: () => void
  cancelClone: () => void

  openConnect: () => void
  closeConnect: () => void
  reconnect: () => void
  disconnect: () => void

  openAddApp: () => void
  closeAddApp: () => void
  addApp: (localPath: string, name: string, repoMode?: 'local' | 'remote') => Promise<string | null>
  cloneAndAddApp: (repoUrl: string, parentDir: string, name: string) => Promise<string | null>
  removeApp: (id: string) => void
  setAppMergeMode: (id: string, mode: 'pr' | 'merge') => void
  setAppBuildLocation: (id: string, where: 'worktree' | 'workdir') => void
  setAppAgent: (id: string, agentId: 'codex' | 'claude') => void
  setAppPlanFirst: (id: string, on: boolean) => void
  setAppAutoRetry: (id: string, on: boolean) => void
  setAppPreviewCommand: (id: string, cmd: string) => void
  setAppRepoMode: (id: string, mode: 'local' | 'remote') => void
  generateAgentsMd: (id: string) => void

  // ---- queue / model / decompose ----
  setCardModel: (id: string, model: string) => void
  decomposeCard: (id: string, count?: number) => void
  buildAllReady: () => void
  cancelQueued: (id: string) => void

  // ---- archive / search / notifications / metrics ----
  archiveCard: (id: string) => void
  unarchiveCard: (id: string) => void
  clearShipped: () => void
  archiveOpen: boolean
  setArchiveOpen: (open: boolean) => void
  filter: BoardFilter
  setFilter: (patch: Partial<BoardFilter>) => void
  notify: boolean
  toggleNotify: () => void
  statsOpen: boolean
  setStatsOpen: (open: boolean) => void

  // ---- AI app builder ----
  builderOpen: boolean
  openBuilder: () => void
  closeBuilder: () => void
  /** Create the repo (local / new-remote / clone) + the plan's cards, then open it. */
  createAppFromPlan: (
    plan: import('../lib/agentClient').BuilderPlan,
    choice: { mode: 'local' | 'new-remote' | 'clone'; parentDir: string; name: string; slug: string; private?: boolean; repoUrl?: string },
  ) => Promise<boolean>

  // ---- repo Q&A chat ----
  repoChatOpen: boolean
  repoChats: Record<string, { messages: ChatMessage[]; thinking: boolean; note?: string }>
  repoChatDraft: string
  openRepoChat: () => void
  closeRepoChat: () => void
  setRepoChatDraft: (v: string) => void
  askRepo: () => void
  clearRepoChat: () => void
  /** Bridge: turn a chat answer into a card (optionally splitting it into sub-cards). */
  createCardFromText: (title: string, prompt: string, decompose?: boolean) => void

  // ---- #1 race / #2 plan-first / #3 preview ----
  raceCard: (cardId: string) => void
  approvePlan: (cardId: string) => void
  requestPlanChanges: (cardId: string) => void
  pickWinner: (cardId: string, runId: string) => void
  preview: { running: boolean; url: string | null; cardId: string | null; command?: string }
  startPreview: (cardId: string, command?: string) => void
  endPreview: (cardId: string) => void
  openWorktree: (cardId: string) => void
  checkoutBranch: (cardId: string) => void

  moveCard: (id: string | null, key: CardStatus) => void
  /** Drop a dragged card above/below another: reorder within a column, or move between them. */
  dropOnCard: (draggedId: string, targetId: string, position: 'above' | 'below') => void
  /** Drop a dragged card onto a column's empty area (move there / to the bottom). */
  dropOnColumn: (draggedId: string, status: CardStatus) => void
  setDragging: (id: string | null) => void
  pullRepo: (id: string) => void
  setChatDraft: (id: string, val: string) => void
  sendChat: (id: string) => void
  requestChanges: (id: string) => void
  approveMerge: (id: string) => void
  stopBuild: (id: string) => void
}

// ---- imperative side-effects (live outside React, like the prototype's class fields) ----
const buildTimers: Record<string, ReturnType<typeof setInterval>> = {}
const promptPatch: Record<string, ReturnType<typeof setTimeout>> = {}
const pendingPatch: Record<string, Partial<Pick<Card, 'title' | 'desc' | 'prompt' | 'type' | 'priority' | 'base'>>> = {}
let toastTimer: ReturnType<typeof setTimeout> | undefined
let chatTimer: ReturnType<typeof setTimeout> | undefined
let agentTimer: ReturnType<typeof setTimeout> | undefined
let ws: WebSocket | null = null

const NOTIFY_KEY = 'dispatch.notify'

/** Whether desktop notifications were enabled (persisted) and are still permitted. */
function notifyInitial(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted'
  } catch {
    return false
  }
}

/** Fire a desktop notification (best-effort; silently no-ops if not permitted). */
function notifyDesktop(title: string, body: string): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.svg' })
    }
  } catch {
    /* notifications unavailable */
  }
}

/** A pairing code, displayed in the Connect modal and embedded in the npx command. */
function makePairCode(): string {
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const g = () => Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('')
  return `${g()}-${g()}`
}

export const useStore = create<DispatchState>((set, get) => {
  // ---- internal helpers ----
  const app = (id: string | null) => get().apps.find((a) => a.id === id)
  const card = (id: string | null) => get().cards.find((c) => c.id === id)
  const cardByRun = (runId: string) => get().cards.find((c) => c.runId === runId)
  const updateCard = (id: string, fn: (c: Card) => Card) =>
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? fn(c) : c)) }))

  const toast = (msg: string) => {
    clearTimeout(toastTimer)
    set({ toast: msg })
    toastTimer = setTimeout(() => set({ toast: null }), 2400)
  }

  // ============ LIVE MODE (agent-backed) ============

  /** Fetch apps + cards + runs from the agent and build the board state. */
  const loadLive = async () => {
    const [{ apps: aApps }, { cards: aCards }, { runs: aRuns }] = await Promise.all([
      agent.listApps(),
      agent.listCards(),
      agent.listRuns(),
    ])
    const runById = new Map(aRuns.map((r) => [r.id, r]))
    const apps = aApps.map((a, i) => mapApp(a, i))
    const cards = aCards.map((c: AgentCard) => mapCard(c, c.runId ? runById.get(c.runId) : undefined))
    set({ apps, cards, live: true, agentStatus: 'connected' })
    agent.queue().then((q) => set({ queue: q })).catch(() => {})
    openStream()
  }

  const openStream = () => {
    ws?.close()
    ws = agent.openStream(applyEvent, () => set({ agentStatus: get().live ? 'offline' : get().agentStatus }))
  }

  /** Apply a streamed agent event to the live board. */
  const applyEvent = (ev: ServerEvent) => {
    switch (ev.type) {
      case 'agent.status':
        set({ agentStatus: ev.online ? 'connected' : 'offline' })
        break
      case 'card.update': {
        const incoming = mapCard(ev.card)
        set((s) => {
          const existing = s.cards.find((c) => c.id === incoming.id)
          // Preserve live build/diff/chat already accumulated from run events.
          const merged = existing ? { ...existing, ...incoming, build: existing.build, diff: existing.diff, chat: existing.chat } : incoming
          return { cards: existing ? s.cards.map((c) => (c.id === incoming.id ? merged : c)) : [incoming, ...s.cards] }
        })
        break
      }
      case 'run.status': {
        const c = cardByRun(ev.runId)
        if (c) {
          updateCard(c.id, (cc) => ({ ...cc, status: runStatusToCard(ev.status) }))
          // Desktop notification on terminal transitions (the user has likely walked away).
          if (get().notify) {
            if (ev.status === 'needs_review') notifyDesktop('Ready for review ✓', c.title)
            else if (ev.status === 'failed') notifyDesktop('Build failed ✕', c.title)
          }
        }
        break
      }
      case 'run.progress': {
        const c = cardByRun(ev.runId)
        if (c) updateCard(c.id, (cc) => ({ ...cc, build: { ...(cc.build ?? { progress: 0, currentStep: '', logs: [] }), progress: ev.pct } }))
        break
      }
      case 'run.step': {
        const c = cardByRun(ev.runId)
        if (c) {
          const label = currentStepLabel({ steps: [{ id: ev.step, state: ev.state }], progress: c.build?.progress ?? 0, status: 'building' })
          updateCard(c.id, (cc) => ({ ...cc, build: { ...(cc.build ?? { progress: 0, currentStep: '', logs: [] }), currentStep: label } }))
        }
        break
      }
      case 'run.log': {
        const c = cardByRun(ev.runId)
        if (c) updateCard(c.id, (cc) => ({ ...cc, build: { ...(cc.build ?? { progress: 0, currentStep: '', logs: [] }), logs: [...(cc.build?.logs ?? []), ev.line] } }))
        break
      }
      case 'run.diff': {
        const c = cardByRun(ev.runId)
        if (c) updateCard(c.id, (cc) => ({ ...cc, diff: ev.files }))
        break
      }
      case 'run.message': {
        const c = cardByRun(ev.runId)
        if (c) updateCard(c.id, (cc) => ({ ...cc, chat: [...(cc.chat ?? []), { role: ev.message.role, text: ev.message.text }] }))
        break
      }
      case 'run.plan': {
        const c = cardByRun(ev.runId)
        if (c) updateCard(c.id, (cc) => ({ ...cc, plan: ev.plan, phase: 'plan_review' }))
        break
      }
      case 'card.remove': {
        set((s) => ({
          cards: s.cards.filter((c) => c.id !== ev.cardId),
          openCardId: s.openCardId === ev.cardId ? null : s.openCardId,
        }))
        break
      }
      case 'app.remove': {
        set((s) => ({
          apps: s.apps.filter((a) => a.id !== ev.appId),
          cards: s.cards.filter((c) => c.appId !== ev.appId),
          ...(s.appId === ev.appId ? { view: 'picker' as View, appId: null, openCardId: null } : null),
        }))
        break
      }
      case 'queue.update': {
        set({ queue: { concurrency: ev.concurrency, active: ev.active, queued: ev.queued } })
        break
      }
      case 'notice': {
        toast(ev.message)
        // A decompose notice (success or failure) carries its cardId → stop its spinner.
        if (ev.cardId) set((s) => ({ decomposing: s.decomposing.filter((id) => id !== ev.cardId) }))
        break
      }
      case 'chat.message': {
        set((s) => {
          const cur = s.repoChats[ev.appId] ?? { messages: [], thinking: false }
          return { repoChats: { ...s.repoChats, [ev.appId]: { ...cur, messages: [...cur.messages, { role: ev.message.role, text: ev.message.text }] } } }
        })
        break
      }
      case 'chat.status': {
        set((s) => {
          const cur = s.repoChats[ev.appId] ?? { messages: [], thinking: false }
          return { repoChats: { ...s.repoChats, [ev.appId]: { ...cur, thinking: ev.thinking, note: ev.thinking ? ev.note ?? cur.note : undefined } } }
        })
        break
      }
    }
  }

  /** Pull a single run's full state and merge it onto its card (e.g. after an action). */
  const refreshRun = async (runId: string) => {
    try {
      const run: AgentRun = await agent.getRun(runId)
      const c = cardByRun(runId)
      if (!c) return
      updateCard(c.id, (cc) => ({
        ...cc,
        status: runStatusToCard(run.status),
        branch: run.branch,
        prUrl: run.prUrl ?? cc.prUrl,
        worktreePath: run.worktreePath ?? cc.worktreePath,
        agentId: run.agentId ?? cc.agentId,
        phase: run.phase ?? cc.phase,
        plan: run.plan ?? cc.plan,
        build: { progress: run.progress, currentStep: currentStepLabel(run), logs: run.logs },
        diff: run.diff.length ? run.diff : cc.diff,
        chat: run.chat.length ? run.chat.map((m) => ({ role: m.role, text: m.text })) : cc.chat,
      }))
    } catch {
      /* best effort */
    }
  }

  // ============ DEMO MODE (in-memory simulation) ============

  const curStep = (p: number) => {
    if (p < 12) return 'Cloning context'
    if (p < 32) return 'Planning changes'
    if (p < 68) return 'Editing files'
    if (p < 92) return 'Running tests'
    return 'Opening pull request'
  }

  const buildScript = (c: Card): string[] => [
    `✓ Repo synced · ${app(c.appId)?.repo} @ main`,
    '→ Reading the task & relevant files',
    '→ Planning the change set',
    '✎ editing source files',
    '✎ writing new components',
    '  + wiring it together',
    '▶ running: yarn test --watch=false',
    '  PASS  unit suite',
    '  PASS  integration suite',
    '✓ all tests passed',
    '▶ committing & opening pull request',
  ]

  const finishBuild = (id: string) => {
    const c = card(id)
    if (!c) return
    const diff: DiffFile[] =
      c.diff && c.diff.length
        ? c.diff
        : [
            {
              file: 'src/screens/TrailDetail.tsx', add: 18, del: 3, lines: [
                { t: 'ctx', text: '  const trail = useTrail(id);' },
                { t: 'add', text: '  const onShare = useCallback(() => {' },
                { t: 'add', text: '    Share.share({ url: `trailmix://trail/${trail.id}`, title: trail.name });' },
                { t: 'add', text: '  }, [trail]);' },
                { t: 'add', text: '' },
                { t: 'add', text: '  <ShareButton onPress={onShare} />' },
              ],
            },
            {
              file: 'src/components/ShareSheet.tsx', add: 41, del: 0, lines: [
                { t: 'add', text: 'export function ShareButton({ onPress }) {' },
                { t: 'add', text: '  return <IconButton icon="share" onPress={onPress} accessibilityLabel="Share trail" />;' },
                { t: 'add', text: '}' },
              ],
            },
            {
              file: 'src/navigation/links.ts', add: 8, del: 1, lines: [
                { t: 'del', text: "  prefixes: ['trailmix://']," },
                { t: 'add', text: "  prefixes: ['trailmix://', 'https://trailmix.app']," },
                { t: 'add', text: '  config: { screens: { TrailDetail: "trail/:id" } },' },
              ],
            },
          ]
    updateCard(id, (cc) => ({
      ...cc,
      status: 'review',
      build: { ...(cc.build ?? { progress: 0, currentStep: '', logs: [] }), progress: 100, currentStep: 'Done' },
      diff,
      chat:
        cc.chat && cc.chat.length
          ? cc.chat
          : [
              {
                role: 'agent',
                text: 'Build complete. Added a native share sheet and a `trailmix://trail/:id` deep link so shared trails open straight in the app. 3 files changed, all tests passing. Want a copy-link fallback for folks without the app installed?',
              },
            ],
    }))
    toast(`Ready for review · ${c.branch || ''}`)
  }

  const tick = (id: string) => {
    const c = card(id)
    if (!c || c.status !== 'building' || !c.build) {
      clearInterval(buildTimers[id])
      delete buildTimers[id]
      return
    }
    const p = Math.min(100, c.build.progress + (4 + Math.floor(Math.random() * 5)))
    const script = buildScript(c)
    const logs = c.build.logs.slice()
    if (logs.length < script.length) logs.push(script[logs.length])
    else logs.push(`  · working… (${p}%)`)
    updateCard(id, (cc) => ({
      ...cc,
      build: { ...(cc.build as NonNullable<Card['build']>), progress: p, currentStep: curStep(p), logs },
    }))
    if (p >= 100) {
      clearInterval(buildTimers[id])
      delete buildTimers[id]
      setTimeout(() => finishBuild(id), 650)
    }
  }

  const runBuild = (id: string) => {
    if (buildTimers[id]) return
    buildTimers[id] = setInterval(() => tick(id), 1100)
  }

  const dispatchDemo = (id: string) => {
    const c = card(id)
    if (!c) return
    const branch = c.branch || branchSlug(c.title, c.type)
    updateCard(id, (cc) => ({
      ...cc,
      status: 'building',
      branch,
      build: {
        progress: 0,
        currentStep: 'Queued',
        logs: [`$ codex run --task ${id.toUpperCase()} --branch ${branch}`, '→ Connecting to Codex…'],
      },
    }))
    set({ draggingId: null })
    toast(`Dispatched to Codex · ${branch}`)
    setTimeout(() => runBuild(id), 400)
  }

  /** Live dispatch: POST /runs, then attach the returned runId to the card. */
  const dispatchLive = async (id: string) => {
    const c = card(id)
    if (!c) return
    try {
      const res = await agent.dispatch({ appId: c.appId, cardId: c.id, prompt: c.prompt ?? '', type: c.type, baseBranch: c.base || app(c.appId)?.base, title: c.title, model: c.model })
      set({ draggingId: null })
      if ('blocked' in res) {
        updateCard(id, (cc) => ({ ...cc, blocked: true, status: 'ready' }))
        toast(`Waiting on the scaffold "${res.scaffoldTitle}" to merge first`)
        return
      }
      if ('queued' in res) {
        updateCard(id, (cc) => ({ ...cc, queued: true, status: 'ready' }))
        toast('At capacity — card queued')
        return
      }
      const { runId, branch } = res
      updateCard(id, (cc) => ({ ...cc, status: 'building', queued: false, runId, branch, agentId: res.agentId, build: { progress: 0, currentStep: 'Queued', logs: [] } }))
      toast(`Dispatched · ${branch}`)
    } catch (err) {
      toast(`Dispatch failed: ${(err as Error).message}`)
    }
  }

  return {
    view: 'picker',
    appId: null,
    openCardId: null,
    focusTitleCardId: null,
    detailTab: 'diff',
    draggingId: null,

    // No demo data — the board is empty until a machine is connected and a repo added.
    apps: [],
    cards: [],

    agentPresent: false,
    live: false,
    agentStatus: 'connected',
    agentBusy: false,
    agentPort: 4317,
    connectOpen: false,
    addAppOpen: false,
    pairCode: makePairCode(),
    health: null,
    queue: { concurrency: 3, active: 0, queued: 0 },
    agentsMdBusy: null,
    decomposing: [],
    archiveOpen: false,
    filter: { text: '', type: 'all', agent: 'all' },
    notify: notifyInitial(),
    statsOpen: false,
    repoChatOpen: false,
    repoChats: {},
    repoChatDraft: '',
    builderOpen: false,

    cloneModal: null,
    confirm: null,
    askConfirm: (c) => set({ confirm: c }),
    closeConfirm: () => set({ confirm: null }),
    logOpen: {},
    chatDrafts: {},
    toast: null,
    preview: { running: false, url: null, cardId: null },

    // ---- lifecycle: probe the agent, switch to live if reachable + paired ----
    init: async () => {
      // The agent opens the browser at `…/?pair=<code>`; use that to auto-pair.
      let urlPair: string | null = null
      try {
        urlPair = new URLSearchParams(location.search).get('pair')
        if (urlPair) {
          set({ pairCode: urlPair })
          // Strip it from the address bar so a refresh doesn't re-leak the code.
          history.replaceState(null, '', location.pathname)
        }
      } catch {
        /* no window/location (SSR/tests) */
      }
      try {
        const health = await agent.health()
        set({ agentPresent: true, health: { codexInstalled: health.codexInstalled, codexVersion: health.codexVersion, ghInstalled: health.ghInstalled, ghAuthed: health.ghAuthed, glabInstalled: health.glabInstalled, glabAuthed: health.glabAuthed, concurrency: health.concurrency, agents: health.agents }, queue: { ...get().queue, concurrency: health.concurrency } })
        if (agent.token) {
          try {
            await loadLive() // 401 here means the stored token is stale.
          } catch (err) {
            if (err instanceof AgentError && err.status === 401) {
              agent.setToken(null)
              set({ agentStatus: 'offline' })
            } else throw err
          }
        } else if (urlPair) {
          // Auto-pair with the code the agent handed us, then go live.
          try {
            await agent.pair(urlPair)
            await loadLive()
            toast(`Machine connected · localhost:${get().agentPort}`)
          } catch {
            set({ agentStatus: 'offline' })
          }
        } else {
          set({ agentStatus: 'offline' }) // present but unpaired
        }
      } catch {
        // No agent reachable → stay in demo mode (seed + simulation).
        set({ agentPresent: false })
      }
    },

    // ---- navigation ----
    openApp: (id) => {
      set({ view: 'board', appId: id })
      if (!get().live) {
        get().cards.forEach((c) => {
          if (c.appId === id && c.status === 'building') runBuild(c.id)
        })
      }
    },
    backToPicker: () => set({ view: 'picker', appId: null, openCardId: null }),
    openCard: (id) => {
      const c = card(id)
      set((s) => ({ openCardId: id, detailTab: c && c.status === 'review' ? 'diff' : s.detailTab }))
      if (get().live && c?.runId) refreshRun(c.runId)
    },
    closeCard: () => set({ openCardId: null }),
    consumeTitleFocus: () => set({ focusTitleCardId: null }),
    setTab: (t) => set({ detailTab: t }),
    toggleLog: (id) => set((s) => ({ logOpen: { ...s.logOpen, [id]: !s.logOpen[id] } })),

    newCard: () => {
      const appId = get().appId
      if (!appId) return
      if (get().live) {
        agent
          .createCard({ appId, title: 'Untitled card', desc: EXAMPLE_DESC, prompt: EXAMPLE_PROMPT })
          .then((c) => {
            // The card.update WS event may have already added it — upsert, don't duplicate.
            set((s) => ({
              cards: s.cards.some((x) => x.id === c.id) ? s.cards : [mapCard(c), ...s.cards],
              openCardId: c.id,
              focusTitleCardId: c.id,
            }))
          })
          .catch((err) => toast(`Could not create card: ${(err as Error).message}`))
        return
      }
      const id = 'n' + Date.now()
      const newC: Card = {
        id,
        appId,
        type: 'feature',
        priority: 'med',
        status: 'ideas',
        title: 'Untitled card',
        desc: EXAMPLE_DESC,
        prompt: EXAMPLE_PROMPT,
        order: Date.now(), // larger than seed orders → appears at the top
      }
      set((s) => ({ cards: [newC, ...s.cards], openCardId: id, focusTitleCardId: id }))
    },
    editCard: (id, patch) => {
      updateCard(id, (c) => ({ ...c, ...patch }))
      if (get().live) {
        // Accumulate fields and debounce a single PATCH per card.
        pendingPatch[id] = { ...(pendingPatch[id] || {}), ...patch }
        clearTimeout(promptPatch[id])
        promptPatch[id] = setTimeout(() => {
          const p = pendingPatch[id]
          delete pendingPatch[id]
          if (p) agent.patchCard(id, p).catch(() => {})
        }, 500)
      }
    },
    editPrompt: (id, val) => get().editCard(id, { prompt: val }),
    deleteCard: (id) => {
      const c = card(id)
      if (!c) return
      if (c.status === 'building') {
        toast('Stop the build before deleting this card')
        return
      }
      // Optimistic removal + clean up any pending debounced patch / build timer.
      clearTimeout(promptPatch[id])
      delete pendingPatch[id]
      if (buildTimers[id]) {
        clearInterval(buildTimers[id])
        delete buildTimers[id]
      }
      set((s) => ({
        cards: s.cards.filter((x) => x.id !== id),
        openCardId: s.openCardId === id ? null : s.openCardId,
      }))
      toast('Card deleted')
      if (get().live) agent.deleteCard(id).catch((err) => toast(`Delete failed: ${(err as Error).message}`))
    },

    // ---- dispatch / clone ----
    startCard: (id) => {
      const c = card(id)
      if (!c) return
      if (get().agentStatus !== 'connected') {
        set({ connectOpen: true })
        toast('Connect your machine to dispatch')
        return
      }
      const a = app(c.appId)
      if (a && !a.cloned) {
        set({ cloneModal: { appId: a.id, cardId: id, appName: a.name, repo: a.repo } })
        return
      }
      if (get().live) void dispatchLive(id)
      else dispatchDemo(id)
    },
    confirmClone: () => {
      const m = get().cloneModal
      if (!m) return
      if (get().live) {
        toast(`Cloning ${m.repo}…`)
        set({ cloneModal: null })
        agent
          .clone(m.appId)
          .then((a) => {
            set((s) => ({ apps: s.apps.map((x) => (x.id === a.id ? { ...x, cloned: a.cloned } : x)) }))
            toast(`Cloned ${m.repo}`)
            if (m.cardId) void dispatchLive(m.cardId)
          })
          .catch((err) => toast(`Clone failed: ${(err as Error).message}`))
        return
      }
      set((s) => ({
        apps: s.apps.map((a) => (a.id === m.appId ? { ...a, cloned: true } : a)),
        cloneModal: null,
      }))
      toast(`Cloned ${m.repo}`)
      if (m.cardId) setTimeout(() => dispatchDemo(m.cardId as string), 350)
    },
    cancelClone: () => set({ cloneModal: null }),

    // ---- agent (bridge) ----
    openConnect: () => set((s) => ({ connectOpen: true, pairCode: s.pairCode || makePairCode() })),
    closeConnect: () => set({ connectOpen: false }),
    reconnect: () => {
      set({ agentBusy: true })
      // Re-probe health at click time — the agent may have been started *after*
      // the page loaded (the common dev flow: open page, copy the command, run it).
      const tryReal = async (): Promise<boolean> => {
        if (get().agentPresent) return true
        try {
          const h = await agent.health()
          set({ agentPresent: true, health: { codexInstalled: h.codexInstalled, codexVersion: h.codexVersion, ghInstalled: h.ghInstalled, ghAuthed: h.ghAuthed, glabInstalled: h.glabInstalled, glabAuthed: h.glabAuthed, concurrency: h.concurrency, agents: h.agents }, queue: { ...get().queue, concurrency: h.concurrency } })
          return true
        } catch {
          return false
        }
      }
      void tryReal().then(async (present) => {
        if (present) {
          try {
            await agent.pair(get().pairCode)
            await loadLive()
            set({ agentBusy: false })
            toast(`Machine connected · localhost:${get().agentPort}`)
          } catch (err) {
            set({ agentBusy: false })
            toast(`Pairing failed: ${(err as Error).message}`)
          }
          return
        }
        // No agent reachable → simulate a successful pair (demo mode).
        clearTimeout(agentTimer)
        agentTimer = setTimeout(() => {
          set({ agentStatus: 'connected', agentBusy: false })
          toast(`Machine connected · localhost:${get().agentPort}`)
        }, 1500)
      })
    },
    disconnect: () => {
      if (get().live) {
        agent.setToken(null)
        ws?.close()
        ws = null
        set({ live: false })
      }
      set({ agentStatus: 'offline', agentBusy: false })
      toast('Local agent disconnected')
    },

    // ---- add app (register a local repo) ----
    openAddApp: () => {
      if (!get().live) {
        set({ connectOpen: true })
        toast('Connect your machine to add a repo')
        return
      }
      set({ addAppOpen: true })
    },
    closeAddApp: () => set({ addAppOpen: false }),
    addApp: async (localPath, name, repoMode) => {
      const path = localPath.trim()
      if (!path) return null
      try {
        const a = await agent.registerApp({ localPath: path, name: name.trim() || undefined, repoMode })
        set((s) => ({ apps: s.apps.some((x) => x.id === a.id) ? s.apps : [...s.apps, mapApp(a, s.apps.length)], addAppOpen: false }))
        toast(`Added ${a.name}`)
        return a.id
      } catch (err) {
        toast(`Could not add repo: ${(err as Error).message}`)
        return null
      }
    },
    cloneAndAddApp: async (repoUrl, parentDir, name) => {
      const url = repoUrl.trim()
      const dir = parentDir.trim()
      if (!url || !dir) return null
      toast(`Cloning ${url}…`)
      try {
        const a = await agent.cloneNewRepo({ repoUrl: url, parentDir: dir, name: name.trim() || undefined })
        set((s) => ({ apps: s.apps.some((x) => x.id === a.id) ? s.apps : [...s.apps, mapApp(a, s.apps.length)], addAppOpen: false }))
        toast(`Cloned & added ${a.name}`)
        return a.id
      } catch (err) {
        toast(`Clone failed: ${(err as Error).message}`)
        return null
      }
    },
    removeApp: (id) => {
      const a = get().apps.find((x) => x.id === id)
      if (!a) return
      // Optimistic: drop the app + its cards, leave its board if we're on it.
      set((s) => ({
        apps: s.apps.filter((x) => x.id !== id),
        cards: s.cards.filter((c) => c.appId !== id),
        ...(s.appId === id ? { view: 'picker' as View, appId: null, openCardId: null } : null),
      }))
      toast(`Removed ${a.name}`)
      if (get().live) agent.removeApp(id).catch((err) => toast(`Remove failed: ${(err as Error).message}`))
    },
    setAppMergeMode: (id, mode) => {
      set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, mergeStrategy: mode } : a)) }))
      if (get().live) agent.updateApp(id, { mergeStrategy: mode }).catch((err) => toast(`Couldn't update: ${(err as Error).message}`))
    },
    setAppBuildLocation: (id, where) => {
      set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, buildLocation: where } : a)) }))
      if (get().live) agent.updateApp(id, { buildLocation: where }).catch((err) => toast(`Couldn't update: ${(err as Error).message}`))
    },
    setAppAgent: (id, agentId) => {
      set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, agent: agentId } : a)) }))
      if (get().live) agent.updateApp(id, { agent: agentId }).catch((err) => toast(`Couldn't update: ${(err as Error).message}`))
    },
    setAppPlanFirst: (id, on) => {
      set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, planFirst: on } : a)) }))
      if (get().live) agent.updateApp(id, { planFirst: on }).catch((err) => toast(`Couldn't update: ${(err as Error).message}`))
    },
    setAppPreviewCommand: (id, cmd) => {
      set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, previewCommand: cmd } : a)) }))
      if (get().live) agent.updateApp(id, { previewCommand: cmd }).catch((err) => toast(`Couldn't update: ${(err as Error).message}`))
    },
    setAppRepoMode: (id, mode) => {
      // Switching also flips the default merge behavior (remote → PR, local → merge).
      set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, repoMode: mode, mergeStrategy: mode === 'remote' ? 'pr' : 'merge' } : a)) }))
      if (get().live) agent.updateApp(id, { repoMode: mode }).catch((err) => toast(`Couldn't update: ${(err as Error).message}`))
      toast(mode === 'remote' ? 'Repo set to Remote — builds open PRs' : 'Repo set to Local — builds merge locally')
    },
    setAppAutoRetry: (id, on) => {
      set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, autoRetry: on } : a)) }))
      if (get().live) agent.updateApp(id, { autoRetry: on }).catch((err) => toast(`Couldn't update: ${(err as Error).message}`))
    },
    generateAgentsMd: (id) => {
      if (!get().live) {
        toast('Connect your machine to generate AGENTS.md')
        return
      }
      const a = app(id)
      if (a && !a.cloned) {
        set({ cloneModal: { appId: id, cardId: null, appName: a.name, repo: a.repo } })
        return
      }
      const stop = (msg: string) => {
        set({ agentsMdBusy: null })
        toast(msg)
      }
      const run = (force: boolean): Promise<void> =>
        agent
          .generateAgentsMd(id, force)
          .then((r) => stop(`AGENTS.md ${r.overwritten ? 'updated' : 'created'} · ${r.bytes} bytes`))
          .catch((err) => {
            if (err instanceof AgentError && err.status === 409) {
              // Pause the spinner and ask in-app, then resume if they confirm.
              set({ agentsMdBusy: null })
              get().askConfirm({
                title: 'AGENTS.md already exists',
                message: 'This repo already has an AGENTS.md. Overwrite it with a freshly generated one?',
                confirmLabel: 'Overwrite',
                danger: true,
                onConfirm: () => {
                  set({ agentsMdBusy: id })
                  toast('Regenerating AGENTS.md…')
                  void run(true)
                },
              })
            } else {
              stop(`AGENTS.md failed: ${(err as Error).message}`)
            }
          })
      set({ agentsMdBusy: id })
      toast('Scanning repo to write AGENTS.md…')
      void run(false)
    },

    // ---- queue / model / decompose ----
    setCardModel: (id, model) => {
      updateCard(id, (c) => ({ ...c, model }))
      if (get().live) agent.patchCard(id, { model }).catch(() => {})
    },
    decomposeCard: (id, count) => {
      const c = card(id)
      if (!c) return
      if (!get().live) {
        toast('Splitting an idea needs a connected agent')
        return
      }
      const a = app(c.appId)
      if (a && !a.cloned) {
        set({ cloneModal: { appId: a.id, cardId: null, appName: a.name, repo: a.repo } })
        return
      }
      const stop = () => set((s) => ({ decomposing: s.decomposing.filter((x) => x !== id) }))
      set((s) => ({ decomposing: s.decomposing.includes(id) ? s.decomposing : [...s.decomposing, id] }))
      toast(count ? `Splitting into ${count} cards…` : 'Splitting this idea into cards…')
      // Safety net in case the completion notice never arrives.
      const guard = setTimeout(stop, 120000)
      agent.decompose(id, count).catch((err) => {
        clearTimeout(guard)
        stop()
        toast(`Decompose failed: ${(err as Error).message}`)
      })
    },
    buildAllReady: () => {
      const appId = get().appId
      if (!appId) return
      if (!get().live) {
        // Demo: just dispatch every ready card in sequence.
        get().cards.filter((c) => c.appId === appId && c.status === 'ready').forEach((c) => get().startCard(c.id))
        return
      }
      const ready = get().cards.filter((c) => c.appId === appId && c.status === 'ready' && !c.queued)
      if (!ready.length) {
        toast('No Ready cards to build')
        return
      }
      toast(`Building ${ready.length} Ready card${ready.length > 1 ? 's' : ''}…`)
      agent
        .dispatchReady(appId)
        .then((r) => toast(`${r.started} building${r.queued ? `, ${r.queued} queued` : ''}`))
        .catch((err) => toast(`Bulk build failed: ${(err as Error).message}`))
    },
    cancelQueued: (id) => {
      updateCard(id, (c) => ({ ...c, queued: false }))
      if (get().live) agent.dequeue(id).catch((err) => toast(`Couldn't cancel: ${(err as Error).message}`))
      toast('Removed from queue')
    },

    // ---- archive / search / notifications / metrics ----
    archiveCard: (id) => {
      updateCard(id, (c) => ({ ...c, archived: true }))
      set((s) => ({ openCardId: s.openCardId === id ? null : s.openCardId }))
      if (get().live) agent.archiveCard(id).catch((err) => toast(`Archive failed: ${(err as Error).message}`))
      toast('Card archived')
    },
    unarchiveCard: (id) => {
      updateCard(id, (c) => ({ ...c, archived: false }))
      if (get().live) agent.unarchiveCard(id).catch((err) => toast(`Couldn't restore: ${(err as Error).message}`))
      toast('Card restored')
    },
    clearShipped: () => {
      const appId = get().appId
      if (!appId) return
      const shipped = get().cards.filter((c) => c.appId === appId && c.status === 'merged' && !c.archived)
      if (!shipped.length) {
        toast('No shipped cards to clear')
        return
      }
      get().askConfirm({
        title: 'Clear shipped cards',
        message: `Archive all ${shipped.length} shipped card${shipped.length > 1 ? 's' : ''}? You can still find them in the archive.`,
        confirmLabel: 'Clear shipped',
        onConfirm: () => {
          set((s) => ({ cards: s.cards.map((c) => (c.appId === appId && c.status === 'merged' ? { ...c, archived: true } : c)) }))
          if (get().live) agent.archiveMerged(appId).then((r) => toast(`Archived ${r.archived} cards`)).catch((err) => toast(`Failed: ${(err as Error).message}`))
          else toast(`Archived ${shipped.length} cards`)
        },
      })
    },
    setArchiveOpen: (open) => set({ archiveOpen: open }),
    setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
    toggleNotify: () => {
      const on = get().notify
      if (on) {
        try {
          localStorage.setItem(NOTIFY_KEY, '0')
        } catch {
          /* ignore */
        }
        set({ notify: false })
        toast('Notifications off')
        return
      }
      // Turning on → request permission.
      if (typeof Notification === 'undefined') {
        toast('This browser does not support notifications')
        return
      }
      const enable = () => {
        try {
          localStorage.setItem(NOTIFY_KEY, '1')
        } catch {
          /* ignore */
        }
        set({ notify: true })
        toast('Notifications on — you’ll be pinged when builds finish')
        notifyDesktop('Dispatch notifications on', 'You’ll get a ping when a build is ready or fails.')
      }
      if (Notification.permission === 'granted') enable()
      else Notification.requestPermission().then((p) => (p === 'granted' ? enable() : toast('Notification permission denied')))
    },
    setStatsOpen: (open) => set({ statsOpen: open }),

    // ---- AI app builder ----
    openBuilder: () => {
      if (!get().live) {
        set({ connectOpen: true })
        toast('Connect your machine to build an app with AI')
        return
      }
      set({ builderOpen: true })
    },
    closeBuilder: () => set({ builderOpen: false }),
    createAppFromPlan: async (plan, choice) => {
      try {
        let a
        if (choice.mode === 'local') a = await agent.initLocalRepo({ parentDir: choice.parentDir, slug: choice.slug, name: choice.name })
        else if (choice.mode === 'new-remote') a = await agent.createRemoteRepo({ parentDir: choice.parentDir, slug: choice.slug, name: choice.name, private: choice.private })
        else a = await agent.cloneNewRepo({ repoUrl: choice.repoUrl ?? '', parentDir: choice.parentDir, name: choice.name })
        // Add the new repo to the board.
        set((s) => ({ apps: s.apps.some((x) => x.id === a.id) ? s.apps : [...s.apps, mapApp(a, s.apps.length)] }))
        // Create the first-iteration cards (the desc carries the title; prompt is the user story).
        for (const c of plan.cards) {
          await agent.createCard({ appId: a.id, title: c.title, prompt: c.prompt, desc: c.title, type: c.type, scaffold: c.scaffold }).catch(() => {})
        }
        set({ builderOpen: false })
        get().openApp(a.id)
        toast(`Created ${a.name} with ${plan.cards.length} cards`)
        return true
      } catch (err) {
        toast(`Create failed: ${(err as Error).message}`)
        return false
      }
    },

    // ---- repo Q&A chat ----
    openRepoChat: () => {
      const appId = get().appId
      set({ repoChatOpen: true })
      if (get().live && appId) {
        agent
          .getChat(appId)
          .then((r) => set((s) => ({ repoChats: { ...s.repoChats, [appId]: { messages: r.messages.map((m) => ({ role: m.role, text: m.text })), thinking: r.thinking } } })))
          .catch(() => {})
      }
    },
    closeRepoChat: () => set({ repoChatOpen: false }),
    setRepoChatDraft: (v) => set({ repoChatDraft: v }),
    askRepo: () => {
      const appId = get().appId
      const text = get().repoChatDraft.trim()
      if (!appId || !text) return
      if (!get().live) {
        toast('Connect your machine to ask about the repo')
        return
      }
      const a = app(appId)
      if (a && !a.cloned) {
        set({ cloneModal: { appId, cardId: null, appName: a.name, repo: a.repo } })
        return
      }
      // The user message + answer arrive over WS (chat.message), so no optimistic add.
      set({ repoChatDraft: '' })
      agent.ask(appId, text).catch((err) => toast(`Ask failed: ${(err as Error).message}`))
    },
    clearRepoChat: () => {
      const appId = get().appId
      if (!appId) return
      set((s) => ({ repoChats: { ...s.repoChats, [appId]: { messages: [], thinking: false } } }))
      if (get().live) agent.clearChat(appId).catch(() => {})
    },
    createCardFromText: (title, prompt, decompose) => {
      const appId = get().appId
      if (!appId) return
      const t = title.trim().slice(0, 80) || 'From chat'
      if (get().live) {
        agent
          .createCard({ appId, title: t, desc: 'Created from a repo chat answer.', prompt })
          .then((c) => {
            set((s) => ({
              cards: s.cards.some((x) => x.id === c.id) ? s.cards : [mapCard(c), ...s.cards],
              repoChatOpen: false,
              openCardId: decompose ? s.openCardId : c.id,
              focusTitleCardId: decompose ? s.focusTitleCardId : c.id,
            }))
            if (decompose) get().decomposeCard(c.id)
            else toast('Card created from answer')
          })
          .catch((err) => toast(`Couldn't create card: ${(err as Error).message}`))
        return
      }
      const id = 'n' + Date.now()
      const newC: Card = { id, appId, type: 'feature', priority: 'med', status: 'ideas', title: t, desc: 'Created from a repo chat answer.', prompt, order: Date.now() }
      set((s) => ({ cards: [newC, ...s.cards], repoChatOpen: false, openCardId: id, focusTitleCardId: id }))
      toast('Card created from answer')
    },

    // ---- race / plan / preview ----
    raceCard: (cardId) => {
      const c = card(cardId)
      if (!c) return
      if (!get().live) {
        toast('Racing needs a connected agent with Codex + Claude installed')
        return
      }
      const a = app(c.appId)
      if (a && !a.cloned) {
        set({ cloneModal: { appId: a.id, cardId, appName: a.name, repo: a.repo } })
        return
      }
      updateCard(cardId, (cc) => ({ ...cc, status: 'building', build: { progress: 0, currentStep: 'Queued', logs: [] } }))
      toast('Racing Codex vs Claude Code…')
      agent
        .race({ appId: c.appId, cardId: c.id, prompt: c.prompt ?? '', type: c.type, baseBranch: c.base || a?.base, title: c.title })
        .then((r) => updateCard(cardId, (cc) => ({ ...cc, raceRunIds: r.runIds })))
        .catch((err) => toast(`Race failed: ${(err as Error).message}`))
    },
    approvePlan: (cardId) => {
      const c = card(cardId)
      if (!get().live || !c?.runId) return
      updateCard(cardId, (cc) => ({ ...cc, phase: 'build' }))
      toast('Plan approved — building…')
      agent.approvePlan(c.runId).catch((err) => toast(`Failed: ${(err as Error).message}`))
    },
    requestPlanChanges: (cardId) => {
      const c = card(cardId)
      if (!get().live || !c?.runId) return
      const note = (get().chatDrafts[cardId] || '').trim()
      set((s) => ({ chatDrafts: { ...s.chatDrafts, [cardId]: '' } }))
      updateCard(cardId, (cc) => ({ ...cc, phase: undefined, plan: undefined }))
      toast('Re-planning…')
      agent.requestPlanChanges(c.runId, note || undefined).catch((err) => toast(`Failed: ${(err as Error).message}`))
    },
    pickWinner: (cardId, runId) => {
      const c = card(cardId)
      if (!get().live || !c) return
      toast('Picking winner…')
      agent
        .pickWinner(cardId, runId)
        .then(() => toast('Winner merged'))
        .catch((err) => toast(`Failed: ${(err as Error).message}`))
    },
    startPreview: (cardId, command) => {
      const c = card(cardId)
      if (!get().live || !c?.runId) {
        toast('Preview needs a connected agent')
        return
      }
      set({ preview: { running: true, url: null, cardId } })
      toast('Starting dev server…')
      agent
        .preview(c.runId, command)
        .then((r) => {
          set({ preview: { running: true, url: r.url, cardId, command: r.command } })
          if (r.url) {
            toast(`Preview at ${r.url}`)
            try {
              window.open(r.url, '_blank', 'noreferrer')
            } catch {
              /* popup blocked */
            }
          } else {
            toast(`Dev server started (${r.command}) — no URL detected`)
          }
        })
        .catch((err) => {
          set({ preview: { running: false, url: null, cardId: null } })
          toast(`Preview failed: ${(err as Error).message}`)
        })
    },
    endPreview: (cardId) => {
      const c = card(cardId)
      set({ preview: { running: false, url: null, cardId: null } })
      if (get().live && c?.runId) agent.stopPreview(c.runId).catch(() => {})
      toast('Preview stopped')
    },
    openWorktree: (cardId) => {
      const c = card(cardId)
      if (!get().live || !c?.runId) {
        toast('Available once a real agent is building this card')
        return
      }
      agent
        .openRun(c.runId)
        .then((r) => toast(r.opened ? `Opened in ${r.opened}` : `Folder: ${r.path}`))
        .catch((err) => toast(`Couldn't open: ${(err as Error).message}`))
    },
    checkoutBranch: (cardId) => {
      const c = card(cardId)
      if (!get().live || !c?.runId) {
        toast('Available once a real agent has built this card')
        return
      }
      agent
        .checkoutRun(c.runId)
        .then((r) => toast(`Checked out ${r.branch} in your repo`))
        .catch((err) => toast(`Checkout failed: ${(err as Error).message}`))
    },

    // ---- review actions ----
    moveCard: (id, key) => {
      if (!id) return
      const c = card(id)
      if (!c || c.status === key) {
        set({ draggingId: null })
        return
      }
      if (key === 'building') {
        get().startCard(id)
        set({ draggingId: null })
        return
      }
      updateCard(id, (cc) => ({ ...cc, status: key }))
      set({ draggingId: null })
      if (get().live) agent.patchCard(id, { status: key }).catch(() => {})
    },
    dropOnCard: (draggedId, targetId, position) => {
      if (!draggedId || draggedId === targetId) {
        set({ draggingId: null })
        return
      }
      const dragged = card(draggedId)
      const target = card(targetId)
      if (!dragged || !target) {
        set({ draggingId: null })
        return
      }
      // Different column → treat as a move to that column (keeps the existing flow).
      if (dragged.status !== target.status) {
        get().moveCard(draggedId, target.status)
        return
      }
      // Same column, but only the backlog columns are manually orderable.
      if (dragged.status !== 'ideas' && dragged.status !== 'ready') {
        set({ draggingId: null })
        return
      }
      // Columns sort by order descending (top = highest). Place the dragged card
      // just above or just below the target, depending on which half it was dropped on.
      const col = get()
        .cards.filter((c) => c.appId === dragged.appId && c.status === dragged.status && c.id !== draggedId)
        .sort((a, b) => (b.order ?? 0) - (a.order ?? 0))
      const i = col.findIndex((c) => c.id === targetId)
      if (i === -1) {
        set({ draggingId: null })
        return
      }
      const targetOrder = col[i].order ?? 0
      let newOrder: number
      if (position === 'below') {
        const belowCard = col[i + 1] // the next card down (lower order), if any
        newOrder = belowCard ? ((belowCard.order ?? 0) + targetOrder) / 2 : targetOrder - 1
      } else {
        const aboveCard = col[i - 1] // the card above (higher order), if any
        newOrder = aboveCard ? ((aboveCard.order ?? 0) + targetOrder) / 2 : targetOrder + 1
      }
      updateCard(draggedId, (c) => ({ ...c, order: newOrder }))
      set({ draggingId: null })
      if (get().live) agent.patchCard(draggedId, { order: newOrder }).catch(() => {})
    },
    dropOnColumn: (draggedId, status) => {
      const dragged = card(draggedId)
      if (!dragged) {
        set({ draggingId: null })
        return
      }
      // Different column → move there (status change / dispatch into Building).
      if (dragged.status !== status) {
        get().moveCard(draggedId, status)
        return
      }
      // Same column → drop to the bottom (only the backlog columns are orderable).
      if (status !== 'ideas' && status !== 'ready') {
        set({ draggingId: null })
        return
      }
      const col = get()
        .cards.filter((c) => c.appId === dragged.appId && c.status === status && c.id !== draggedId)
        .sort((a, b) => (b.order ?? 0) - (a.order ?? 0))
      const last = col[col.length - 1]
      const newOrder = last ? (last.order ?? 0) - 1 : dragged.order ?? 0
      updateCard(draggedId as string, (c) => ({ ...c, order: newOrder }))
      set({ draggingId: null })
      if (get().live) agent.patchCard(draggedId as string, { order: newOrder }).catch(() => {})
    },
    setDragging: (id) => set({ draggingId: id }),
    pullRepo: (id) => {
      if (!get().live) {
        toast('Connect your machine to pull')
        return
      }
      toast('Pulling…')
      agent
        .pull(id)
        .then((r) => {
          set((s) => ({ apps: s.apps.map((a, i) => (a.id === id ? mapApp(r.status, i) : a)) }))
          toast(r.summary)
        })
        .catch((err) => toast(`Pull failed: ${(err as Error).message}`))
    },
    setChatDraft: (id, val) => set((s) => ({ chatDrafts: { ...s.chatDrafts, [id]: val } })),
    sendChat: (id) => {
      const text = (get().chatDrafts[id] || '').trim()
      if (!text) return
      const c = card(id)
      updateCard(id, (cc) => ({ ...cc, chat: [...(cc.chat || []), { role: 'user', text }] }))
      set((s) => ({ chatDrafts: { ...s.chatDrafts, [id]: '' } }))
      if (get().live && c?.runId) {
        agent.sendMessage(c.runId, text).catch((err) => toast(`Message failed: ${(err as Error).message}`))
        return
      }
      clearTimeout(chatTimer)
      chatTimer = setTimeout(() => {
        updateCard(id, (cc) => ({
          ...cc,
          chat: [
            ...(cc.chat || []),
            {
              role: 'agent',
              text: 'On it — I’ll fold that into the branch and re-run the affected tests. Give me a moment and the diff above will update.',
            },
          ],
        }))
      }, 1100)
    },
    requestChanges: (id) => {
      const note = (get().chatDrafts[id] || '').trim()
      const c = card(id)
      if (!c) return
      if (get().live && c.runId) {
        if (note) updateCard(id, (cc) => ({ ...cc, chat: [...(cc.chat || []), { role: 'user', text: note }] }))
        set((s) => ({ chatDrafts: { ...s.chatDrafts, [id]: '' } }))
        agent.requestChanges(c.runId, note || undefined).catch((err) => toast(`Failed: ${(err as Error).message}`))
        toast('Re-running with feedback')
        return
      }
      updateCard(id, (cc) => ({
        ...cc,
        status: 'building',
        chat: [
          ...(cc.chat || []),
          ...(note ? [{ role: 'user' as const, text: note }] : []),
          { role: 'agent' as const, text: 'Got it — re-running with your feedback.' },
        ],
        build: {
          progress: 0,
          currentStep: 'Queued',
          logs: [`$ codex revise --branch ${cc.branch}`, '→ Applying review feedback…'],
        },
      }))
      set((s) => ({ chatDrafts: { ...s.chatDrafts, [id]: '' } }))
      toast('Re-running with feedback')
      setTimeout(() => runBuild(id), 400)
    },
    approveMerge: (id) => {
      const c = card(id)
      if (get().live && c?.runId) {
        toast('Merging…')
        agent
          .approve(c.runId)
          .then(() => toast(`Merged ${c.branch || ''} → main`))
          .catch((err) => toast(`Merge failed: ${(err as Error).message}`))
        return
      }
      updateCard(id, (cc) => ({ ...cc, status: 'merged', mergedAt: 'Merged just now' }))
      toast(`Merged ${c?.branch || ''} → main`)
    },
    stopBuild: (id) => {
      const c = card(id)
      if (get().live && c?.runId) {
        agent.stop(c.runId).catch((err) => toast(`Stop failed: ${(err as Error).message}`))
        toast('Build stopped')
        return
      }
      updateCard(id, (cc) => ({ ...cc, status: 'ready' }))
      if (buildTimers[id]) {
        clearInterval(buildTimers[id])
        delete buildTimers[id]
      }
      toast('Build stopped')
    },
  }
})
