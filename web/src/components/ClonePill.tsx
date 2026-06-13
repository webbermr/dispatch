interface ClonePillProps {
  cloned: boolean
}

export function ClonePill({ cloned }: ClonePillProps) {
  const bg = cloned ? 'var(--status-success-surface)' : 'var(--status-warning-surface)'
  const fg = cloned ? 'var(--status-success)' : 'var(--status-warning)'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 24,
        padding: '0 10px',
        borderRadius: 'var(--radius-pill)',
        background: bg,
        color: fg,
        fontFamily: 'var(--font-heading)',
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg }} />
      {cloned ? 'Cloned' : 'Not cloned'}
    </span>
  )
}
