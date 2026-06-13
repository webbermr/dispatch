import { useState } from 'react'
import { PRI } from '../../lib/constants'
import { titleCase } from '../../lib/helpers'
import { useStore } from '../../store/useStore'
import type { Card } from '../../store/types'
import { Button } from '../Button'
import { Overline } from './Overline'

function MetaTile({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ flex: 1, background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'var(--text-subtle)',
          fontWeight: 700,
          fontFamily: 'var(--font-heading)',
          marginBottom: 4,
        }}
      >
        {k}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)' }}>{v}</div>
    </div>
  )
}

export function PlanDetail({ card }: { card: Card }) {
  const apps = useStore((s) => s.apps)
  const editCard = useStore((s) => s.editCard)
  const editPrompt = useStore((s) => s.editPrompt)
  const startCard = useStore((s) => s.startCard)
  const closeCard = useStore((s) => s.closeCard)
  const deleteCard = useStore((s) => s.deleteCard)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const app = apps.find((a) => a.id === card.appId)
  if (!app) return null

  return (
    <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <Overline>Description</Overline>
        <textarea
          value={card.desc}
          onChange={(e) => editCard(card.id, { desc: e.target.value })}
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
            color: 'var(--text-body)',
            background: 'var(--neutral-50)',
            outline: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <MetaTile k="Type" v={titleCase(card.type)} />
        <MetaTile k="Priority" v={PRI[card.priority].label} />
        <MetaTile k="Base" v={app.base} mono />
      </div>

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
            Sent to Codex
          </span>
        </div>
        <p style={{ margin: '4px 0 8px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          This exact prompt is what Codex receives. Edit it before you dispatch.
        </p>
        <textarea
          value={card.prompt ?? ''}
          onChange={(e) => editPrompt(card.id, e.target.value)}
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
            color: 'var(--text-strong)',
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
        <Button variant="highlighter" onClick={() => startCard(card.id)}>
          Start build →
        </Button>
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
