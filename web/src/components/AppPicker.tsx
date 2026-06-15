import { useState, type ReactNode } from 'react'
import { initials } from '../lib/helpers'
import { useStore } from '../store/useStore'
import type { App } from '../store/types'
import { ClonePill } from './ClonePill'

export function AppPicker() {
  const apps = useStore((s) => s.apps)
  const cards = useStore((s) => s.cards)
  const openApp = useStore((s) => s.openApp)
  const openAddApp = useStore((s) => s.openAddApp)
  const openBuilder = useStore((s) => s.openBuilder)
  const openConnect = useStore((s) => s.openConnect)
  const live = useStore((s) => s.live)

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
        {apps.length === 0
          ? 'Welcome to Dispatch. Connect your machine and add a repo to start shipping features with your coding agent.'
          : 'Open a board to see its cards. Anything you start gets handed straight to your agent on the cloned repo.'}
      </p>
      {apps.length === 0 ? (
        <Onboarding live={live} onConnect={openConnect} onAddRepo={openAddApp} onCreateAi={openBuilder} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
          {apps.map((app) => {
            const appCards = cards.filter((c) => c.appId === app.id)
            const building = appCards.filter((c) => c.status === 'building').length
            return <AppCard key={app.id} app={app} count={appCards.length} building={building} onOpen={() => openApp(app.id)} />
          })}
          <CreateWithAiTile onClick={openBuilder} />
          <AddAppTile onClick={openAddApp} />
        </div>
      )}
    </main>
  )
}

function Onboarding({ live, onConnect, onAddRepo, onCreateAi }: { live: boolean; onConnect: () => void; onAddRepo: () => void; onCreateAi: () => void }) {
  return (
    <div style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <OnboardStep
        n={1}
        done={live}
        active={!live}
        title="Connect your machine"
        body="Dispatch drives your coding agent (Codex or Claude Code) on repos cloned to your own machine. A tiny local agent does the work — nothing runs in the cloud."
      >
        {live ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, color: 'var(--status-success)', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--status-success)' }} /> Connected
          </span>
        ) : (
          <>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              In a terminal, run the one-line command Dispatch gives you, then pair:
            </p>
            <code style={{ display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-strong)', background: 'var(--neutral-100)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', padding: '5px 9px', marginBottom: 12 }}>
              npx @dispatch/agent --pair …
            </code>
            <div>
              <button onClick={onConnect} style={primaryBtn}>Connect machine →</button>
            </div>
          </>
        )}
      </OnboardStep>

      <OnboardStep
        n={2}
        done={false}
        active={live}
        title="Add your first repo"
        body="Point Dispatch at a repo that's already on your machine, clone one from a URL, or let AI interview you and scaffold a brand-new app."
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', opacity: live ? 1 : 0.5, pointerEvents: live ? 'auto' : 'none' }}>
          <button onClick={onAddRepo} style={primaryBtn}>+ Add a repo</button>
          <button onClick={onCreateAi} style={secondaryBtn}>✨ Create app with AI</button>
        </div>
        {!live && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--text-subtle)' }}>Connect your machine first.</p>}
      </OnboardStep>
    </div>
  )
}

const primaryBtn = {
  height: 38,
  padding: '0 16px',
  border: '1px solid var(--brand-primary)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--brand-primary)',
  color: '#fff',
  cursor: 'pointer',
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  fontSize: 13.5,
} as const

const secondaryBtn = { ...primaryBtn, background: '#fff', color: 'var(--brand-primary)' } as const

function OnboardStep({ n, done, active, title, body, children }: { n: number; done: boolean; active: boolean; title: string; body: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        padding: 18,
        background: '#fff',
        border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-xs)',
        opacity: !active && !done ? 0.85 : 1,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          flex: '0 0 30px',
          borderRadius: '50%',
          background: done ? 'var(--status-success)' : active ? 'var(--brand-primary)' : 'var(--neutral-200)',
          color: done || active ? '#fff' : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {done ? '✓' : n}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--text-strong)', marginBottom: 4 }}>{title}</div>
        <p style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>{body}</p>
        {children}
      </div>
    </div>
  )
}

function CreateWithAiTile({ onClick }: { onClick: () => void }) {
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
        textAlign: 'center',
        background: hover ? 'var(--brand-primary)' : 'var(--brand-primary-surface, #E1EEF6)',
        border: `1px solid ${hover ? 'var(--brand-primary)' : 'transparent'}`,
        borderRadius: 'var(--radius-md)',
        color: hover ? '#fff' : 'var(--brand-primary)',
        transition: 'background var(--duration-base), color var(--duration-base)',
      }}
    >
      <span style={{ fontSize: 24, lineHeight: 1 }}>✨</span>
      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Create app with AI</span>
      <span style={{ fontSize: 12, lineHeight: 1.4, opacity: 0.85, maxWidth: 200 }}>Answer a few questions; get a repo + first-iteration cards.</span>
    </button>
  )
}

/** A pill marking whether a repo is git-host backed (Remote) or local-only. */
export function RepoModePill({ mode }: { mode?: 'local' | 'remote' }) {
  const remote = mode !== 'local' // default unknown → remote
  const bg = remote ? 'var(--brand-primary-surface, #E1EEF6)' : 'var(--neutral-100)'
  const fg = remote ? 'var(--brand-primary)' : 'var(--text-muted)'
  return (
    <span
      title={remote ? 'Remote — backed by a git host; builds open PRs' : 'Local-only — builds merge locally'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 24,
        padding: '0 10px',
        borderRadius: 'var(--radius-pill)',
        background: bg,
        color: fg,
        fontFamily: 'var(--font-heading)',
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
      }}
    >
      {remote ? '🌐 Remote' : '💻 Local'}
    </span>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
        <RepoModePill mode={app.repoMode} />
        <ClonePill cloned={app.cloned} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
          {count} cards{building ? ` · ${building} building` : ''}
        </span>
      </div>
    </div>
  )
}
