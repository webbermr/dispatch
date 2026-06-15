import { useEffect, useState } from 'react'
import { agent, type MetricsResult } from '../lib/agentClient'
import { agentLabel } from '../lib/constants'
import { useStore } from '../store/useStore'
import { Button } from './Button'

function fmtMs(ms: number | null): string {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function pct(success: number, total: number): string {
  return total ? `${Math.round((success / total) * 100)}%` : '—'
}

export function StatsModal() {
  const open = useStore((s) => s.statsOpen)
  const setStatsOpen = useStore((s) => s.setStatsOpen)
  const appId = useStore((s) => s.appId)
  const live = useStore((s) => s.live)
  const appName = useStore((s) => s.apps.find((a) => a.id === appId)?.name)
  const [data, setData] = useState<MetricsResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    if (!live) {
      setData(null)
      return
    }
    setLoading(true)
    let alive = true
    agent
      .metrics(appId ?? undefined)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open, appId, live])

  if (!open) return null

  const cell = { padding: '7px 10px', fontSize: 13, color: 'var(--text-body)' } as const
  const head = { ...cell, fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-subtle)' } as const

  return (
    <div onClick={() => setStatsOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,35,56,.6)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 540, background: '#fff', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', animation: 'dpfade .2s', borderTop: '4px solid var(--brand-primary)' }}>
        <div style={{ padding: '22px 24px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
            <span style={{ fontSize: 20 }}>📊</span>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19, margin: 0, color: 'var(--text-strong)' }}>Build stats</h3>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>{appName ? `${appName} — ` : ''}across every run (including retries and race contenders).</p>

          {!live ? (
            <div style={{ fontSize: 13.5, color: 'var(--text-subtle)' }}>Connect your machine to see build stats.</div>
          ) : loading && !data ? (
            <div style={{ fontSize: 13.5, color: 'var(--text-subtle)' }}>Loading…</div>
          ) : !data || data.totals.total === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--text-subtle)' }}>No finished builds yet.</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
                <Stat label="Builds" value={String(data.totals.total)} />
                <Stat label="Success" value={pct(data.totals.success, data.totals.total)} accent="var(--status-success)" />
                <Stat label="Failed" value={String(data.totals.failed)} accent={data.totals.failed ? 'var(--status-danger)' : undefined} />
                <Stat label="Avg time" value={fmtMs(data.totals.avgMs)} />
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ ...head, textAlign: 'left' }}>Agent · model</th>
                    <th style={{ ...head, textAlign: 'right' }}>Builds</th>
                    <th style={{ ...head, textAlign: 'right' }}>Success</th>
                    <th style={{ ...head, textAlign: 'right' }}>Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byAgent.map((r) => (
                    <tr key={`${r.agentId}/${r.model}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ ...cell, fontWeight: 600, color: 'var(--text-strong)' }}>
                        {agentLabel(r.agentId)} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>· {r.model}</span>
                      </td>
                      <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.total}</td>
                      <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.failed ? 'var(--text-body)' : 'var(--status-success)' }}>
                        {pct(r.success, r.total)}
                      </td>
                      <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtMs(r.avgMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div style={{ padding: '14px 24px', background: 'var(--neutral-50)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => setStatsOpen(false)} style={{ height: 36 }}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-subtle)', fontWeight: 700, fontFamily: 'var(--font-heading)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-heading)', color: accent ?? 'var(--text-strong)' }}>{value}</div>
    </div>
  )
}
