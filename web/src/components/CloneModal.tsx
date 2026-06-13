import { useStore } from '../store/useStore'
import { Button } from './Button'

export function CloneModal() {
  const cloneModal = useStore((s) => s.cloneModal)
  const confirmClone = useStore((s) => s.confirmClone)
  const cancelClone = useStore((s) => s.cancelClone)
  if (!cloneModal) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,35,56,.6)',
        zIndex: 1150,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#fff',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          animation: 'dpfade .2s',
          borderTop: '4px solid var(--status-warning)',
        }}
      >
        <div style={{ padding: '24px 24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--status-warning-surface)',
                color: 'var(--status-warning)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              ⎘
            </div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19, margin: 0, color: 'var(--text-strong)' }}>Repo not cloned</h3>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-body)', margin: '0 0 14px' }}>
            Codex can't start until <strong>{cloneModal.appName}</strong> is on this machine. Clone it now and we'll dispatch the card right after.
          </p>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12.5,
              color: 'var(--text-strong)',
              background: 'var(--neutral-50)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
            }}
          >
            git clone git@github.com:{cloneModal.repo}.git
          </div>
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
          <Button variant="secondary" onClick={cancelClone} style={{ height: 38 }}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirmClone} style={{ height: 38 }}>
            Clone &amp; continue
          </Button>
        </div>
      </div>
    </div>
  )
}
