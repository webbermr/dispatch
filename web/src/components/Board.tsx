import { useState } from 'react'
import { COLS } from '../lib/constants'
import { useStore } from '../store/useStore'
import type { CardStatus } from '../store/types'
import { Button } from './Button'
import { Card } from './Card'
import { ClonePill } from './ClonePill'

export function Board() {
  const appId = useStore((s) => s.appId)
  const apps = useStore((s) => s.apps)
  const cards = useStore((s) => s.cards)
  const backToPicker = useStore((s) => s.backToPicker)
  const newCard = useStore((s) => s.newCard)
  const [backHover, setBackHover] = useState(false)

  const app = apps.find((a) => a.id === appId)
  if (!app) return null
  const appCards = cards.filter((c) => c.appId === appId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div
        style={{
          background: '#fff',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '12px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flex: '0 0 auto',
        }}
      >
        <button
          onClick={backToPicker}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          style={{
            width: 34,
            height: 34,
            border: '1px solid var(--border-default)',
            background: backHover ? 'var(--neutral-50)' : '#fff',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            color: 'var(--text-strong)',
            fontSize: 17,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ←
        </button>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, color: 'var(--text-strong)', lineHeight: 1.15 }}>
            {app.name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{app.repo}</div>
        </div>
        <ClonePill cloned={app.cloned} />
        <div style={{ flex: 1 }} />
        {app.mergeStrategy && <MergeModeToggle appId={app.id} />}
        <Button variant="secondary" onClick={newCard} style={{ height: 36, color: 'var(--brand-primary)' }}>
          + New card
        </Button>
      </div>

      <div className="dp-scroll" style={{ overflowX: 'auto', padding: 22, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {COLS.map((col) => {
          const list = appCards.filter((c) => c.status === col.key)
          return <Column key={col.key} colKey={col.key} title={col.title} accent={col.accent} live={!!col.live && list.length > 0} empty={col.empty} cards={list} />
        })}
      </div>
    </div>
  )
}

function MergeModeToggle({ appId }: { appId: string }) {
  const app = useStore((s) => s.apps.find((a) => a.id === appId))
  const health = useStore((s) => s.health)
  const setAppMergeMode = useStore((s) => s.setAppMergeMode)
  if (!app) return null
  const mode = app.mergeStrategy ?? 'merge'
  // Warn if PR mode can't actually open a PR yet.
  const prBlocked = mode === 'pr' && (!app.hasRemote || (health ? !health.ghAuthed : false))
  const warn = mode === 'pr' && !app.hasRemote ? 'no remote' : mode === 'pr' && health && !health.ghAuthed ? 'gh not authed' : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontSize: 11.5, color: 'var(--text-subtle)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
        On approve
      </span>
      <select
        value={mode}
        onChange={(e) => setAppMergeMode(appId, e.target.value as 'pr' | 'merge')}
        title="What 'Approve & merge' does for this repo"
        style={{
          height: 30,
          padding: '0 8px',
          border: `1px solid ${prBlocked ? 'var(--status-warning)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-sm)',
          background: '#fff',
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: 13,
          color: 'var(--text-body)',
          cursor: 'pointer',
        }}
      >
        <option value="pr">Open a PR</option>
        <option value="merge">Merge locally</option>
      </select>
      {warn && (
        <span title={warn === 'no remote' ? 'This repo has no git remote — add one to open PRs.' : "Run 'gh auth login' to open PRs."} style={{ fontSize: 11.5, color: 'var(--status-warning)', whiteSpace: 'nowrap' }}>
          ⚠ {warn}
        </span>
      )}
    </div>
  )
}

interface ColumnProps {
  colKey: CardStatus
  title: string
  accent: string
  live: boolean
  empty: string
  cards: import('../store/types').Card[]
}

function Column({ colKey, title, accent, live, empty, cards }: ColumnProps) {
  const moveCard = useStore((s) => s.moveCard)
  const draggingId = useStore((s) => s.draggingId)

  return (
    <section
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        moveCard(draggingId, colKey)
      }}
      style={{
        width: 304,
        flex: '0 0 304px',
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 154px)',
      }}
    >
      <header
        style={{
          padding: '13px 15px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          borderTop: `3px solid ${accent}`,
          borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '.07em',
            textTransform: 'uppercase',
            color: 'var(--text-strong)',
          }}
        >
          {title}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--neutral-200)',
            color: 'var(--text-muted)',
            fontSize: 11.5,
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
          }}
        >
          {cards.length}
        </span>
        <div style={{ flex: 1 }} />
        {live && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--color-highlighter)',
              boxShadow: '0 0 0 3px rgba(255,246,1,.28)',
              animation: 'dppulse 1.3s var(--ease-standard) infinite',
            }}
          />
        )}
      </header>
      <div style={{ padding: '0 11px 12px', display: 'flex', flexDirection: 'column', gap: 11, overflowY: 'auto' }}>
        {cards.map((c) => (
          <Card key={c.id} card={c} />
        ))}
        {cards.length === 0 && (
          <div
            style={{
              padding: '18px 12px',
              textAlign: 'center',
              fontSize: 12.5,
              color: 'var(--text-subtle)',
              border: '1px dashed var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,.4)',
            }}
          >
            {empty}
          </div>
        )}
      </div>
    </section>
  )
}
