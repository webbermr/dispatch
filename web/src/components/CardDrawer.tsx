import { useState } from 'react'
import { STATUS, TYPE } from '../lib/constants'
import { useStore } from '../store/useStore'
import type { Card } from '../store/types'
import { BuildingDetail } from './drawer/BuildingDetail'
import { MergedDetail } from './drawer/MergedDetail'
import { PlanDetail } from './drawer/PlanDetail'
import { ReviewDetail } from './drawer/ReviewDetail'

function DetailBody({ card }: { card: Card }) {
  if (card.status === 'building') return <BuildingDetail card={card} />
  if (card.status === 'review') return <ReviewDetail card={card} />
  if (card.status === 'merged') return <MergedDetail card={card} />
  return <PlanDetail card={card} />
}

const titleStyle = {
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  fontSize: 21,
  lineHeight: 1.2,
  color: 'var(--text-strong)',
} as const

/** The drawer title — editable in-place while the card is still a plan (Ideas/Ready). */
function DrawerTitle({ card }: { card: Card }) {
  const editCard = useStore((s) => s.editCard)
  const [focused, setFocused] = useState(false)
  const editable = card.status === 'ideas' || card.status === 'ready'

  if (!editable) {
    return <h2 style={{ ...titleStyle, margin: 0 }}>{card.title}</h2>
  }
  return (
    <input
      value={card.title}
      onChange={(e) => editCard(card.id, { title: e.target.value })}
      onFocus={(e) => {
        setFocused(true)
        if (card.title === 'Untitled card') e.currentTarget.select()
      }}
      onBlur={() => setFocused(false)}
      aria-label="Card title"
      placeholder="Card title"
      style={{
        ...titleStyle,
        width: '100%',
        margin: 0,
        padding: '1px 2px',
        marginLeft: -2,
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-xs)',
        boxShadow: focused ? '0 0 0 2px rgba(56,196,242,.45)' : 'none',
        outline: 'none',
      }}
    />
  )
}

export function CardDrawer() {
  const openCardId = useStore((s) => s.openCardId)
  const cards = useStore((s) => s.cards)
  const closeCard = useStore((s) => s.closeCard)
  const [closeHover, setCloseHover] = useState(false)

  const card = cards.find((c) => c.id === openCardId)
  if (!card) return null

  const t = TYPE[card.type]
  const st = STATUS[card.status]

  return (
    <div
      onClick={closeCard}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,35,56,.55)',
        zIndex: 1100,
        display: 'flex',
        justifyContent: 'flex-end',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(580px, 100%)', height: '100%', background: '#fff', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column' }}
      >
        <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: 12, flex: '0 0 auto' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
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
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 20,
                  padding: '0 9px',
                  borderRadius: 'var(--radius-pill)',
                  background: st.bg,
                  color: st.fg,
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: 10.5,
                  letterSpacing: '.05em',
                  textTransform: 'uppercase',
                }}
              >
                {st.label}
              </span>
            </div>
            <DrawerTitle card={card} />
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={closeCard}
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            style={{
              width: 32,
              height: 32,
              flex: '0 0 32px',
              border: '1px solid var(--border-default)',
              background: closeHover ? 'var(--neutral-50)' : '#fff',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              color: closeHover ? 'var(--text-strong)' : 'var(--text-muted)',
              fontSize: 17,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <DetailBody card={card} />
        </div>
      </div>
    </div>
  )
}
