import { useEffect, useState } from 'react'
import { server, type SRepo, type SUser, type SWorkspace } from '../lib/serverClient'
import { RepoModePill } from '../components/AppPicker'
import { useStore } from '../store/useStore'

const input = { height: 36, padding: '0 11px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, background: '#fff', outline: 'none' } as const
const btn = { height: 36, padding: '0 14px', border: '1px solid var(--brand-primary)', borderRadius: 'var(--radius-sm)', background: 'var(--brand-primary)', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13.5 } as const
const btnGhost = { ...btn, background: '#fff', color: 'var(--brand-primary)' } as const

export function TeamApp() {
  const openTeamRepo = useStore((s) => s.openTeamRepo)
  const [user, setUser] = useState<SUser | null>(null)
  const [ws, setWs] = useState<SWorkspace[]>([])
  const [activeWs, setActiveWs] = useState<SWorkspace | null>(null)
  const [repos, setRepos] = useState<SRepo[]>([])
  const [error, setError] = useState<string | null>(null)

  // Resume an existing session.
  useEffect(() => {
    if (!server.token) return
    server
      .me()
      .then((r) => setUser(r.user))
      .catch(() => server.setToken(null))
  }, [])

  useEffect(() => {
    if (user) server.listWorkspaces().then((r) => setWs(r.workspaces)).catch((e) => setError((e as Error).message))
  }, [user])

  const openWorkspace = (w: SWorkspace) => {
    setActiveWs(w)
    server.listRepos(w.id).then((r) => setRepos(r.repos)).catch((e) => setError((e as Error).message))
  }

  if (!user) return <Login onAuthed={setUser} />

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 22px', borderBottom: '1px solid var(--border-subtle)', background: '#fff' }}>
        <button onClick={() => setActiveWs(null)} style={crumb(!activeWs)}>Workspaces</button>
        {activeWs && (<><span style={{ color: 'var(--text-subtle)' }}>›</span><span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>{activeWs.name}</span></>)}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user.name}</span>
        <button onClick={() => { server.logout().catch(() => {}); setUser(null); setWs([]); setActiveWs(null) }} style={{ ...btnGhost, height: 30 }}>Sign out</button>
      </header>

      {error && <div style={{ padding: '8px 22px', background: 'var(--status-danger-surface)', color: 'var(--status-danger)', fontSize: 13 }}>{error}</div>}

      <main style={{ flex: 1, padding: 22, minHeight: 0 }}>
        {!activeWs ? (
          <Workspaces ws={ws} onOpen={openWorkspace} onCreate={(w) => { setWs((p) => [...p, w]); openWorkspace(w) }} setError={setError} />
        ) : (
          <Repos workspace={activeWs} repos={repos} onOpen={(r) => openTeamRepo(r)} onCreate={(r) => { setRepos((p) => [...p, r]); openTeamRepo(r) }} setError={setError} />
        )}
      </main>
    </div>
  )
}

const crumb = (active: boolean) => ({ background: 'none', border: 'none', color: active ? 'var(--text-strong)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: active ? 700 : 600, fontSize: 14, padding: 0 } as const)

function Login({ onAuthed }: { onAuthed: (u: SUser) => void }) {
  const [url, setUrl] = useState(server.baseUrl)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const signIn = () => {
    if (!email.trim()) return
    server.setBaseUrl(url)
    setBusy(true)
    setErr(null)
    server.devLogin(email.trim(), name.trim() || email.split('@')[0]).then(onAuthed).catch((e) => setErr((e as Error).message)).finally(() => setBusy(false))
  }
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 4px', color: 'var(--text-strong)' }}>Dispatch · Team</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>Sign in to your shared board (dev login).</p>
        <label style={lbl}>Server URL</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} style={{ ...input, width: '100%', marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} />
        <label style={lbl}>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && signIn()} placeholder="you@team.dev" style={{ ...input, width: '100%', marginBottom: 12 }} />
        <label style={lbl}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && signIn()} placeholder="Your name" style={{ ...input, width: '100%', marginBottom: 16 }} />
        {err && <div style={{ color: 'var(--status-danger)', fontSize: 12.5, marginBottom: 12 }}>{err}</div>}
        <button onClick={signIn} disabled={busy || !email.trim()} style={{ ...btn, width: '100%', opacity: busy || !email.trim() ? 0.6 : 1 }}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </div>
    </div>
  )
}

