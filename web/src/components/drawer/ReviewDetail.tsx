import { useEffect, useState } from 'react'
import { agent, type AgentRun } from '../../lib/agentClient'
import { agentLabel } from '../../lib/constants'
import { diffStats } from '../../lib/helpers'
import { useStore } from '../../store/useStore'
import type { Card, DiffFile, DetailTab, CodingAgentId } from '../../store/types'
import { Button } from '../Button'

function DiffView({ diff }: { diff: DiffFile[] }) {
  return (
    <div style={{ padding: '4px 0 8px' }}>
      {diff.map((f, i) => (
        <div key={i} style={{ margin: '0 0 14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              background: 'var(--neutral-100)',
              borderTop: '1px solid var(--border-subtle)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-strong)' }}>{f.file}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--status-success)' }}>+{f.add}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--status-danger)' }}>−{f.del}</span>
          </div>
          {f.lines && f.lines.length ? (
            <div>
              {f.lines.map((ln, j) => {
                const bg = ln.t === 'add' ? '#E6F3EA' : ln.t === 'del' ? '#FBE7E8' : '#fff'
                const col = ln.t === 'add' ? '#1c6b39' : ln.t === 'del' ? '#a3232a' : 'var(--text-body)'
                const pre = ln.t === 'add' ? '+' : ln.t === 'del' ? '−' : ' '
                return (
                  <div
                    key={j}
                    style={{ display: 'flex', background: bg, padding: '1px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7, color: col, whiteSpace: 'pre-wrap' }}
                  >
                    <span style={{ opacity: 0.55, width: 12, flex: '0 0 12px', userSelect: 'none' }}>{pre}</span>
                    <span>{ln.text || ' '}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-subtle)' }}>
              Binary / large change — view on GitHub
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ChatView({ card }: { card: Card }) {
  const chatDrafts = useStore((s) => s.chatDrafts)
  const setChatDraft = useStore((s) => s.setChatDraft)
  const sendChat = useStore((s) => s.sendChat)
  const draft = chatDrafts[card.id] || ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        ref={(el) => {
          if (el) el.scrollTop = el.scrollHeight
        }}
        style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 200 }}
      >
        {(card.chat || []).map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%' }}>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: 'var(--text-subtle)',
                marginBottom: 4,
                textAlign: m.role === 'user' ? 'right' : 'left',
                fontFamily: 'var(--font-heading)',
              }}
            >
              {m.role === 'user' ? 'You' : 'Codex'}
            </div>
            <div
              style={{
                padding: '10px 13px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13.5,
                lineHeight: 1.5,
                background: m.role === 'user' ? 'var(--brand-primary)' : 'var(--neutral-100)',
                color: m.role === 'user' ? '#fff' : 'var(--text-body)',
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={draft}
          placeholder="Send follow-up instructions to Codex…"
          onChange={(e) => setChatDraft(card.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendChat(card.id)
            }
          }}
          style={{
            flex: 1,
            minHeight: 40,
            maxHeight: 110,
            resize: 'none',
            padding: '10px 12px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-body)',
            fontSize: 13.5,
            lineHeight: 1.4,
            color: 'var(--text-strong)',
            outline: 'none',
          }}
        />
        <Button variant="primary" onClick={() => sendChat(card.id)}>
          Send
        </Button>
      </div>
    </div>
  )
}

/** A one-line dev-server preview control for the worktree under review. */
function PreviewBar({ card }: { card: Card }) {
  const preview = useStore((s) => s.preview)
  const startPreview = useStore((s) => s.startPreview)
  const endPreview = useStore((s) => s.endPreview)
  const app = useStore((s) => s.apps.find((a) => a.id === card.appId))
  const setAppPreviewCommand = useStore((s) => s.setAppPreviewCommand)
  const saved = app?.previewCommand ?? ''
  const [cmd, setCmd] = useState(saved)
  const mine = preview.cardId === card.id
  const running = mine && preview.running
  const commit = () => {
    const v = cmd.trim()
    if (v !== saved) setAppPreviewCommand(card.appId, v)
  }
  return (
    <div style={{ padding: '9px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {running ? (preview.url ? <>Dev server live — <a href={preview.url} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--brand-primary)' }}>{preview.url}</a></> : 'Starting dev server…') : 'Run this branch before you merge it.'}
      </span>
      {!running && (
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit()
              startPreview(card.id, cmd.trim() || undefined)
            }
          }}
          placeholder="auto-detect (e.g. npm run dev)"
          spellCheck={false}
          title="Command that starts a dev server in this worktree. Leave blank to auto-detect from package.json."
          style={{
            flex: 1,
            minWidth: 160,
            height: 26,
            padding: '0 9px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            background: '#fff',
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            color: 'var(--text-body)',
            outline: 'none',
          }}
        />
      )}
      <div style={{ flex: running ? 1 : '0 0 auto' }} />
      {running ? (
        <button
          onClick={() => endPreview(card.id)}
          style={{ height: 26, padding: '0 12px', border: '1px solid var(--status-danger)', background: '#fff', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, color: 'var(--status-danger)' }}
        >
          Stop preview
        </button>
      ) : (
        <button
          onClick={() => {
            commit()
            startPreview(card.id, cmd.trim() || undefined)
          }}
          style={{ height: 26, padding: '0 12px', border: '1px solid var(--border-default)', background: '#fff', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, color: 'var(--brand-primary)' }}
        >
          ▶ Preview
        </button>
      )}
    </div>
  )
}

export function ReviewDetail({ card }: { card: Card }) {
  const tab = useStore((s) => s.detailTab)
  const setTab = useStore((s) => s.setTab)
  const approveMerge = useStore((s) => s.approveMerge)
  const requestChanges = useStore((s) => s.requestChanges)
  const openWorktree = useStore((s) => s.openWorktree)
  const live = useStore((s) => s.live)

  // Race: two agents finished — compare their diffs and pick a winner.
  if (card.raceRunIds && card.raceRunIds.length > 1) return <RaceReview card={card} />

  const stats = diffStats(card.diff || [])

  const tabBtn = (key: DetailTab, label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      style={{
        padding: '12px 16px',
        background: 'none',
        border: 'none',
        borderBottom: `2px solid ${tab === key ? 'var(--brand-primary)' : 'transparent'}`,
        cursor: 'pointer',
        fontFamily: 'var(--font-heading)',
        fontWeight: 700,
        fontSize: 13.5,
        color: tab === key ? 'var(--brand-primary)' : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '12px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--neutral-50)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-muted)' }}>⎇ {card.branch}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--status-success)' }}>+{stats.add}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--status-danger)' }}>−{stats.del}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-muted)' }}>{stats.files} files</span>
      </div>
      {live && card.worktreePath && (
        <div style={{ padding: '9px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--text-body)' }}>{agentLabel(card.agentId)}</strong> built this on its own branch in{' '}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-body)' }} title={card.worktreePath}>
              {card.worktreePath.replace(/^.*\/(\.dispatch\/worktrees\/[^/]+).*$/, '…/$1')}
            </span>
            {' '}— not your working copy.
          </span>
          <button
            onClick={() => openWorktree(card.id)}
            style={{ height: 26, padding: '0 10px', border: '1px solid var(--border-default)', background: '#fff', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, color: 'var(--brand-primary)' }}
          >
            Open folder
          </button>
        </div>
      )}
      {live && card.worktreePath && <PreviewBar card={card} />}
      <div style={{ display: 'flex', gap: 4, padding: '0 18px', borderBottom: '1px solid var(--border-subtle)' }}>
        {tabBtn('diff', 'Diff')}
        {tabBtn('chat', 'Chat')}
      </div>
      <div style={{ flex: 1, overflowY: tab === 'diff' ? 'auto' : 'hidden', minHeight: 0 }}>
        {tab === 'diff' ? <DiffView diff={card.diff || []} /> : <ChatView card={card} />}
      </div>
      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', background: 'var(--neutral-50)', display: 'flex', gap: 10 }}>
        <Button variant="primary" onClick={() => approveMerge(card.id)}>
          Approve &amp; merge
        </Button>
        <Button variant="secondary" onClick={() => requestChanges(card.id)}>
          Request changes
        </Button>
      </div>
    </div>
  )
}

