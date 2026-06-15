import { useState } from 'react'
import { COLS } from '../lib/constants'
import { useStore } from '../store/useStore'
import type { CardStatus } from '../store/types'
import { Button } from './Button'
import { Card } from './Card'
import { ClonePill } from './ClonePill'

export function Board() {
  const appId = useStore((s) => s.appId)
  const apps = useStore((s) => s.apps)
  const cards = useStore((s) => s.cards)
  const backToPicker = useStore((s) => s.backToPicker)
  const newCard = useStore((s) => s.newCard)
  const pullRepo = useStore((s) => s.pullRepo)
  const live = useStore((s) => s.live)
  const [backHover, setBackHover] = useState(false)

  const filter = useStore((s) => s.filter)
  const app = apps.find((a) => a.id === appId)
  if (!app) return null
  // Archived cards never show on the board; the rest are subject to the filter bar.
  const appCards = cards.filter((c) => c.appId === appId && !c.archived && matchesFilter(c, filter, app))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div
        style={{
          background: '#fff',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '12px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flex: '0 0 auto',
        }}
      >
        <button
          onClick={backToPicker}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          style={{
            width: 34,
            height: 34,
            border: '1px solid var(--border-default)',
            background: backHover ? 'var(--neutral-50)' : '#fff',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            color: 'var(--text-strong)',
            fontSize: 17,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ←
        </button>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, color: 'var(--text-strong)', lineHeight: 1.15 }}>
            {app.name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{app.repo}</div>
        </div>
        <ClonePill cloned={app.cloned} />
        {live && app.hasRemote && (
          <Button variant="secondary" onClick={() => pullRepo(app.id)} style={{ height: 30, fontSize: 12.5 }}>
            ↓ Pull
          </Button>
        )}
        <div style={{ flex: 1 }} />
        {live && <DecomposeChip appId={app.id} />}
        {live && <AgentsMdChip appId={app.id} />}
        {live && <QueueStatus appId={app.id} />}
        <SettingsMenu appId={app.id} />
        <Button variant="secondary" onClick={newCard} style={{ height: 36, color: 'var(--brand-primary)' }}>
          + New card
        </Button>
      </div>

      <FilterBar appId={app.id} />

      <div className="dp-scroll" style={{ overflowX: 'auto', padding: 22, display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: 'safe center' }}>
        {COLS.map((col) => {
          const list = appCards.filter((c) => c.status === col.key).sort((a, b) => (b.order ?? 0) - (a.order ?? 0))
          return <Column key={col.key} colKey={col.key} title={col.title} accent={col.accent} live={!!col.live && list.length > 0} empty={col.empty} cards={list} />
        })}
      </div>
    </div>
  )
}

const selectStyle = (warnColor: boolean) =>
  ({
    height: 30,
    padding: '0 8px',
    border: `1px solid ${warnColor ? 'var(--status-warning)' : 'var(--border-default)'}`,
    borderRadius: 'var(--radius-sm)',
    background: '#fff',
    fontFamily: 'var(--font-heading)',
    fontWeight: 700,
    fontSize: 13,
    color: 'var(--text-body)',
    cursor: 'pointer',
  }) as const

const labelStyle = {
  fontSize: 11.5,
  color: 'var(--text-subtle)',
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  letterSpacing: '.04em',
  textTransform: 'uppercase',
} as const

const AGENT_LABELS: Record<string, string> = { codex: 'Codex', claude: 'Claude Code' }

/** Small inline spinning ring. */
function Spinner({ size = 13 }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: '50%',
        border: '2px solid var(--neutral-200)',
        borderTopColor: 'var(--brand-primary)',
        animation: 'dpspin .7s linear infinite',
      }}
    />
  )
}

