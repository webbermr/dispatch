import { useState } from 'react'
import { agentLabel, EXAMPLE_DESC, EXAMPLE_PROMPT, PRI, TYPE } from '../../lib/constants'
import { useStore } from '../../store/useStore'
import type { Card } from '../../store/types'
import { Button } from '../Button'
import { Overline } from './Overline'

const tileWrap = { flex: 1, background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' } as const
const tileLabel = { fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-subtle)', fontWeight: 700, fontFamily: 'var(--font-heading)', marginBottom: 4 } as const

/** An editable meta tile rendered as an inline <select> that blends into the tile. */
function SelectTile({ k, value, options, onChange, mono }: { k: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <div style={tileWrap}>
      <div style={tileLabel}>{k}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          marginLeft: -2,
          padding: '0 18px 0 2px',
          border: 'none',
          background: 'transparent',
          fontSize: 13.5,
          fontWeight: 600,
          color: 'var(--text-strong)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function PlanDetail({ card }: { card: Card }) {
  const apps = useStore((s) => s.apps)
  const editCard = useStore((s) => s.editCard)
  const editPrompt = useStore((s) => s.editPrompt)
  const startCard = useStore((s) => s.startCard)
  const raceCard = useStore((s) => s.raceCard)
  const closeCard = useStore((s) => s.closeCard)
  const deleteCard = useStore((s) => s.deleteCard)
  const setCardModel = useStore((s) => s.setCardModel)
  const decomposeCard = useStore((s) => s.decomposeCard)
  const decomposing = useStore((s) => s.decomposing.includes(card.id))
  const cancelQueued = useStore((s) => s.cancelQueued)
  const health = useStore((s) => s.health)
  const queue = useStore((s) => s.queue)
  const live = useStore((s) => s.live)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [splitCount, setSplitCount] = useState(0) // 0 = let the agent decide
  const app = apps.find((a) => a.id === card.appId)
  if (!app) return null
  const installedAgents = (health?.agents ?? []).filter((a) => a.installed).length
  const canRace = live && installedAgents >= 2
  // Models available within this repo's agent (live mode only).
  const agentModels = (health?.agents ?? []).find((a) => a.id === (app.agent ?? 'codex'))?.models ?? []
  const showModel = live && agentModels.length > 1

  // Base-branch options: the repo's branches, ensuring the current choice is present.
  const repoBranches = app.branches?.length ? app.branches : [app.base]
  const curBase = card.base || app.base
  const baseOptions = repoBranches.includes(curBase) ? repoBranches : [curBase, ...repoBranches]

  return (
    <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <Overline>Description</Overline>
        <textarea
          value={card.desc}
          onChange={(e) => editCard(card.id, { desc: e.target.value })}
          onFocus={() => {
            if (card.desc === EXAMPLE_DESC) editCard(card.id, { desc: '' })
          }}
          placeholder="What do you want built? A short summary."
          rows={2}
          style={{
            width: '100%',
            margin: '7px 0 0',
            minHeight: 52,
            resize: 'vertical',
            padding: '8px 10px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            lineHeight: 1.55,
            color: card.desc === EXAMPLE_DESC ? 'var(--text-subtle)' : 'var(--text-body)',
            background: 'var(--neutral-50)',
            outline: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <SelectTile
          k="Type"
          value={card.type}
          onChange={(v) => editCard(card.id, { type: v as Card['type'] })}
          options={(['feature', 'bug', 'enhancement'] as const).map((t) => ({ value: t, label: TYPE[t].label }))}
        />
        <SelectTile
          k="Priority"
          value={card.priority}
          onChange={(v) => editCard(card.id, { priority: v as Card['priority'] })}
          options={(['high', 'med', 'low'] as const).map((p) => ({ value: p, label: PRI[p].label }))}
        />
        <SelectTile k="Base" mono value={card.base || app.base} onChange={(v) => editCard(card.id, { base: v })} options={baseOptions.map((b) => ({ value: b, label: b }))} />
      </div>

      {showModel && (
        <div style={{ display: 'flex', gap: 10 }}>
          <SelectTile
            k={`Model · ${agentLabel(app.agent)}`}
            value={card.model ?? ''}
            onChange={(v) => setCardModel(card.id, v)}
            options={agentModels.map((m) => ({ value: m.id, label: m.label }))}
          />
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Overline>Agent instructions</Overline>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 19,
              padding: '0 8px',
              borderRadius: 'var(--radius-pill)',
              background: '#FFFBC2',
              color: '#5C5400',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Sent to {agentLabel(app.agent)}
          </span>
        </div>
        <p style={{ margin: '4px 0 8px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          This exact prompt is what {agentLabel(app.agent)} receives. Edit it before you dispatch.
        </p>
        <textarea
          value={card.prompt ?? ''}
          onChange={(e) => editPrompt(card.id, e.target.value)}
          onFocus={() => {
            if ((card.prompt ?? '') === EXAMPLE_PROMPT) editPrompt(card.id, '')
          }}
          style={{
            width: '100%',
            minHeight: 188,
            resize: 'vertical',
            padding: '13px 14px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            lineHeight: 1.65,
            color: (card.prompt ?? '') === EXAMPLE_PROMPT ? 'var(--text-subtle)' : 'var(--text-strong)',
            background: 'var(--neutral-50)',
            outline: 'none',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 13px',
          borderRadius: 'var(--radius-sm)',
          background: app.cloned ? 'var(--status-success-surface)' : 'var(--status-warning-surface)',
          borderLeft: `3px solid ${app.cloned ? 'var(--status-success)' : 'var(--status-warning)'}`,
        }}
      >
        <span style={{ fontSize: 14, color: app.cloned ? 'var(--status-success)' : 'var(--status-warning)' }}>{app.cloned ? '✓' : '⚠'}</span>
        <span style={{ fontSize: 13, color: 'var(--text-body)' }}>
          {app.cloned ? (
            <>
              Repo ready — <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{`${app.repo} @ ${app.base}`}</span>
            </>
          ) : (
            <>
              Repo not cloned — we’ll clone <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{app.repo}</span> first.
            </>
          )}
        </span>
      </div>

      {card.queued && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 13px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--status-warning-surface, #FFF4E0)',
            borderLeft: '3px solid var(--status-warning, #9A6700)',
          }}
        >
          <span style={{ fontSize: 14 }}>⏳</span>
          <span style={{ fontSize: 13, color: 'var(--text-body)', flex: 1 }}>
            Queued — waiting for a free build slot (cap is {queue.concurrency}).
          </span>
          <Button variant="secondary" onClick={() => cancelQueued(card.id)} style={{ height: 32 }}>
            Cancel
          </Button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
        {card.status === 'ideas' ? (
          <>
            <Button variant="primary" onClick={closeCard}>
              Save
            </Button>
            {live && (
              <>
                <Button variant="secondary" onClick={() => decomposeCard(card.id, splitCount || undefined)} disabled={decomposing} style={{ color: 'var(--color-purple-dark)' }}>
                  {decomposing ? (
                    <>
                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--neutral-200)', borderTopColor: 'var(--color-purple-dark)', animation: 'dpspin .7s linear infinite' }} />
                      Splitting…
                    </>
                  ) : (
                    '✂ Split into cards'
                  )}
                </Button>
                <select
                  value={splitCount}
                  onChange={(e) => setSplitCount(Number(e.target.value))}
                  disabled={decomposing}
                  title="How many cards to split into"
                  style={{ height: 40, padding: '0 8px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--text-body)', cursor: 'pointer' }}
                >
                  <option value={0}>Auto</option>
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} cards
                    </option>
                  ))}
                </select>
              </>
            )}
          </>
        ) : card.queued ? null : (
          <Button variant="highlighter" onClick={() => startCard(card.id)}>
            {app.planFirst ? 'Plan & build →' : 'Start build →'}
          </Button>
        )}
        {card.status !== 'ideas' && !card.queued && canRace && (
          <Button variant="secondary" onClick={() => raceCard(card.id)} style={{ color: 'var(--color-purple-dark)' }}>
            ⚔ Race agents
          </Button>
        )}
        <Button variant="secondary" onClick={closeCard}>
          Close
        </Button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => {
            if (confirmDelete) deleteCard(card.id)
            else {
              setConfirmDelete(true)
              setTimeout(() => setConfirmDelete(false), 3000)
            }
          }}
          title="Delete this card"
          style={{
            height: 40,
            padding: '0 14px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${confirmDelete ? 'var(--status-danger)' : 'var(--border-default)'}`,
            background: confirmDelete ? 'var(--status-danger)' : '#fff',
            color: confirmDelete ? '#fff' : 'var(--status-danger)',
            cursor: 'pointer',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {confirmDelete ? 'Confirm delete' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
