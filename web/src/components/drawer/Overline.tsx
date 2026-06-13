import type { CSSProperties } from 'react'

export function Overline({ children, style }: { children: string; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-heading)',
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        color: 'var(--text-subtle)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
