import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Button } from './Button'

const STARTERS = ['What does this repo do?', 'How do I run it locally?', 'Where is the main entry point?', 'What would it take to add a new feature?']

/** Render an answer with light Markdown: fenced code blocks become mono blocks. */
function Answer({ text }: { text: string }) {
  const parts = text.split(/```/)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            style={{ margin: '8px 0', padding: '10px 12px', background: 'var(--color-dark-navy)', color: '#CFE6F5', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre' }}
          >
            {p.replace(/^[\w-]*\n/, '')}
          </pre>
        ) : (
          <span key={i} style={{ whiteSpace: 'pre-wrap' }}>
            {p}
          </span>
        ),
      )}
    </>
  )
}

export function RepoChatDrawer() {
  const open = useStore((s) => s.repoChatOpen)
  const closeRepoChat = useStore((s) => s.closeRepoChat)
  const clearRepoChat = useStore((s) => s.clearRepoChat)
  const appId = useStore((s) => s.appId)
  const appName = useStore((s) => s.apps.find((a) => a.id === appId)?.name)
  const chat = useStore((s) => (appId ? s.repoChats[appId] : undefined))
  const draft = useStore((s) => s.repoChatDraft)
  const setRepoChatDraft = useStore((s) => s.setRepoChatDraft)
  const askRepo = useStore((s) => s.askRepo)
  const createCardFromText = useStore((s) => s.createCardFromText)
  const scrollRef = useRef<HTMLDivElement>(null)

  const messages = chat?.messages ?? []
  const thinking = chat?.thinking ?? false

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [open, messages.length, thinking])

  if (!open) return null

  const send = (text?: string) => {
    if (text !== undefined) setRepoChatDraft(text)
    // Defer so the draft state is set before askRepo reads it.
    setTimeout(() => askRepo(), 0)
  }

  // Title for "Create card" = the question that prompted this answer.
  const titleFor = (i: number) => (messages[i - 1]?.role === 'user' ? messages[i - 1].text : messages[i].text.split('\n')[0])

  return (
    <div onClick={closeRepoChat} style={{ position: 'fixed', inset: 0, background: 'rgba(11,35,56,.5)', zIndex: 1180, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(2px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 94vw)', height: '100%', background: '#fff', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', animation: 'dpslide .2s' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>💬</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--text-strong)' }}>Ask about this repo</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appName} · read-only</div>
          </div>
          <div style={{ flex: 1 }} />
          {messages.length > 0 && (
            <button onClick={clearRepoChat} title="Clear conversation" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
              Clear
            </button>
          )}
          <button onClick={closeRepoChat} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1 }}>
            ×
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          {messages.length === 0 && !thinking && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: '4px 0 6px', fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Ask anything about <strong>{appName}</strong>. The agent reads the actual files to answer — and you can turn any answer into a card.
              </p>
              {STARTERS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  style={{ textAlign: 'left', padding: '9px 12px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--neutral-50)', cursor: 'pointer', fontSize: 13, color: 'var(--text-body)' }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
              <div
                style={{
                  padding: '10px 13px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  background: m.role === 'user' ? 'var(--brand-primary)' : 'var(--neutral-100)',
                  color: m.role === 'user' ? '#fff' : 'var(--text-body)',
                }}
              >
                {m.role === 'user' ? <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span> : <Answer text={m.text} />}
              </div>
              {m.role === 'agent' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    onClick={() => createCardFromText(titleFor(i), m.text, false)}
                    style={{ height: 26, padding: '0 9px', border: '1px solid var(--border-default)', background: '#fff', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 11.5, color: 'var(--brand-primary)' }}
                  >
                    ➕ Create card
                  </button>
                  <button
                    onClick={() => createCardFromText(titleFor(i), m.text, true)}
                    title="Create a card and split it into scoped sub-cards"
                    style={{ height: 26, padding: '0 9px', border: '1px solid var(--border-default)', background: '#fff', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 11.5, color: 'var(--color-purple-dark)' }}
                  >
                    ✂ Split into cards
                  </button>
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12.5 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--neutral-200)', borderTopColor: 'var(--brand-primary)', animation: 'dpspin .7s linear infinite', flex: '0 0 12px' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{chat?.note || 'reading the repo…'}</span>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={draft}
            onChange={(e) => setRepoChatDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!thinking) send()
              }
            }}
            placeholder={thinking ? 'Answering…' : 'Ask about this repo…'}
            rows={1}
            style={{ flex: 1, minHeight: 40, maxHeight: 120, resize: 'none', padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.4, color: 'var(--text-strong)', outline: 'none' }}
          />
          <Button variant="primary" onClick={() => send()} disabled={thinking || !draft.trim()} style={{ height: 40 }}>
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
