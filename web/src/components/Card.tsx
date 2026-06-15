import { useEffect, useRef, useState } from 'react'
import { PRI, TYPE } from '../lib/constants'
import { diffStats } from '../lib/helpers'
import { useStore } from '../store/useStore'
import type { Card as CardModel } from '../store/types'

export function Card({ card }: { card: CardModel }) {
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card.title)
  const [armed, setArmed] = useState(false) // delete confirm
  const clickTimer = useRef<ReturnType<typeof setTimeout>>()
  const armTimer = useRef<ReturnType<typeof setTimeout>>()
  const inputRef = useRef<HTMLInputElement>(null)

  const openCard = useStore((s) => s.openCard)
  const setDragging = useStore((s) => s.setDragging)
  const dropOnCard = useStore((s) => s.dropOnCard)
  const draggingId = useStore((s) => s.draggingId)
  const editCard = useStore((s) => s.editCard)
  const deleteCard = useStore((s) => s.deleteCard)
  const [dragOver, setDragOver] = useState(false)
  const [dropPos, setDropPos] = useState<'above' | 'below'>('above')
  const dropPosRef = useRef<'above' | 'below'>('above') // synchronous, read on drop

  const t = TYPE[card.type]
  const p = PRI[card.priority]
  const stats = card.diff ? diffStats(card.diff) : null
  const isBuilding = card.status === 'building'
  const isReview = card.status === 'review'
  const showBranch = !!card.branch && !isBuilding && !isReview
  const editable = card.status === 'ideas' || card.status === 'ready'

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // Clean up timers on unmount.
  useEffect(() => () => {
    clearTimeout(clickTimer.current)
    clearTimeout(armTimer.current)
  }, [])

  const commitRename = () => {
    const next = draft.trim()
    if (next && next !== card.title) editCard(card.id, { title: next })
    setEditing(false)
  }

  const startEditing = () => {
    setDraft(card.title)
    setEditing(true)
  }

  // Title click: single click opens the drawer; double click renames (editable only).
  const onTitleClick = (e: React.MouseEvent) => {
    if (!editable) return // let it bubble to the card → openCard
    e.stopPropagation()
    clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => openCard(card.id), 220)
  }
  const onTitleDoubleClick = (e: React.MouseEvent) => {
    if (!editable) return
    e.stopPropagation()
    clearTimeout(clickTimer.current)
    startEditing()
  }

  const onDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (armed) {
      clearTimeout(armTimer.current)
      deleteCard(card.id)
      return
    }
    setArmed(true)
    armTimer.current = setTimeout(() => setArmed(false), 2500)
  }

  const showDropLine = dragOver && !!draggingId && draggingId !== card.id

  return (
    <article
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/dispatch-card', card.id)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(card.id)
      }}
      onDragEnd={() => {
        setDragging(null)
        setDragOver(false)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        const pos = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
        dropPosRef.current = pos
        setDropPos(pos)
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        // The dragged id travels in the drag payload — timing-independent.
        const draggedId = e.dataTransfer.getData('text/dispatch-card')
        dropOnCard(draggedId, card.id, dropPosRef.current)
      }}
      onClick={() => !editing && openCard(card.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#fff',
        border: '1px solid var(--border-subtle)',
        borderLeft: `3px solid ${t.accent}`,
        borderRadius: 'var(--radius-sm)',
        padding: '12px 13px',
        cursor: 'pointer',
        // A blue line above/below the card marks where the dragged card will land.
        boxShadow: showDropLine
          ? `0 ${dropPos === 'below' ? '3px' : '-3px'} 0 0 var(--brand-primary), var(--shadow-md)`
          : hover
            ? 'var(--shadow-md)'
            : 'var(--shadow-xs)',
        transform: hover && !editing && !showDropLine ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow var(--duration-base) var(--ease-standard), transform var(--duration-base) var(--ease-standard)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 20,
            padding: '0 8px',
            borderRadius: 'var(--radius-xs)',
            background: t.bg,
            color: t.fg,
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: 10.5,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
          }}
        >
          {t.label}
        </span>
        {card.scaffold && (
          <span
            title="Scaffold — builds and merges first; other cards build on top of it"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              height: 20,
              padding: '0 7px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--brand-primary-surface, #E1EEF6)',
              color: 'var(--brand-primary)',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
            }}
          >
            🏗 Scaffold
          </span>
        )}
        {card.blocked && (
          <span
            title="Waiting on the scaffold card to merge first"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              height: 20,
              padding: '0 7px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--neutral-100)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
            }}
          >
            ⏳ Waiting on scaffold
          </span>
        )}
        {card.queued && (
          <span
            title="Queued — waiting for a free build slot"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              height: 20,
              padding: '0 7px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--status-warning-surface, #FFF4E0)',
              color: 'var(--status-warning, #9A6700)',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
            }}
          >
            ⏳ Queued
          </span>
        )}
        {card.model && (
          <span
            title={`Model: ${card.model}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 20,
              padding: '0 7px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--neutral-100)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
            }}
          >
            {card.model}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />
          {p.label}
        </span>
        {editable && (
          <button
            onClick={onDeleteClick}
            title={armed ? 'Click again to delete' : 'Delete card'}
            aria-label="Delete card"
            style={{
              width: 18,
              height: 18,
              flex: '0 0 18px',
              marginLeft: 2,
              marginRight: -2,
              padding: 0,
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              background: armed ? 'var(--status-danger)' : 'transparent',
              color: armed ? '#fff' : 'var(--text-subtle)',
              cursor: 'pointer',
              fontSize: 13,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: hover || armed ? 1 : 0,
              transition: 'opacity var(--duration-fast)',
            }}
          >
            ×
          </button>
        )}
      </div>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitRename()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setEditing(false)
            }
          }}
          onBlur={commitRename}
          style={{
            width: '100%',
            marginBottom: 5,
            padding: '1px 3px',
            marginLeft: -3,
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1.25,
            color: 'var(--text-strong)',
            background: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            boxShadow: '0 0 0 2px rgba(56,196,242,.45)',
            outline: 'none',
          }}
        />
      ) : (
        <div
          onClick={onTitleClick}
          onDoubleClick={onTitleDoubleClick}
          title={editable ? 'Double-click to rename' : undefined}
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1.25,
            color: 'var(--text-strong)',
            marginBottom: 5,
          }}
        >
          {card.title}
        </div>
      )}
      <div
        style={{
          fontSize: 12.5,
          lineHeight: 1.45,
          color: 'var(--text-muted)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {card.desc}
      </div>

      {isBuilding && card.build && (
        <div style={{ marginTop: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{card.build.currentStep}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--text-strong)' }}>
              {card.build.progress}%
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'var(--neutral-200)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${card.build.progress}%`,
                backgroundImage: 'linear-gradient(90deg, var(--color-highlighter) 0%, #FFE94D 100%)',
                backgroundSize: '28px 28px',
                animation: 'dpstripe .8s linear infinite',
                transition: 'width .5s var(--ease-standard)',
              }}
            />
          </div>
        </div>
      )}

      {isReview && stats && (
        <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)' }}>
            +{stats.add} −{stats.del} · {stats.files} files
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, color: 'var(--status-warning)' }}>Review →</span>
        </div>
      )}

      {showBranch && (
        <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-subtle)' }}>
          <span style={{ fontSize: 11 }}>⎇</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{card.branch}</span>
        </div>
      )}
    </article>
  )
}
