import type { DiffFile } from '../../store/types'

/** Renders a unified diff (file headers + add/del/context lines). */
export function DiffView({ diff }: { diff: DiffFile[] }) {
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
                const pre = ln.t === 'add' ? '+' : ln.t === 'del' ? '−' : ' '
                return (
                  <div
                    key={j}
                    style={{ display: 'flex', background: bg, padding: '1px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7, color: col, whiteSpace: 'pre-wrap' }}
                  >
                    <span style={{ opacity: 0.55, width: 12, flex: '0 0 12px', userSelect: 'none' }}>{pre}</span>
                    <span>{ln.text || ' '}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-subtle)' }}>Binary / large change — view on GitHub</div>
          )}
        </div>
      ))}
    </div>
  )
}
