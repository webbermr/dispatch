import { useEffect, useRef, useState } from 'react'
import { agent, type BuilderPlan } from '../lib/agentClient'
import { TYPE } from '../lib/constants'
import { useStore } from '../store/useStore'
import { Button } from './Button'

type Phase = 'interview' | 'plan' | 'repo'
type RepoKind = 'local' | 'remote'
type RemoteKind = 'new' | 'clone'

const input = {
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

const label = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: 6, display: 'block' } as const

function seg(active: boolean) {
  return {
    flex: 1,
    height: 40,
    border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
    borderRadius: 'var(--radius-sm)',
    background: active ? 'var(--brand-primary)' : '#fff',
    color: active ? '#fff' : 'var(--text-body)',
    cursor: 'pointer',
    fontFamily: 'var(--font-heading)',
    fontWeight: 700,
    fontSize: 13,
  } as const
}

export function CreateAppWizard() {
  const open = useStore((s) => s.builderOpen)
  const closeBuilder = useStore((s) => s.closeBuilder)
  const createAppFromPlan = useStore((s) => s.createAppFromPlan)

  const [phase, setPhase] = useState<Phase>('interview')
  const [builderId, setBuilderId] = useState<string | null>(null)
  const [messages, setMessages] = useState<{ role: 'agent' | 'user'; text: string }[]>([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<BuilderPlan | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [repoKind, setRepoKind] = useState<RepoKind>('local')
  const [remoteKind, setRemoteKind] = useState<RemoteKind>('new')
  const [parentDir, setParentDir] = useState('~/code')
  const [repoUrl, setRepoUrl] = useState('')
  const [priv, setPriv] = useState(true)
  const [creating, setCreating] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  // Start the interview when the wizard opens.
  useEffect(() => {
    if (!open) {
      startedRef.current = false
      return
    }
    if (startedRef.current) return
    startedRef.current = true
    setPhase('interview')
    setMessages([])
    setPlan(null)
    setDraft('')
    setError(null)
    setThinking(true)
    agent
      .builderStart()
      .then((r) => {
        setBuilderId(r.id)
        setMessages([{ role: 'agent', text: r.message }])
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setThinking(false))
  }, [open])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, thinking])

  if (!open) return null

  const send = () => {
    const text = draft.trim()
    if (!text || !builderId || thinking) return
    setDraft('')
    setMessages((m) => [...m, { role: 'user', text }])
    setThinking(true)
    setError(null)
    agent
      .builderMessage(builderId, text)
      .then((r) => setMessages((m) => [...m, { role: 'agent', text: r.message }]))
      .catch((e) => setError((e as Error).message))
      .finally(() => setThinking(false))
  }

  const generatePlan = () => {
    if (!builderId || thinking) return
    setThinking(true)
    setError(null)
    agent
      .builderPlan(builderId)
      .then((p) => {
        setPlan(p)
        setName(p.name)
        setSlug(p.repoSlug)
        setPhase('plan')
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setThinking(false))
  }

  const create = async () => {
    if (!plan) return
    setCreating(true)
    setError(null)
    const choice = { mode: (repoKind === 'local' ? 'local' : remoteKind === 'new' ? 'new-remote' : 'clone') as 'local' | 'new-remote' | 'clone', parentDir, name, slug, private: priv, repoUrl }
    const ok = await createAppFromPlan({ ...plan, name }, choice)
    setCreating(false)
    if (!ok) setError('Could not create the repo — check the details and try again.')
  }

  const canGenerate = messages.some((m) => m.role === 'user')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,35,56,.6)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 620, maxHeight: '88vh', background: '#fff', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'dpfade .2s', borderTop: '4px solid var(--brand-primary)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, color: 'var(--text-strong)' }}>Create an app with AI</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{phase === 'interview' ? 'Answer a few questions to define the first iteration' : phase === 'plan' ? 'Review the plan' : 'Choose where the repo lives'}</div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={closeBuilder} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
        </div>

        {error && <div style={{ padding: '10px 22px', background: 'var(--status-danger-surface)', color: 'var(--status-danger)', fontSize: 13 }}>{error}</div>}

        {phase === 'interview' && (
          <>
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 200 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '10px 13px', borderRadius: 'var(--radius-md)', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', background: m.role === 'user' ? 'var(--brand-primary)' : 'var(--neutral-100)', color: m.role === 'user' ? '#fff' : 'var(--text-body)' }}>
                  {m.text}
                </div>
              ))}
              {thinking && (
                <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12.5 }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--neutral-200)', borderTopColor: 'var(--brand-primary)', animation: 'dpspin .7s linear infinite' }} />
                  thinking…
                </div>
              )}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={thinking ? 'Thinking…' : 'Type your answer…'}
                rows={1}
                style={{ flex: 1, minHeight: 40, maxHeight: 120, resize: 'none', padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.4, color: 'var(--text-strong)', outline: 'none' }}
              />
              <Button variant="secondary" onClick={send} disabled={thinking || !draft.trim()} style={{ height: 40 }}>Send</Button>
              <Button variant="primary" onClick={generatePlan} disabled={thinking || !canGenerate} style={{ height: 40 }}>Generate plan →</Button>
            </div>
          </>
        )}

        {phase === 'plan' && plan && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
              <label style={label}>App name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={input} />
              <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-body)', margin: '14px 0 16px' }}>{plan.summary}</p>
              <label style={label}>First iteration · {plan.cards.length} cards</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plan.cards.map((c, i) => (
                  <details key={i} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--neutral-50)', padding: '9px 12px' }}>
                    <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none' }}>
                      <span style={{ display: 'inline-flex', height: 18, padding: '0 7px', borderRadius: 'var(--radius-xs)', background: TYPE[c.type].bg, color: TYPE[c.type].fg, fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 9.5, letterSpacing: '.05em', textTransform: 'uppercase', alignItems: 'center' }}>{TYPE[c.type].label}</span>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{c.title}</span>
                    </summary>
                    <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.55, color: 'var(--text-body)' }}>{c.prompt}</pre>
                  </details>
                ))}
              </div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', background: 'var(--neutral-50)', display: 'flex', gap: 10 }}>
              <Button variant="secondary" onClick={() => setPhase('interview')} style={{ height: 38 }}>← Keep refining</Button>
              <div style={{ flex: 1 }} />
              <Button variant="primary" onClick={() => setPhase('repo')} disabled={!name.trim()} style={{ height: 38 }}>Create app →</Button>
            </div>
          </>
        )}

        {phase === 'repo' && plan && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={label}>Repo type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setRepoKind('local')} style={seg(repoKind === 'local')}>💻 Local</button>
                  <button onClick={() => setRepoKind('remote')} style={seg(repoKind === 'remote')}>🌐 Remote</button>
                </div>
              </div>

              {repoKind === 'remote' && (
                <div>
                  <label style={label}>Remote</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setRemoteKind('new')} style={seg(remoteKind === 'new')}>Create new (GitHub)</button>
                    <button onClick={() => setRemoteKind('clone')} style={seg(remoteKind === 'clone')}>Clone existing</button>
                  </div>
                </div>
              )}

              {repoKind === 'remote' && remoteKind === 'clone' ? (
                <div>
                  <label style={label}>Repo URL to clone</label>
                  <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/name" style={{ ...input, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} />
                </div>
              ) : (
                <div>
                  <label style={label}>Folder name</label>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-app" style={{ ...input, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} />
                </div>
              )}

              <div>
                <label style={label}>Create in (folder)</label>
                <input value={parentDir} onChange={(e) => setParentDir(e.target.value)} placeholder="~/code" style={{ ...input, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} />
                {repoKind !== 'remote' || remoteKind === 'new' ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>→ {parentDir.replace(/\/$/, '')}/{slug || 'app'}</div>
                ) : null}
              </div>

              {repoKind === 'remote' && remoteKind === 'new' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-body)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
                  Private repository
                </label>
              )}

              <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', margin: 0, lineHeight: 1.5 }}>
                Dispatch will create the repo and add the {plan.cards.length} cards above so you can start building right away.
              </p>
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', background: 'var(--neutral-50)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <Button variant="secondary" onClick={() => setPhase('plan')} disabled={creating} style={{ height: 38 }}>← Back</Button>
              <div style={{ flex: 1 }} />
              <Button variant="primary" onClick={create} disabled={creating || !parentDir.trim() || (repoKind === 'remote' && remoteKind === 'clone' && !repoUrl.trim())} style={{ height: 38 }}>
                {creating ? 'Creating…' : 'Create app & cards'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