/** Race review: load both competing runs, show their diffs, and pick a winner. */
function RaceReview({ card }: { card: Card }) {
  const pickWinner = useStore((s) => s.pickWinner)
  const [runs, setRuns] = useState<AgentRun[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const ids = (card.raceRunIds || []).join(',')

  useEffect(() => {
    let live = true
    Promise.all((card.raceRunIds || []).map((id) => agent.getRun(id).catch(() => null)))
      .then((rs) => {
        if (!live) return
        const got = rs.filter(Boolean) as AgentRun[]
        setRuns(got)
        setOpen((cur) => cur ?? got[0]?.id ?? null)
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  if (!runs) return <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Loading both builds…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--neutral-50)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚔</span>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--text-strong)' }}>Two builds, one card — pick the winner</span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Each agent built this on its own branch. Compare the diffs, then merge the one you like. The other branch is discarded.
        </p>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {runs.map((r) => {
          const stats = diffStats(r.diff || [])
          const isOpen = open === r.id
          const failed = r.status === 'failed' || r.status === 'interrupted'
          return (
            <div key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px', cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : r.id)}>
                <span style={{ fontSize: 11, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--text-muted)' }}>▶</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>{agentLabel(r.agentId as CodingAgentId)}</span>
                {failed ? (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--status-danger)' }}>failed</span>
                ) : (
                  <>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--status-success)' }}>+{stats.add}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--status-danger)' }}>−{stats.del}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{stats.files} files</span>
                  </>
                )}
                <div style={{ flex: 1 }} />
                <span onClick={(e) => e.stopPropagation()}>
                  <Button variant="primary" onClick={() => pickWinner(card.id, r.id)}>
                    Pick this →
                  </Button>
                </span>
              </div>
              {isOpen && (r.diff?.length ? <DiffView diff={r.diff} /> : <div style={{ padding: '10px 22px 16px', fontSize: 12.5, color: 'var(--text-subtle)' }}>No changes recorded for this build.</div>)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
