import { useCallback, useEffect, useRef, useState } from 'react'
import { server, type SCard, type SRepo, type SRunSummary, type SRun, type SUser, type SWorkspace, type CardStatus } from '../lib/serverClient'

const COLS: { key: CardStatus; title: string }[] = [
  { key: 'ideas', title: 'Ideas' },
  { key: 'ready', title: 'Ready' },
  { key: 'building', title: 'Building' },
  { key: 'review', title: 'Review' },
  { key: 'merged', title: 'Merged' },
]

const input = { height: 36, padding: '0 11px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, background: '#fff', outline: 'none' } as const
const btn = { height: 36, padding: '0 14px', border: '1px solid var(--brand-primary)', borderRadius: 'var(--radius-sm)', background: 'var(--brand-primary)', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13.5 } as const
const btnGhost = { ...btn, background: '#fff', color: 'var(--brand-primary)' } as const

export function TeamApp() {
  const [user, setUser] = useState<SUser | null>(null)
  const [ws, setWs] = useState<SWorkspace[]>([])
  const [activeWs, setActiveWs] = useState<SWorkspace | null>(null)
  const [repos, setRepos] = useState<SRepo[]>([])
  const [activeRepo, setActiveRepo] = useState<SRepo | null>(null)
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
    setActiveRepo(null)
    server.listRepos(w.id).then((r) => setRepos(r.repos)).catch((e) => setError((e as Error).message))
  }

  if (!user) return <Login onAuthed={setUser} />

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--color-dark-navy)', color: '#fff' }}>
        <strong style={{ fontFamily: 'var(--font-heading)' }}>Dispatch · Team</strong>
        <span style={{ opacity: 0.6 }}>›</span>
        <button onClick={() => { setActiveWs(null); setActiveRepo(null) }} style={crumb(!activeWs)}>Workspaces</button>
        {activeWs && (<><span style={{ opacity: 0.6 }}>›</span><button onClick={() => setActiveRepo(null)} style={crumb(!activeRepo)}>{activeWs.name}</button></>)}
        {activeRepo && (<><span style={{ opacity: 0.6 }}>›</span><span style={{ fontWeight: 700 }}>{activeRepo.name}</span></>)}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, opacity: 0.85 }}>{user.name}</span>
        <button onClick={() => { server.logout().catch(() => {}); setUser(null); setWs([]); setActiveWs(null); setActiveRepo(null) }} style={{ ...btnGhost, height: 30, background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>Sign out</button>
      </header>

      {error && <div style={{ padding: '8px 22px', background: 'var(--status-danger-surface)', color: 'var(--status-danger)', fontSize: 13 }}>{error}</div>}

      <main style={{ flex: 1, padding: 22, minHeight: 0 }}>
        {!activeWs ? (
          <Workspaces ws={ws} onOpen={openWorkspace} onCreate={(w) => { setWs((p) => [...p, w]); openWorkspace(w) }} setError={setError} />
        ) : !activeRepo ? (
          <Repos workspace={activeWs} repos={repos} onOpen={setActiveRepo} onCreate={(r) => { setRepos((p) => [...p, r]); setActiveRepo(r) }} setError={setError} />
        ) : (
          <Board repo={activeRepo} setError={setError} />
        )}
      </main>
    </div>
  )
}

const crumb = (active: boolean) => ({ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: active ? 700 : 500, fontSize: 14, opacity: active ? 1 : 0.8, padding: 0 } as const)

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
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
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--text-strong)' }}>{r.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{r.repoSlug || r.repoMode}</div>
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