function AgentToggle({ appId }: { appId: string }) {
  const app = useStore((s) => s.apps.find((a) => a.id === appId))
  const health = useStore((s) => s.health)
  const setAppAgent = useStore((s) => s.setAppAgent)
  if (!app) return null
  const selected = app.agent ?? 'codex'
  const known = health?.agents ?? [
    { id: 'codex' as const, label: 'Codex', installed: true, version: null },
    { id: 'claude' as const, label: 'Claude Code', installed: true, version: null },
  ]
  const installedSel = known.find((a) => a.id === selected)?.installed ?? true
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={labelStyle}>Agent</span>
      <select
        value={selected}
        onChange={(e) => setAppAgent(appId, e.target.value as 'codex' | 'claude')}
        title="Which AI coding CLI builds cards in this repo"
        style={selectStyle(!installedSel)}
      >
        {known.map((a) => (
          <option key={a.id} value={a.id} disabled={!a.installed}>
            {AGENT_LABELS[a.id] ?? a.label}
            {a.installed ? '' : ' (not installed)'}
          </option>
        ))}
      </select>
      {!installedSel && (
        <span title={`Install the ${AGENT_LABELS[selected]} CLI to use it.`} style={{ fontSize: 11.5, color: 'var(--status-warning)', whiteSpace: 'nowrap' }}>
          ⚠ not installed
        </span>
      )}
    </div>
  )
}

function PreviewCommandField({ appId }: { appId: string }) {
  const app = useStore((s) => s.apps.find((a) => a.id === appId))
  const setAppPreviewCommand = useStore((s) => s.setAppPreviewCommand)
  const [draft, setDraft] = useState(app?.previewCommand ?? '')
  if (!app) return null
  const saved = app.previewCommand ?? ''
  const commit = () => {
    const v = draft.trim()
    if (v !== saved) setAppPreviewCommand(appId, v)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={labelStyle}>Preview</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        placeholder="auto-detect"
        title="Command that starts a dev server for the Preview button (e.g. npm run dev, python manage.py runserver). Leave blank to auto-detect from package.json."
        spellCheck={false}
        style={{
          height: 30,
          width: 160,
          padding: '0 9px',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          background: '#fff',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-body)',
          outline: 'none',
        }}
      />
    </div>
  )
}

function PlanFirstToggle({ appId }: { appId: string }) {
  const app = useStore((s) => s.apps.find((a) => a.id === appId))
  const setAppPlanFirst = useStore((s) => s.setAppPlanFirst)
  if (!app) return null
  const on = !!app.planFirst
  return (
    <button
      onClick={() => setAppPlanFirst(appId, !on)}
      title="Have the agent propose a plan to approve before it edits any code"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        height: 30,
        padding: '0 11px',
        whiteSpace: 'nowrap',
        border: `1px solid ${on ? 'var(--brand-primary)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-sm)',
        background: on ? 'var(--brand-primary)' : '#fff',
        color: on ? '#fff' : 'var(--text-body)',
        cursor: 'pointer',
        fontFamily: 'var(--font-heading)',
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      <span style={{ fontSize: 13 }}>📋</span>
      Plan first{on ? ': on' : ''}
    </button>
  )
}

function BuildLocationToggle({ appId }: { appId: string }) {
  const app = useStore((s) => s.apps.find((a) => a.id === appId))
  const setAppBuildLocation = useStore((s) => s.setAppBuildLocation)
  if (!app) return null
  const where = app.buildLocation ?? 'worktree'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={labelStyle}>Build in</span>
      <select
        value={where}
        onChange={(e) => setAppBuildLocation(appId, e.target.value as 'worktree' | 'workdir')}
        title="Where Codex runs: an isolated copy, or your actual working folder"
        style={selectStyle(false)}
      >
        <option value="worktree">Isolated copy</option>
        <option value="workdir">My working copy</option>
      </select>
    </div>
  )
}

function MergeModeToggle({ appId }: { appId: string }) {
  const app = useStore((s) => s.apps.find((a) => a.id === appId))
  const health = useStore((s) => s.health)
  const setAppMergeMode = useStore((s) => s.setAppMergeMode)
  if (!app) return null
  const mode = app.mergeStrategy ?? 'merge'
  // Warn if PR mode can't actually open a PR yet — forge-aware (gh vs glab).
  const isGitlab = app.forge === 'gitlab'
  const cliAuthed = health ? (isGitlab ? health.glabAuthed : health.ghAuthed) : true
  const warn = mode === 'pr' && !app.hasRemote ? 'no remote' : mode === 'pr' && !cliAuthed ? `${isGitlab ? 'glab' : 'gh'} not authed` : null
  const prBlocked = mode === 'pr' && (!app.hasRemote || !cliAuthed)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontSize: 11.5, color: 'var(--text-subtle)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
        On approve
      </span>
      <select
        value={mode}
        onChange={(e) => setAppMergeMode(appId, e.target.value as 'pr' | 'merge')}
        title="What 'Approve & merge' does for this repo"
        style={{
          height: 30,
          padding: '0 8px',
          border: `1px solid ${prBlocked ? 'var(--status-warning)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-sm)',
          background: '#fff',
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: 13,
          color: 'var(--text-body)',
          cursor: 'pointer',
        }}
      >
        <option value="pr">Open a PR</option>
        <option value="merge">Merge locally</option>
      </select>
      {warn && (
        <span
          title={warn === 'no remote' ? 'This repo has no git remote — add one to open PRs.' : `Run '${isGitlab ? 'glab' : 'gh'} auth login' to open ${isGitlab ? 'MRs' : 'PRs'}.`}
          style={{ fontSize: 11.5, color: 'var(--status-warning)', whiteSpace: 'nowrap' }}
        >
          ⚠ {warn}
        </span>
      )}
    </div>
  )
}

