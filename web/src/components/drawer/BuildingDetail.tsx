import { useStore } from '../../store/useStore'
import type { Card } from '../../store/types'
import { Button } from '../Button'

interface StepDef {
  id: string
  label: string
  done: boolean
  active: boolean
}

function StepIcon({ step }: { step: StepDef }) {
  if (step.done) {
    return (
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'var(--status-success)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          flex: '0 0 20px',
        }}
      >
        ✓
      </span>
    )
  }
  if (step.active) {
    return (
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: '2px solid var(--neutral-200)',
          borderTopColor: 'var(--brand-primary)',
          display: 'inline-block',
          flex: '0 0 20px',
          animation: 'dpspin .8s linear infinite',
        }}
      />
    )
  }
  return <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--border-default)', display: 'inline-block', flex: '0 0 20px' }} />
}

function logColor(ln: string): string {
  if (ln.indexOf('✓') === 0 || ln.indexOf('PASS') > -1) return '#7BE0A0'
  if (ln.indexOf('$') === 0) return 'var(--color-highlighter)'
  if (ln.indexOf('✎') === 0) return '#9BD4FF'
  return '#CFE6F5'
}

export function BuildingDetail({ card }: { card: Card }) {
  const logOpen = useStore((s) => s.logOpen)
  const toggleLog = useStore((s) => s.toggleLog)
  const stopBuild = useStore((s) => s.stopBuild)

  const b = card.build ?? { progress: 0, logs: [], currentStep: '' }
  const open = logOpen[card.id] !== false // default open
  const steps: StepDef[] = [
    { id: 's1', label: 'Cloning context', done: b.progress >= 12, active: b.progress < 12 },
    { id: 's2', label: 'Planning changes', done: b.progress >= 32, active: b.progress >= 12 && b.progress < 32 },
    { id: 's3', label: 'Editing files', done: b.progress >= 68, active: b.progress >= 32 && b.progress < 68 },
    { id: 's4', label: 'Running tests', done: b.progress >= 92, active: b.progress >= 68 && b.progress < 92 },
    { id: 's5', label: 'Opening pull request', done: b.progress >= 100, active: b.progress >= 92 && b.progress < 100 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: 'var(--color-highlighter)',
              boxShadow: '0 0 0 4px rgba(255,246,1,.28)',
              animation: 'dppulse 1.3s ease-in-out infinite',
            }}
          />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>Codex is building…</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>⎇ {card.branch}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--neutral-200)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${b.progress}%`,
                backgroundImage: 'linear-gradient(90deg, var(--color-highlighter), #FFE94D)',
                backgroundSize: '28px 28px',
                animation: 'dpstripe .8s linear infinite',
                transition: 'width .5s var(--ease-standard)',
              }}
            />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', minWidth: 42, textAlign: 'right' }}>
            {b.progress}%
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{b.currentStep}</div>
      </div>

      <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <StepIcon step={s} />
            <span style={{ fontSize: 14, fontWeight: s.active ? 700 : 500, color: s.done || s.active ? 'var(--text-strong)' : 'var(--text-subtle)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 22px 16px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <button
          onClick={() => toggleLog(card.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', color: 'var(--text-muted)' }}
        >
          <span style={{ fontSize: 11, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Raw log
          </span>
        </button>
        {open && (
          <div
            ref={(el) => {
              if (el) el.scrollTop = el.scrollHeight
            }}
            style={{
              flex: 1,
              minHeight: 140,
              overflowY: 'auto',
              background: 'var(--color-dark-navy)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.7,
              color: '#CFE6F5',
            }}
          >
            {b.logs.map((ln, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', color: logColor(ln) }}>
                {ln}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', background: 'var(--neutral-50)' }}>
        <Button variant="secondary" onClick={() => stopBuild(card.id)}>
          Stop build
        </Button>
      </div>
    </div>
  )
}
