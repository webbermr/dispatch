import { diffStats } from '../../lib/helpers'
import { useStore } from '../../store/useStore'
import type { Card } from '../../store/types'

export function MergedDetail({ card }: { card: Card }) {
  const apps = useStore((s) => s.apps)
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
        <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>Fast-forward merged locally · no remote push</div>
      )}
      <div style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>{card.mergedAt || ''}</div>
    </div>
  )
}
