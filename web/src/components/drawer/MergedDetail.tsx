import { useEffect, useState } from 'react'
import { agent, type ChecksResult } from '../../lib/agentClient'
import { agentLabel } from '../../lib/constants'
import { diffStats } from '../../lib/helpers'
import { useStore } from '../../store/useStore'
import type { Card } from '../../store/types'

const CI_STYLE: Record<string, { dot: string; label: string }> = {
  success: { dot: 'var(--status-success)', label: 'All checks passed' },
  failure: { dot: 'var(--status-danger)', label: 'Some checks failed' },
  pending: { dot: 'var(--status-warning)', label: 'Checks running…' },
  none: { dot: 'var(--neutral-300)', label: 'No checks reported' },
  unsupported: { dot: 'var(--neutral-300)', label: '' },
}

const BUCKET_ICON: Record<string, string> = { pass: '✓', fail: '✕', pending: '○', skipping: '–', cancel: '⊘' }
const BUCKET_COLOR: Record<string, string> = {
  pass: 'var(--status-success)',
  fail: 'var(--status-danger)',
  pending: 'var(--status-warning)',
  skipping: 'var(--text-subtle)',
  cancel: 'var(--text-subtle)',
}

/** CI checks for a PR card — fetched on open, auto-refreshed while pending. */
function CiStatus({ runId }: { runId: string }) {
  const [data, setData] = useState<ChecksResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    agent
      .checks(runId)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [runId, tick])

  // Auto-refresh a few times while checks are still running.
  useEffect(() => {
    if (data?.state !== 'pending' || tick >= 10) return
    const t = setTimeout(() => setTick((n) => n + 1), 8000)
    return () => clearTimeout(t)
  }, [data, tick])

  if (loading && !data) return <div style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>Loading CI status…</div>
  if (!data || data.state === 'unsupported') return null
  const meta = CI_STYLE[data.state]

  return (
    <div style={{ width: '100%', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: data.checks.length ? 8 : 0 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: meta.dot, ...(data.state === 'pending' ? { animation: 'dppulse 1.3s ease-in-out infinite' } : {}) }} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--text-strong)' }}>{meta.label}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setTick((n) => n + 1)} title="Refresh CI status" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: 2 }}>
          ↻
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {data.checks.map((c, i) => {
          const b = (c.bucket || '').toLowerCase()
          const inner = (
            <>
              <span style={{ color: BUCKET_COLOR[b] ?? 'var(--text-muted)', fontWeight: 700, width: 14, flex: '0 0 14px', textAlign: 'center' }}>{BUCKET_ICON[b] ?? '·'}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.workflow ? `${c.workflow} / ${c.name}` : c.name}</span>
            </>
          )
          return c.link ? (
            <a key={i} href={c.link} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
              {inner}
            </a>
          ) : (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MergedDetail({ card }: { card: Card }) {
  const apps = useStore((s) => s.apps)
  const checkoutBranch = useStore((s) => s.checkoutBranch)
  const live = useStore((s) => s.live)
  const base = apps.find((a) => a.id === card.appId)?.base ?? 'main'
  const stats = diffStats(card.diff || [])
  const isPr = !!card.prUrl

  return (
    <div style={{ padding: '40px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14 }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--status-success-surface)',
          color: 'var(--status-success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
        }}
      >
        {isPr ? '⎋' : '✓'}
      </div>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 24, margin: 0, color: 'var(--text-strong)' }}>
        {isPr ? 'Pull request opened' : `Merged to ${base}`}
      </h2>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-muted)', maxWidth: 360 }}>{card.desc}</p>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--text-body)',
          background: 'var(--neutral-50)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 14px',
        }}
      >
        ⎇ {card.branch} &nbsp;→&nbsp; {base}
      </div>
      <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        <span style={{ color: 'var(--status-success)', fontWeight: 700 }}>+{stats.add}</span>
        <span style={{ color: 'var(--status-danger)', fontWeight: 700 }}>−{stats.del}</span>
        <span style={{ color: 'var(--text-muted)' }}>{stats.files} files</span>
      </div>
      {isPr ? (
        <a
          href={card.prUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--brand-primary)', textDecoration: 'none', marginTop: 4 }}
        >
          View pull request →
        </a>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>Fast-forward merged into your local {base}</div>
      )}
      <div style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>
        {card.mergedAt || ''}
        {card.agentId ? ` · built by ${agentLabel(card.agentId)}` : ''}
      </div>

      {live && isPr && card.runId && (
        <div style={{ marginTop: 6, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', width: '100%' }}>
          <CiStatus runId={card.runId} />
        </div>
      )}

      {live && card.branch && (
        <div style={{ marginTop: 10, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.5 }}>
            {isPr
              ? 'To keep working on it locally, check the branch out in your repo — or merge the PR on the web and pull.'
              : 'The change is already on your local ' + base + '. To continue on the feature branch, check it out.'}
          </div>
          <button
            onClick={() => checkoutBranch(card.id)}
            style={{ height: 32, padding: '0 14px', border: '1px solid var(--border-default)', background: '#fff', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--brand-primary)' }}
          >
            ⎇ Check out {card.branch} in my repo
          </button>
        </div>
      )}
    </div>
  )
}
