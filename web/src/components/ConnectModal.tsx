import { useStore } from '../store/useStore'
import { Button } from './Button'

function StatusRow() {
  const agentStatus = useStore((s) => s.agentStatus)
  const agentBusy = useStore((s) => s.agentBusy)
  const agentPort = useStore((s) => s.agentPort)
  const health = useStore((s) => s.health)
  const codexLabel = health?.codexVersion ? `codex ${health.codexVersion}` : 'codex 0.42'

  if (agentBusy) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid var(--neutral-200)',
            borderTopColor: 'var(--brand-primary)',
            display: 'inline-block',
            animation: 'dpspin .8s linear infinite',
          }}
        />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Waiting for the agent to pair…</span>
      </div>
    )
  }
  if (agentStatus === 'connected') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--status-success)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
          }}
        >
          ✓
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-body)' }}>
          Connected · <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>localhost:{agentPort}</span> · {codexLabel}
        </span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-warning)' }} />
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No agent detected on this machine.</span>
    </div>
  )
}

export function ConnectModal() {
  const connectOpen = useStore((s) => s.connectOpen)
  const agentStatus = useStore((s) => s.agentStatus)
  const agentBusy = useStore((s) => s.agentBusy)
  const closeConnect = useStore((s) => s.closeConnect)
  const reconnect = useStore((s) => s.reconnect)
  const disconnect = useStore((s) => s.disconnect)
  const pairCode = useStore((s) => s.pairCode)
  if (!connectOpen) return null

  const code = `npx @dispatch/agent --pair ${pairCode}`

  return (
    <div
      onClick={closeConnect}
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
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 468,
          background: '#fff',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          animation: 'dpfade .2s',
          borderTop: '4px solid var(--brand-primary)',
        }}
      >
        <div style={{ padding: '24px 24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 'var(--radius-sm)',
                background: '#E1EEF6',
                color: 'var(--brand-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              ⎇
            </div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19, margin: 0, color: 'var(--text-strong)' }}>Connect your machine</h3>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-body)', margin: '0 0 16px' }}>
            Dispatch runs Codex on your own machine through a small local agent, so your code never leaves your computer. The board talks to it over
            localhost — start it once per session:
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: 12.5,
              color: 'var(--text-strong)',
              background: 'var(--color-dark-navy)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 14px',
              marginBottom: 16,
            }}
          >
            <span style={{ color: 'var(--color-highlighter)' }}>$</span>
            <span style={{ color: '#CFE6F5', flex: 1 }}>{code}</span>
            <span
              style={{ color: 'var(--text-on-dark-muted)', fontSize: 11, cursor: 'pointer' }}
              title="Copy"
              onClick={() => navigator.clipboard?.writeText(code)}
            >
              copy
            </span>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)' }}>
            <StatusRow />
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
          {agentStatus === 'connected' ? (
            <>
              <Button variant="primary" onClick={closeConnect} style={{ height: 38 }}>
                Done
              </Button>
              <Button variant="secondary" onClick={disconnect} style={{ height: 38 }}>
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" onClick={reconnect} disabled={agentBusy} style={{ height: 38 }}>
                {agentBusy ? 'Connecting…' : "I’ve run it →"}
              </Button>
              <Button variant="secondary" onClick={closeConnect} style={{ height: 38 }}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
