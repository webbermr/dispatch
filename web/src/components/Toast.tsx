import { useStore } from '../store/useStore'

export function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 28,
        transform: 'translateX(-50%)',
        background: 'var(--color-dark-navy)',
        color: '#fff',
        padding: '12px 18px',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 1200,
        fontSize: 14,
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        animation: 'dpfade .2s',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-highlighter)' }} />
      {toast}
    </div>
  )
}