const lbl = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-subtle)', display: 'block', marginBottom: 5 } as const

function Workspaces({ ws, onOpen, onCreate, setError }: { ws: SWorkspace[]; onOpen: (w: SWorkspace) => void; onCreate: (w: SWorkspace) => void; setError: (s: string) => void }) {
  const [name, setName] = useState('')
  const create = () => name.trim() && server.createWorkspace(name.trim()).then((w) => { setName(''); onCreate(w) }).catch((e) => setError((e as Error).message))
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-strong)' }}>Workspaces</h1>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0 20px' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="New workspace name" style={{ ...input, flex: 1 }} />
        <button onClick={create} style={btn}>+ Create</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 12 }}>
        {ws.map((w) => (
          <button key={w.id} onClick={() => onOpen(w)} style={{ textAlign: 'left', padding: 16, background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer', boxShadow: 'var(--shadow-xs)' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--text-strong)' }}>{w.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{w.role ?? 'member'}</div>
          </button>
        ))}
        {ws.length === 0 && <div style={{ color: 'var(--text-subtle)', fontSize: 13.5 }}>No workspaces yet — create one to start a shared board.</div>}
      </div>
    </div>
  )
}

function Repos({ workspace, repos, onOpen, onCreate, setError }: { workspace: SWorkspace; repos: SRepo[]; onOpen: (r: SRepo) => void; onCreate: (r: SRepo) => void; setError: (s: string) => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [invite, setInvite] = useState('')
  const create = () => name.trim() && server.createRepo(workspace.id, { name: name.trim(), repoSlug: slug.trim(), repoMode: slug.trim() ? 'remote' : 'local' }).then((r) => { setName(''); setSlug(''); onCreate(r) }).catch((e) => setError((e as Error).message))
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-strong)' }}>{workspace.name} · Repos</h1>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0 10px', flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Repo name" style={{ ...input, flex: 1, minWidth: 160 }} />
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="owner/name (optional)" style={{ ...input, flex: 1, minWidth: 160, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} />
        <button onClick={create} style={btn}>+ Add repo</button>
      </div>
      {workspace.role === 'admin' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="invite teammate by email (builder)" style={{ ...input, flex: 1 }} />
          <button onClick={() => invite.trim() && server.inviteMember(workspace.id, invite.trim(), 'builder').then(() => setInvite('')).catch((e) => setError((e as Error).message))} style={btnGhost}>Invite</button>
        </div>
      )}
      <ConnectMachine workspaceId={workspace.id} setError={setError} />
      <div style={{ height: 18 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 12 }}>
        {repos.map((r) => (
          <button key={r.id} onClick={() => onOpen(r)} style={{ textAlign: 'left', padding: 16, background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer', boxShadow: 'var(--shadow-xs)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--text-strong)' }}>{r.name}</span>
              <RepoModePill mode={r.repoMode} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{r.repoSlug || '(builds on a matching local clone)'}</div>
          </button>
        ))}
        {repos.length === 0 && <div style={{ color: 'var(--text-subtle)', fontSize: 13.5 }}>No repos yet — add one.</div>}
      </div>
    </div>
  )
}

function ConnectMachine({ workspaceId, setError }: { workspaceId: string; setError: (s: string) => void }) {
  const [cmd, setCmd] = useState<string | null>(null)
  const gen = () => server.createRunnerToken(workspaceId).then((r) => setCmd(`dispatch-agent runner --server ${server.baseUrl} --token ${r.token}`)).catch((e) => setError((e as Error).message))
  return (
    <div style={{ background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--text-strong)', marginBottom: 4 }}>🖥 Connect a machine (build runner)</div>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.45 }}>Cards build on your own machine. Run your local agent in runner mode, with the repo cloned, to enable building.</p>
      {cmd ? (
        <code style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 12, background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', padding: '8px 10px', wordBreak: 'break-all', color: 'var(--text-strong)' }}>{cmd}</code>
      ) : (
        <button onClick={gen} style={btnGhost}>Generate runner command</button>
      )}
    </div>
  )
}

