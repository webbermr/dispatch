import type { CSSProperties, ReactNode } from 'react'
import { useState } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'highlighter'

interface ButtonProps {
  variant?: ButtonVariant
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
  style?: CSSProperties
}

const base: CSSProperties = {
  height: 40,
  padding: '0 18px',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  fontSize: 14,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  transition: 'background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)',
}

const variants: Record<ButtonVariant, { rest: CSSProperties; hover: CSSProperties }> = {
  primary: {
    rest: { border: '1px solid var(--brand-primary)', background: 'var(--brand-primary)', color: '#fff' },
    hover: { background: 'var(--brand-primary-hover)', borderColor: 'var(--brand-primary-hover)' },
  },
  secondary: {
    rest: { border: '1px solid var(--border-default)', background: '#fff', color: 'var(--text-body)' },
    hover: { background: 'var(--neutral-100)' },
  },
  highlighter: {
    rest: { border: '1px solid var(--color-highlighter)', background: 'var(--color-highlighter)', color: 'var(--color-dark-navy)' },
    hover: { background: '#FFE94D', borderColor: '#FFE94D' },
  },
}

export function Button({ variant = 'primary', onClick, disabled, children, style }: ButtonProps) {
  const [hover, setHover] = useState(false)
  const v = variants[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...base,
        ...v.rest,
        ...(hover && !disabled ? v.hover : null),
        ...(disabled ? { opacity: 0.6, cursor: 'default' } : null),
        ...style,
      }}
    >
      {children}
    </button>
  )
}
