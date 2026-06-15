import { useState } from 'react'
import { useStore } from '../store/useStore'

/** A slide-over listing archived (shipped) cards for the current app, searchable. */
export function ArchiveDrawer() {
  const open = useStore((s) => s.archiveOpen)
  const setArchiveOpen = useStore((s) => s.setArchiveOpen)
  const appId = useStore((s) => s.appId)
  const cards = useStore((s) => s.cards)
  const unarchiveCard = useStore((s) => s.unarchiveCard)
  const openCard = useStore((s) => s.openCard)
  const [q, setQ] = useState('')
  if (!open) return null

  const term = q.trim().toLowerCase()
  const list = cards
    .filter((c) => c.appId === appId && c.archived)
    .filter((c) => !term || `${c.title} ${c.desc} ${c.prompt ?? ''} ${c.branch ?? ''}`.toLowerCase().includes(term))
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,35,56,.5)', zIndex: 1180, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(2px)' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(440px, 92vw)', height: '100%', background: '#fff', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', animation: 'dpslide .2s' }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🗄</span>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, margin: 0, color: 'var(--text-strong)' }}>Archive</h3>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)' }}>{list.length}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setArchiveOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1 }}>
            ×
          </button>
        </div>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search archived cards…"
            style={{ width: '100%', height: 34, padding: '0 11px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--text-strong)', background: 'var(--neutral-50)', outline: 'none' }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.length === 0 && (
            <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>
              {term ? 'No archived cards match your search.' : 'Nothing archived yet. Shipped cards land here when you clear them or after a week.'}
            </div>
          )}
          {list.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--neutral-50)' }}>
              <span style={{ color: 'var(--status-success)', fontSize: 13 }}>{c.prUrl ? '⎋' : '✓'}</span>
              <button
                onClick={() => {
                  setArchiveOpen(false)
                  openCard(c.id)
                }}
                style={{ flex: 1, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', overflow: 'hidden' }}
              >
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                {c.branch && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>⎇ {c.branch}</div>}
              </button>
              <button
                onClick={() => unarchiveCard(c.id)}
                title="Restore to the board"
                style={{ height: 28, padding: '0 10px', border: '1px solid var(--border-default)', background: '#fff', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, color: 'var(--brand-primary)', whiteSpace: 'nowrap' }}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
