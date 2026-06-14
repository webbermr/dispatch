import { useState } from 'react'
import { useStore } from '../store/useStore'

export function TopBar() {
  const agentStatus = useStore((s) => s.agentStatus)
  const agentBusy = useStore((s) => s.agentBusy)
  const agentPort = useStore((s) => s.agentPort)
  const openConnect = useStore((s) => s.openConnect)
  const [hover, setHover] = useState(false)

  const dotColor =
    agentStatus === 'connected' ? 'var(--color-green-light)' : agentBusy ? 'var(--color-yellow-light)' : 'var(--color-orange-light)'
  const dotGlow =
    agentStatus === 'connected' ? 'rgba(78,185,111,.3)' : agentBusy ? 'rgba(253,219,0,.3)' : 'rgba(255,109,45,.3)'
  const label =
    agentStatus === 'connected' ? `Agent · localhost:${agentPort}` : agentBusy ? 'Connecting…' : 'Agent offline'

  return (
    <header
      style={{
        height: 58,
        flex: '0 0 58px',
        background: 'var(--color-dark-navy)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 22px',
        color: '#fff',
        position: 'relative',
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-highlighter)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 20,
          color: 'var(--color-dark-navy)',
        }}
      >
        D
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, letterSpacing: '.01em', lineHeight: 1 }}>
        DISPATCH
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: 'var(--text-on-dark-muted)',
          borderLeft: '1px solid rgba(255,255,255,.16)',
          paddingLeft: 14,
          marginLeft: 2,
        }}
      >
        Pick a card. Build a feature.
      </div>
      <div style={{ flex: 1 }} />
      <button
        onClick={openConnect}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 32,
          padding: '0 13px',
          borderRadius: 'var(--radius-pill)',
          border: `1px solid rgba(255,255,255,${hover ? '.32' : '.18'})`,
          background: `rgba(255,255,255,${hover ? '.13' : '.06'})`,
          color: '#fff',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          transition: 'background var(--duration-fast), border-color var(--duration-fast)',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: `0 0 0 3px ${dotGlow}` }} />
        {label}
      </button>
    </header>
  )
}