function Board({ repo, setError }: { repo: SRepo; setError: (s: string) => void }) {
  const [cards, setCards] = useState<SCard[]>([])
  const [runs, setRuns] = useState<Record<string, SRunSummary>>({})
  const [diffs, setDiffs] = useState<Record<string, SRun | 'loading'>>({})
  const [title, setTitle] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  const upsert = useCallback((card: SCard) => setCards((cs) => (cs.some((c) => c.id === card.id) ? cs.map((c) => (c.id === card.id ? card : c)) : [...cs, card])), [])

  useEffect(() => {
    server.listCards(repo.id).then((r) => setCards(r.cards)).catch((e) => setError((e as Error).message))
    const sock = server.openStream(repo.id, (ev) => {
      if (ev.type === 'card.update') upsert(ev.card)
      else if (ev.type === 'card.remove') setCards((cs) => cs.filter((c) => c.id !== ev.cardId))
      else if (ev.type === 'run.update') setRuns((r) => ({ ...r, [ev.run.cardId]: ev.run }))
    })
    wsRef.current = sock
    return () => sock.close()
  }, [repo.id, upsert, setError])

  const build = (card: SCard) => server.dispatch(card.id).catch((e) => setError((e as Error).message))
  const toggleDiff = (card: SCard) => {
    if (diffs[card.id]) return setDiffs((d) => { const n = { ...d }; delete n[card.id]; return n })
    if (!card.runId) return
    setDiffs((d) => ({ ...d, [card.id]: 'loading' }))
    server.getRun(card.runId).then((run) => setDiffs((d) => ({ ...d, [card.id]: run }))).catch((e) => setError((e as Error).message))
  }

  const addCard = () => {
    if (!title.trim()) return
    server.createCard(repo.id, { title: title.trim() }).then((c) => { setTitle(''); upsert(c) }).catch((e) => setError((e as Error).message))
  }
  const move = (card: SCard, status: CardStatus) => {
    upsert({ ...card, status }) // optimistic
    server.patchCard(card.id, { status }).catch((e) => setError((e as Error).message))
  }
  const del = (card: SCard) => {
    setCards((cs) => cs.filter((c) => c.id !== card.id))
    server.deleteCard(card.id).catch((e) => setError((e as Error).message))
  }

  const visible = cards.filter((c) => !c.archived)
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', overflowX: 'auto' }}>
      {COLS.map((col) => {
        const list = visible.filter((c) => c.status === col.key).sort((a, b) => b.order - a.order)
        return (
          <section key={col.key} style={{ width: 260, flex: '0 0 260px', background: 'var(--surface-sunken, #f4f6f8)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 10px' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-strong)' }}>{col.title}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{list.length}</span>
            </div>
            {col.key === 'ideas' && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCard()} placeholder="New card…" style={{ ...input, height: 30, flex: 1, fontSize: 12.5 }} />
                <button onClick={addCard} style={{ ...btn, height: 30, padding: '0 10px' }}>+</button>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.map((c) => {
                const run = runs[c.id]
                const diff = diffs[c.id]
                return (
                  <div key={c.id} style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '9px 10px' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--text-strong)', marginBottom: 6 }}>{c.title}</div>
                    {c.status === 'building' && (
                      <div style={{ height: 5, borderRadius: 99, background: 'var(--neutral-200)', overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ height: '100%', width: `${run?.progress ?? 0}%`, background: 'var(--color-highlighter, #ffd400)', transition: 'width .4s' }} />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {(c.status === 'ideas' || c.status === 'ready') && (
                        <button onClick={() => build(c)} title="Build on your machine" style={{ height: 26, padding: '0 9px', border: '1px solid var(--brand-primary)', background: '#fff', color: 'var(--brand-primary)', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 11.5 }}>▶ Build</button>
                      )}
                      {(c.status === 'review' || c.status === 'merged') && c.runId && (
                        <button onClick={() => toggleDiff(c)} style={{ height: 26, padding: '0 9px', border: '1px solid var(--border-default)', background: '#fff', color: 'var(--text-body)', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 11.5 }}>{diff ? 'Hide diff' : 'View diff'}</button>
                      )}
                      <select value={c.status} onChange={(e) => move(c, e.target.value as CardStatus)} style={{ flex: 1, height: 26, fontSize: 11.5, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xs)', background: '#fff' }}>
                        {COLS.map((x) => (<option key={x.key} value={x.key}>{x.title}</option>))}
                      </select>
                      <button onClick={() => del(c)} title="Delete" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 14 }}>×</button>
                    </div>
                    {diff && diff !== 'loading' && (
                      <div style={{ marginTop: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                        {diff.diff.length === 0 ? (
                          <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>No changes recorded.</div>
                        ) : (
                          diff.diff.map((f, i) => (
                            <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-body)', display: 'flex', gap: 6 }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.file}</span>
                              <span style={{ color: 'var(--status-success)' }}>+{f.add}</span>
                              <span style={{ color: 'var(--status-danger)' }}>−{f.del}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                    {diff === 'loading' && <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-subtle)' }}>Loading diff…</div>}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
