import { diffStats } from '../../lib/helpers'
import { useStore } from '../../store/useStore'
import type { Card, DiffFile, DetailTab } from '../../store/types'
import { Button } from '../Button'

function DiffView({ diff }: { diff: DiffFile[] }) {
  return (
    <div style={{ padding: '4px 0 8px' }}>
      {diff.map((f, i) => (
        <div key={i} style={{ margin: '0 0 14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              background: 'var(--neutral-100)',
              borderTop: '1px solid var(--border-subtle)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-strong)' }}>{f.file}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--status-success)' }}>+{f.add}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--status-danger)' }}>−{f.del}</span>
          </div>
          {f.lines && f.lines.length ? (
            <div>
              {f.lines.map((ln, j) => {
                const bg = ln.t === 'add' ? '#E6F3EA' : ln.t === 'del' ? '#FBE7E8' : '#fff'
                const col = ln.t === 'add' ? '#1c6b39' : ln.t === 'del' ? '#a3232a' : 'var(--text-body)'
                const pre = ln.t === 'add' ? '+' : ln.t === 'del' ? '−' : ' '
                return (
                  <div
                    key={j}
                    style={{ display: 'flex', background: bg, padding: '1px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7, color: col, whiteSpace: 'pre-wrap' }}
                  >
                    <span style={{ opacity: 0.55, width: 12, flex: '0 0 12px', userSelect: 'none' }}>{pre}</span>
                    <span>{ln.text || ' '}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-subtle)' }}>
              Binary / large change — view on GitHub
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ChatView({ card }: { card: Card }) {
  const chatDrafts = useStore((s) => s.chatDrafts)
  const setChatDraft = useStore((s) => s.setChatDraft)
  const sendChat = useStore((s) => s.sendChat)
  const draft = chatDrafts[card.id] || ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        ref={(el) => {
          if (el) el.scrollTop = el.scrollHeight
        }}
        style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 200 }}
      >
        {(card.chat || []).map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%' }}>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: 'var(--text-subtle)',
                marginBottom: 4,
                textAlign: m.role === 'user' ? 'right' : 'left',
                fontFamily: 'var(--font-heading)',
              }}
            >
              {m.role === 'user' ? 'You' : 'Codex'}
            </div>
            <div
              style={{
                padding: '10px 13px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13.5,
                lineHeight: 1.5,
                background: m.role === 'user' ? 'var(--brand-primary)' : 'var(--neutral-100)',
                color: m.role === 'user' ? '#fff' : 'var(--text-body)',
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={draft}
          placeholder="Send follow-up instructions to Codex…"
          onChange={(e) => setChatDraft(card.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendChat(card.id)
            }
          }}
          style={{
            flex: 1,
            minHeight: 40,
            maxHeight: 110,
            resize: 'none',
            padding: '10px 12px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-body)',
            fontSize: 13.5,
            lineHeight: 1.4,
            color: 'var(--text-strong)',
            outline: 'none',
          }}
        />
        <Button variant="primary" onClick={() => sendChat(card.id)}>
          Send
        </Button>
      </div>
    </div>
  )
}

export function ReviewDetail({ card }: { card: Card }) {
  const tab = useStore((s) => s.detailTab)
  const setTab = useStore((s) => s.setTab)
  const approveMerge = useStore((s) => s.approveMerge)
  const requestChanges = useStore((s) => s.requestChanges)
  const stats = diffStats(card.diff || [])

  const tabBtn = (key: DetailTab, label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      style={{
        padding: '12px 16px',
        background: 'none',
        border: 'none',
        borderBottom: `2px solid ${tab === key ? 'var(--brand-primary)' : 'transparent'}`,
        cursor: 'pointer',
        fontFamily: 'var(--font-heading)',
        fontWeight: 700,
        fontSize: 13.5,
        color: tab === key ? 'var(--brand-primary)' : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '12px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--neutral-50)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-muted)' }}>⎇ {card.branch}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--status-success)' }}>+{stats.add}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--status-danger)' }}>−{stats.del}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-muted)' }}>{stats.files} files</span>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '0 18px', borderBottom: '1px solid var(--border-subtle)' }}>
        {tabBtn('diff', 'Diff')}
        {tabBtn('chat', 'Chat')}
      </div>
      <div style={{ flex: 1, overflowY: tab === 'diff' ? 'auto' : 'hidden', minHeight: 0 }}>
        {tab === 'diff' ? <DiffView diff={card.diff || []} /> : <ChatView card={card} />}
      </div>
      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', background: 'var(--neutral-50)', display: 'flex', gap: 10 }}>
        <Button variant="primary" onClick={() => approveMerge(card.id)}>
          Approve &amp; merge
        </Button>
        <Button variant="secondary" onClick={() => requestChanges(card.id)}>
          Request changes
        </Button>
      </div>
    </div>
  )
}
