import { useEffect, useState } from 'react'
import { agent, type AgentRun } from '../../lib/agentClient'
import { agentLabel } from '../../lib/constants'

const STATUS: Record<string, { label: string; color: string }> = {
  needs_review: { label: 'reviewed', color: 'var(--status-success)' },
  merged: { label: 'merged', color: 'var(--status-success)' },
  building: { label: 'building', color: 'var(--status-warning)' },
  ready: { label: 'stopped', color: 'var(--text-subtle)' },
  failed: { label: 'failed', color: 'var(--status-danger)' },
  interrupted: { label: 'interrupted', color: 'var(--status-danger)' },
}

function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

/** Collapsible list of every run for a card (retries + race contenders). */
export function RunHistory({ cardId }: { cardId: string }) {
  const [runs, setRuns] = useState<AgentRun[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    agent
      .cardRuns(cardId)
      .then((r) => alive && setRuns(r.runs))
      .catch(() => alive && setRuns([]))
    return () => {
      alive = false
    }
  }, [cardId])

  // Only worth showing once there's more than one attempt (retry / race / re-run).
  if (!runs || runs.length < 2) return null

  return (
    <div style={{ width: '100%', borderTop: '1px solid var(--border-subtle)', paddingTop: 14, marginTop: 4 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%' }}
      >
        <span style={{ fontSize: 11, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--text-muted)' }}>▶</span>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Attempts ({runs.length})
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {runs.map((r, i) => {
            const st = STATUS[r.status] ?? { label: r.status, color: 'var(--text-muted)' }
            const dur = r.updatedAt && r.createdAt ? fmtDur(r.updatedAt - r.createdAt) : ''
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '6px 0', borderBottom: i < runs.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, flex: '0 0 7px' }} />
                <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{agentLabel(r.agentId)}</span>
                {r.model && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{r.model}</span>}
                {r.retryOf && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>retry</span>}
                <div style={{ flex: 1 }} />
                <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                {dur && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-subtle)' }}>{dur}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
