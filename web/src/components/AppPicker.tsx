import { useState } from 'react'
import { initials } from '../lib/helpers'
import { useStore } from '../store/useStore'
import type { App } from '../store/types'
import { ClonePill } from './ClonePill'

export function AppPicker() {
  const apps = useStore((s) => s.apps)
  const cards = useStore((s) => s.cards)
  const openApp = useStore((s) => s.openApp)
  const openAddApp = useStore((s) => s.openAddApp)

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', width: '100%', padding: '52px 32px 72px' }}>
      <div
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--brand-primary)',
          marginBottom: 10,
        }}
      >
        Workspace
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 46, lineHeight: 1.02, margin: '0 0 10px', color: 'var(--text-strong)' }}>
        Your apps
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text-muted)', margin: '0 0 36px', maxWidth: 540 }}>
        Open a board to see its cards. Anything you start gets handed straight to Codex on the cloned repo.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
        {apps.map((app) => {
          const appCards = cards.filter((c) => c.appId === app.id)
          const building = appCards.filter((c) => c.status === 'building').length
          return (
            <AppCard
              key={app.id}
              app={app}
              count={appCards.length}
              building={building}
              onOpen={() => openApp(app.id)}
            />
          )
        })}
        <AddAppTile onClick={openAddApp} />
      </div>
    </main>
  )
}

function AddAppTile({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 150,
        padding: 18,
        cursor: 'pointer',
        background: hover ? 'var(--neutral-50)' : 'transparent',
        border: `1px dashed ${hover ? 'var(--brand-primary)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        color: hover ? 'var(--brand-primary)' : 'var(--text-muted)',
        transition: 'background var(--duration-base), border-color var(--duration-base), color var(--duration-base)',
      }}
    >
      <span style={{ fontSize: 26, lineHeight: 1, fontWeight: 300 }}>+</span>
      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>Add a repo</span>
    </button>
  )
}

function AppCard({ app, count, building, onOpen }: { app: App; count: number; building: number; onOpen: () => void }) {
  const [hover, setHover] = useState(false)
  const [armed, setArmed] = useState(false)
  const removeApp = useStore((s) => s.removeApp)
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setArmed(false)
      }}
      style={{
        position: 'relative',
        background: '#fff',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 18,
        cursor: 'pointer',
        boxShadow: hover ? 'var(--shadow-lg)' : 'var(--shadow-xs)',
        transform: hover ? 'translateY(-3px)' : 'none',
        transition: 'box-shadow var(--duration-base) var(--ease-standard), transform var(--duration-base) var(--ease-standard)',
      }}
    >
      {(hover || armed) && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (armed) removeApp(app.id)
            else {
              setArmed(true)
              setTimeout(() => setArmed(false), 2500)
            }
          }}
          title={armed ? 'Click again to remove' : 'Remove repo'}
          aria-label="Remove repo"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            height: armed ? 22 : 20,
            padding: armed ? '0 8px' : 0,
            width: armed ? 'auto' : 20,
            border: 'none',
            borderRadius: armed ? 'var(--radius-pill)' : 'var(--radius-xs)',
            background: armed ? 'var(--status-danger)' : 'transparent',
            color: armed ? '#fff' : 'var(--text-subtle)',
            cursor: 'pointer',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: armed ? 11 : 15,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {armed ? 'Remove' : '×'}
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
        <div
          style={{
            width: 44,
            height: 44,
            flex: '0 0 44px',
            borderRadius: 'var(--radius-sm)',
            background: app.accent,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 19,
          }}
        >
          {initials(app.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, color: 'var(--text-strong)', lineHeight: 1.2 }}>
            {app.name}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {app.repo}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{app.stack}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
        <ClonePill cloned={app.cloned} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
          {count} cards{building ? ` · ${building} building` : ''}
        </span>
      </div>
    </div>
  )
}
