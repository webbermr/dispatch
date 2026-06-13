import { useState } from 'react'
import { agent, type RepoDiagnosis } from '../lib/agentClient'
import { useStore } from '../store/useStore'
import { Button } from './Button'

const inputStyle = {
  width: '100%',
  height: 38,
  padding: '0 12px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13.5,
  color: 'var(--text-strong)',
  background: 'var(--neutral-50)',
  outline: 'none',
} as const

const labelStyle = {
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: 'var(--text-subtle)',
  marginBottom: 6,
  display: 'block',
} as const

const LEVEL = {
  ok: { bg: 'var(--status-success-surface)', fg: 'var(--status-success)', icon: '✓' },
  warn: { bg: 'var(--status-warning-surface)', fg: 'var(--status-warning)', icon: '⚠' },
  error: { bg: 'var(--status-danger-surface)', fg: 'var(--status-danger)', icon: '✕' },
} as const

function DiagnosisPanel({ d }: { d: RepoDiagnosis }) {
  const c = LEVEL[d.level]
  return (
    <div style={{ marginTop: 14, borderRadius: 'var(--radius-sm)', background: c.bg, borderLeft: `3px solid ${c.fg}`, padding: '11px 13px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ color: c.fg, fontSize: 14, lineHeight: '20px' }}>{c.icon}</span>
        <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-body)' }}>{d.message}</span>
      </div>
      {d.steps.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {d.steps.map((s, i) =>
            /^(git |npx |gh )/.test(s) ? (
              <code
                key={i}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-strong)',
                  background: '#fff',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '4px 8px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {s}
              </code>
            ) : (
              <span key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>
                {s}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  )
}

export function AddAppModal() {
  const addAppOpen = useStore((s) => s.addAppOpen)
  const closeAddApp = useStore((s) => s.closeAddApp)
  const addApp = useStore((s) => s.addApp)
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [diag, setDiag] = useState<RepoDiagnosis | null>(null)
  if (!addAppOpen) return null

  const onPathChange = (v: string) => {
    setPath(v)
    setDiag(null) // a changed path invalidates the previous check
  }

  const check = async () => {
    if (!path.trim() || checking) return
    setChecking(true)
    try {
      setDiag(await agent.diagnose(path.trim()))
    } catch (e) {
      setDiag({ level: 'error', message: (e as Error).message, steps: [], details: { exists: false, isGitRepo: false, hasCommits: false, remoteUrl: null, host: null, remoteReachable: null } })
    }
    setChecking(false)
  }

  const submit = async () => {
    if (!path.trim() || busy) return
    setBusy(true)
    const id = await addApp(path, name)
    setBusy(false)
    if (id) {
      setPath('')
      setName('')
      setDiag(null)
    }
  }

  return (
    <div
      onClick={closeAddApp}
      style={{ position: 'fixed', inset: 0, background: 'rgba(11,35,56,.6)', zIndex: 1150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', animation: 'dpfade .2s', borderTop: '4px solid var(--brand-primary)' }}
      >
        <div style={{ padding: '24px 24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-sm)', background: '#E1EEF6', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>+</div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19, margin: 0, color: 'var(--text-strong)' }}>Add a repo</h3>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-body)', margin: '0 0 16px' }}>
            Point Dispatch at a git repo that's already cloned on this machine. Use <strong>Check</strong> to confirm it can build, commit, and push.
          </p>

          <label style={labelStyle}>Local path</label>
          <input
            autoFocus
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
            placeholder="/Users/you/code/my-repo"
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12.5, marginBottom: 14 }}
          />

          <label style={labelStyle}>Name (optional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Defaults to the folder name" style={inputStyle} />

          <div style={{ marginTop: 14 }}>
            <Button variant="secondary" onClick={check} disabled={!path.trim() || checking} style={{ height: 34, fontSize: 13 }}>
              {checking ? 'Checking…' : 'Check connection'}
            </Button>
          </div>
          {diag && <DiagnosisPanel d={diag} />}
        </div>
        <div style={{ padding: '14px 24px', background: 'var(--neutral-50)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={closeAddApp} style={{ height: 38 }}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy || !path.trim() || diag?.level === 'error'} style={{ height: 38 }}>
            {busy ? 'Adding…' : 'Add repo'}
          </Button>
        </div>
      </div>
    </div>
  )
}
