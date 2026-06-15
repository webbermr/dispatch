import { useStore } from '../store/useStore'
import { Button } from './Button'

/** A generic in-app confirmation dialog, styled like the other modals. */
export function ConfirmModal() {
  const confirm = useStore((s) => s.confirm)
  const closeConfirm = useStore((s) => s.closeConfirm)
  if (!confirm) return null

  const accent = confirm.danger ? 'var(--status-danger)' : 'var(--brand-primary)'
  const surface = confirm.danger ? 'var(--status-danger-surface)' : '#E1EEF6'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,35,56,.6)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          animation: 'dpfade .2s',
          borderTop: `4px solid ${accent}`,
        }}
      >
        <div style={{ padding: '24px 24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 'var(--radius-sm)',
                background: surface,
                color: accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              {confirm.danger ? '⚠' : '?'}
            </div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19, margin: 0, color: 'var(--text-strong)' }}>{confirm.title}</h3>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-body)', margin: 0 }}>{confirm.message}</p>
        </div>
        <div
          style={{
            padding: '14px 24px',
            background: 'var(--neutral-50)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="secondary" onClick={closeConfirm} style={{ height: 38 }}>
            {confirm.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const fn = confirm.onConfirm
              closeConfirm()
              fn()
            }}
            style={{ height: 38, ...(confirm.danger ? { background: 'var(--status-danger)' } : null) }}
          >
            {confirm.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  )
}
