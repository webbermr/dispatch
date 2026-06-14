import { agentLabel } from '../../lib/constants'
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
  const appAgent = useStore((s) => s.apps.find((a) => a.id === card.appId)?.agent)

  // Plan-first: a plan is awaiting your approval.
  if (card.phase === 'plan_review' && card.plan) return <PlanReview card={card} />
  // Race: the card is being built by two agents at once.
  if (card.raceRunIds && card.raceRunIds.length > 1) return <RaceBuilding />

  const b = card.build ?? { progress: 0, logs: [], currentStep: '' }
  // Prefer the run's recorded agent; fall back to the repo's selected agent.
  const agentName = agentLabel(card.agentId ?? appAgent)
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
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>{agentName} is building…</span>
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

const panel = { flex: 1, overflowY: 'auto', minHeight: 0, padding: '20px 22px' } as const

/** Plan-first: show the proposed plan and let the user approve or revise it. */
function PlanReview({ card }: { card: Card }) {
  const appAgent = useStore((s) => s.apps.find((a) => a.id === card.appId)?.agent)
  const approvePlan = useStore((s) => s.approvePlan)
  const requestPlanChanges = useStore((s) => s.requestPlanChanges)
  const chatDrafts = useStore((s) => s.chatDrafts)
  const setChatDraft = useStore((s) => s.setChatDraft)
  const name = agentLabel(card.agentId ?? appAgent)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ ...panel }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--text-strong)' }}>{name} proposed a plan</span>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Review the approach before any code is written. Approve to implement, or send feedback to re-plan.
        </p>
        <div
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            lineHeight: 1.7,
            color: 'var(--text-strong)',
            background: 'var(--neutral-50)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
          }}
        >
          {card.plan}
        </div>
        <textarea
          value={chatDrafts[card.id] ?? ''}
          onChange={(e) => setChatDraft(card.id, e.target.value)}
          placeholder="Optional: feedback to revise the plan…"
          rows={2}
          style={{
            width: '100%',
            marginTop: 12,
            resize: 'vertical',
            minHeight: 44,
            padding: '8px 10px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-body)',
            fontSize: 13.5,
            color: 'var(--text-strong)',
            background: '#fff',
            outline: 'none',
          }}
        />
      </div>
      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', background: 'var(--neutral-50)', display: 'flex', gap: 10 }}>
        <Button variant="highlighter" onClick={() => approvePlan(card.id)}>
          Approve plan & build →
        </Button>
        <Button variant="secondary" onClick={() => requestPlanChanges(card.id)}>
          Request changes
        </Button>
      </div>
    </div>
  )
}

/** Race: both agents are building the same card in parallel. */
function RaceBuilding() {
  const health = useStore((s) => s.health)
  const names = (health?.agents ?? []).filter((a) => a.installed).map((a) => a.label)
  return (
    <div style={{ ...panel, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14 }}>
      <span style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid var(--neutral-200)', borderTopColor: 'var(--color-purple-dark)', display: 'inline-block', animation: 'dpspin .8s linear infinite' }} />
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--text-strong)' }}>
        ⚔ Racing {names.join(' vs ') || 'agents'}…
      </div>
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)', maxWidth: 340, lineHeight: 1.5 }}>
        Each agent is building this card on its own branch in parallel. When both finish, you'll compare their diffs and pick the winner.
      </p>
    </div>
  )
}