function AutoRetryToggle({ appId }: { appId: string }) {
  const app = useStore((s) => s.apps.find((a) => a.id === appId))
  const setAppAutoRetry = useStore((s) => s.setAppAutoRetry)
  if (!app) return null
  const on = !!app.autoRetry
  return (
    <button
      onClick={() => setAppAutoRetry(appId, !on)}
      title="If a build fails, automatically retry once — with the other agent if installed, else a refined prompt"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        height: 30,
        padding: '0 11px',
        whiteSpace: 'nowrap',
        border: `1px solid ${on ? 'var(--brand-primary)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-sm)',
        background: on ? 'var(--brand-primary)' : '#fff',
        color: on ? '#fff' : 'var(--text-body)',
        cursor: 'pointer',
        fontFamily: 'var(--font-heading)',
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      <span style={{ fontSize: 13 }}>↻</span>
      Auto-retry{on ? ': on' : ''}
    </button>
  )
}

/** Header chip shown while ideas in this repo are being split into sub-cards. */
function DecomposeChip({ appId }: { appId: string }) {
  const count = useStore((s) => s.decomposing.filter((id) => s.cards.some((c) => c.id === id && c.appId === appId)).length)
  if (!count) return null
  return (
    <span
      title="Splitting an idea into scoped sub-cards"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 30,
        padding: '0 11px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--neutral-50)',
        fontFamily: 'var(--font-heading)',
        fontWeight: 700,
        fontSize: 12,
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      <Spinner size={12} />
      Splitting {count > 1 ? `${count} ideas` : 'idea'}…
    </span>
  )
}

/** Persistent header chip shown while this repo's AGENTS.md is generating. */
function AgentsMdChip({ appId }: { appId: string }) {
  const busy = useStore((s) => s.agentsMdBusy === appId)
  if (!busy) return null
  return (
    <span
      title="Scanning the repo to generate AGENTS.md"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 30,
        padding: '0 11px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--neutral-50)',
        fontFamily: 'var(--font-heading)',
        fontWeight: 700,
        fontSize: 12,
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      <Spinner size={12} />
      Generating AGENTS.md…
    </span>
  )
}

/** Does a card match the active board filter (text / type / agent)? */
function matchesFilter(c: import('../store/types').Card, f: import('../store/useStore').BoardFilter, app?: import('../store/types').App): boolean {
  if (f.type !== 'all' && c.type !== f.type) return false
  if (f.agent !== 'all' && (c.agentId ?? app?.agent ?? 'codex') !== f.agent) return false
  const t = f.text.trim().toLowerCase()
  if (t) {
    const hay = `${c.title} ${c.desc} ${c.prompt ?? ''} ${c.branch ?? ''}`.toLowerCase()
    if (!hay.includes(t)) return false
  }
  return true
}

const filterControl = {
  height: 30,
  padding: '0 9px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  background: '#fff',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  color: 'var(--text-body)',
  outline: 'none',
} as const

function iconBtn(active: boolean) {
  return {
    height: 30,
    minWidth: 32,
    padding: '0 9px',
    border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
    borderRadius: 'var(--radius-sm)',
    background: active ? 'var(--brand-primary)' : '#fff',
    color: active ? '#fff' : 'var(--text-body)',
    cursor: 'pointer',
    fontFamily: 'var(--font-heading)',
    fontWeight: 700,
    fontSize: 13,
  } as const
}

/** Board-wide search + type/agent filters, plus notify / stats / archive controls. */
function FilterBar({ appId }: { appId: string }) {
  const filter = useStore((s) => s.filter)
  const setFilter = useStore((s) => s.setFilter)
  const notify = useStore((s) => s.notify)
  const toggleNotify = useStore((s) => s.toggleNotify)
  const setStatsOpen = useStore((s) => s.setStatsOpen)
  const setArchiveOpen = useStore((s) => s.setArchiveOpen)
  const openRepoChat = useStore((s) => s.openRepoChat)
  const archivedCount = useStore((s) => s.cards.filter((c) => c.appId === appId && c.archived).length)
  const active = filter.text.trim() !== '' || filter.type !== 'all' || filter.agent !== 'all'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 22px', borderBottom: '1px solid var(--border-subtle)', background: '#fff', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: 9, fontSize: 12, color: 'var(--text-subtle)', pointerEvents: 'none' }}>🔍</span>
        <input
          value={filter.text}
          onChange={(e) => setFilter({ text: e.target.value })}
          placeholder="Search cards…"
          style={{ ...filterControl, width: 200, paddingLeft: 28 }}
        />
      </div>
      <select value={filter.type} onChange={(e) => setFilter({ type: e.target.value as BoardFilterType })} style={{ ...filterControl, cursor: 'pointer' }}>
        <option value="all">All types</option>
        <option value="feature">Feature</option>
        <option value="bug">Bug</option>
        <option value="enhancement">Enhancement</option>
      </select>
      <select value={filter.agent} onChange={(e) => setFilter({ agent: e.target.value as BoardFilterAgent })} style={{ ...filterControl, cursor: 'pointer' }}>
        <option value="all">Any agent</option>
        <option value="codex">Codex</option>
        <option value="claude">Claude Code</option>
      </select>
      {active && (
        <button onClick={() => setFilter({ text: '', type: 'all', agent: 'all' })} style={{ ...iconBtn(false), color: 'var(--brand-primary)' }}>
          Clear
        </button>
      )}
      <div style={{ flex: 1 }} />
      <button onClick={openRepoChat} title="Ask questions about this repo" style={{ ...iconBtn(false), color: 'var(--brand-primary)' }}>
        💬 Ask
      </button>
      <button onClick={toggleNotify} title={notify ? 'Desktop notifications on' : 'Get notified when builds finish'} style={iconBtn(notify)}>
        {notify ? '🔔' : '🔕'}
      </button>
      <button onClick={() => setStatsOpen(true)} title="Build stats" style={iconBtn(false)}>
        📊 Stats
      </button>
      <button onClick={() => setArchiveOpen(true)} title="Archived cards" style={iconBtn(false)}>
        🗄 Archive{archivedCount ? ` (${archivedCount})` : ''}
      </button>
    </div>
  )
}

type BoardFilterType = 'all' | 'feature' | 'bug' | 'enhancement'
type BoardFilterAgent = 'all' | 'codex' | 'claude'

/** Live build-queue chip + bulk "Build all Ready" action. */
function QueueStatus({ appId }: { appId: string }) {
  const queue = useStore((s) => s.queue)
  const readyCount = useStore((s) => s.cards.filter((c) => c.appId === appId && c.status === 'ready' && !c.queued).length)
  const buildAllReady = useStore((s) => s.buildAllReady)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        title={`Up to ${queue.concurrency} builds run at once. ${queue.active} running, ${queue.queued} queued.`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 30,
          padding: '0 10px',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--neutral-50)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: queue.active > 0 ? 'var(--status-success)' : 'var(--neutral-300)' }} />
        {queue.active}/{queue.concurrency} running{queue.queued > 0 ? ` · ${queue.queued} queued` : ''}
      </span>
      {readyCount > 0 && (
        <Button variant="secondary" onClick={buildAllReady} style={{ height: 30, fontSize: 12.5, color: 'var(--brand-primary)' }}>
          ⚡ Build all ({readyCount})
        </Button>
      )}
    </div>
  )
}

/** A popover housing the per-repo build settings (keeps the header uncluttered). */
function SettingsMenu({ appId }: { appId: string }) {
  const app = useStore((s) => s.apps.find((a) => a.id === appId))
  const live = useStore((s) => s.live)
  const generateAgentsMd = useStore((s) => s.generateAgentsMd)
  const agentsMdBusy = useStore((s) => s.agentsMdBusy === appId)
  const [open, setOpen] = useState(false)
  if (!app) return null
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Repo build settings"
        style={{
          height: 36,
          padding: '0 12px',
          border: `1px solid ${open ? 'var(--brand-primary)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-sm)',
          background: '#fff',
          cursor: 'pointer',
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: 13,
          color: 'var(--text-body)',
        }}
      >
        ⚙ Settings
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute',
              top: 42,
              right: 0,
              zIndex: 41,
              width: 340,
              background: '#fff',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(0,0,0,.16))',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 14,
            }}
          >
            {app.agent && <AgentToggle appId={appId} />}
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <PlanFirstToggle appId={appId} />
              <AutoRetryToggle appId={appId} />
            </div>
            {app.buildLocation && <BuildLocationToggle appId={appId} />}
            {app.mergeStrategy && <MergeModeToggle appId={appId} />}
            {live && <PreviewCommandField appId={appId} key={appId} />}
            {live && (
              <div style={{ width: '100%', borderTop: '1px solid var(--border-subtle)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Repo setup</span>
                <button
                  onClick={() => !agentsMdBusy && generateAgentsMd(appId)}
                  disabled={agentsMdBusy}
                  title="Scan the repo and write an AGENTS.md the coding agent will use as context"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    height: 32,
                    padding: '0 11px',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    background: '#fff',
                    cursor: agentsMdBusy ? 'default' : 'pointer',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    fontSize: 13,
                    color: 'var(--brand-primary)',
                    textAlign: 'left',
                  }}
                >
                  {agentsMdBusy ? (
                    <>
                      <Spinner />
                      Generating AGENTS.md…
                    </>
                  ) : (
                    <>📝 Generate AGENTS.md</>
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface ColumnProps {
  colKey: CardStatus
  title: string
  accent: string
  live: boolean
  empty: string
  cards: import('../store/types').Card[]
}

function NewCardTile() {
  const newCard = useStore((s) => s.newCard)
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={newCard}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '16px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontFamily: 'var(--font-heading)',
        fontWeight: 700,
        fontSize: 13,
        cursor: 'pointer',
        border: `1px dashed ${hover ? 'var(--brand-primary)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-sm)',
        background: hover ? '#fff' : 'rgba(255,255,255,.4)',
        color: 'var(--brand-primary)',
        transition: 'background var(--duration-fast), border-color var(--duration-fast)',
      }}
    >
      + New card
    </button>
  )
}

/** Compact one-line row for a shipped (merged) card. */
function ShippedRow({ card }: { card: import('../store/types').Card }) {
  const openCard = useStore((s) => s.openCard)
  const archiveCard = useStore((s) => s.archiveCard)
  const [hover, setHover] = useState(false)
  const isPr = !!card.prUrl
  return (
    <div
      onClick={() => openCard(card.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: '#fff',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        boxShadow: hover ? 'var(--shadow-xs)' : 'none',
      }}
    >
      <span title={isPr ? 'Pull request opened' : 'Merged locally'} style={{ color: 'var(--status-success)', fontSize: 13, flex: '0 0 auto' }}>{isPr ? '⎋' : '✓'}</span>
      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.title}</span>
      <div style={{ flex: 1 }} />
      {card.branch && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>⎇ {card.branch}</span>}
      <button
        onClick={(e) => {
          e.stopPropagation()
          archiveCard(card.id)
        }}
        title="Archive"
        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 13, padding: 0, opacity: hover ? 1 : 0, transition: 'opacity var(--duration-fast)', flex: '0 0 auto' }}
      >
        🗄
      </button>
    </div>
  )
}

function Column({ colKey, title, accent, live, empty, cards }: ColumnProps) {
  const dropOnColumn = useStore((s) => s.dropOnColumn)
  const clearShipped = useStore((s) => s.clearShipped)
  const [mergedLimit, setMergedLimit] = useState(6)
  const isMerged = colKey === 'merged'

  return (
    <section
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        dropOnColumn(e.dataTransfer.getData('text/dispatch-card'), colKey)
      }}
      style={{
        width: 304,
        flex: '0 0 304px',
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 154px)',
      }}
    >
      <header
        style={{
          padding: '13px 15px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          borderTop: `3px solid ${accent}`,
          borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '.07em',
            textTransform: 'uppercase',
            color: 'var(--text-strong)',
          }}
        >
          {title}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--neutral-200)',
            color: 'var(--text-muted)',
            fontSize: 11.5,
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
          }}
        >
          {cards.length}
        </span>
        <div style={{ flex: 1 }} />
        {live && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--color-highlighter)',
              boxShadow: '0 0 0 3px rgba(255,246,1,.28)',
              animation: 'dppulse 1.3s var(--ease-standard) infinite',
            }}
          />
        )}
      </header>
      <div style={{ padding: '0 11px 12px', display: 'flex', flexDirection: 'column', gap: 11, overflowY: 'auto' }}>
        {/* Ideas always shows a "+ New card" tile at the top (in place of the empty hint). */}
        {colKey === 'ideas' && <NewCardTile />}
        {/* Merged ("Shipped") renders compact rows, capped, with a Clear action. */}
        {isMerged
          ? cards.slice(0, mergedLimit).map((c) => <ShippedRow key={c.id} card={c} />)
          : cards.map((c) => <Card key={c.id} card={c} />)}
        {isMerged && cards.length > mergedLimit && (
          <button
            onClick={() => setMergedLimit((l) => l + 12)}
            style={{ height: 30, border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,.5)', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12.5, color: 'var(--text-muted)' }}
          >
            Show {cards.length - mergedLimit} more
          </button>
        )}
        {isMerged && cards.length > 0 && (
          <button
            onClick={clearShipped}
            title="Archive all shipped cards"
            style={{ height: 30, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: '#fff', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}
          >
            🗄 Clear shipped
          </button>
        )}
        {cards.length === 0 && colKey !== 'ideas' && (
          <div
            style={{
              padding: '18px 12px',
              textAlign: 'center',
              fontSize: 12.5,
              color: 'var(--text-subtle)',
              border: '1px dashed var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,.4)',
            }}
          >
            {empty}
          </div>
        )}
      </div>
    </section>
  )
}
