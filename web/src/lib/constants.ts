import type { CardStatus, CardType, Priority } from '../store/types'

export interface TypeStyle {
  label: string
  accent: string
  bg: string
  fg: string
}

export const TYPE: Record<CardType, TypeStyle> = {
  feature: { label: 'Feature', accent: 'var(--brand-primary)', bg: '#E1EEF6', fg: 'var(--brand-primary)' },
  bug: { label: 'Bug', accent: 'var(--status-danger)', bg: 'var(--status-danger-surface)', fg: 'var(--status-danger)' },
  enhancement: { label: 'Enhancement', accent: 'var(--color-purple-dark)', bg: '#EFEAF6', fg: 'var(--color-purple-dark)' },
}

export interface PriorityStyle {
  label: string
  color: string
}

export const PRI: Record<Priority, PriorityStyle> = {
  high: { label: 'High', color: 'var(--status-danger)' },
  med: { label: 'Medium', color: 'var(--status-warning)' },
  low: { label: 'Low', color: 'var(--neutral-500)' },
}

export interface StatusStyle {
  label: string
  bg: string
  fg: string
}

export const STATUS: Record<CardStatus, StatusStyle> = {
  ideas: { label: 'Idea', bg: 'var(--neutral-100)', fg: 'var(--text-muted)' },
  ready: { label: 'Ready', bg: '#E1EEF6', fg: 'var(--brand-primary)' },
  building: { label: 'Building', bg: '#FFFBC2', fg: '#5C5400' },
  review: { label: 'Needs Review', bg: 'var(--status-warning-surface)', fg: 'var(--status-warning)' },
  merged: { label: 'Merged', bg: 'var(--status-success-surface)', fg: 'var(--status-success)' },
}

export interface ColumnDef {
  key: CardStatus
  title: string
  accent: string
  live?: boolean
  empty: string
}

export const COLS: ColumnDef[] = [
  { key: 'ideas', title: 'Ideas', accent: 'var(--neutral-400)', empty: 'Drop ideas here.' },
  { key: 'ready', title: 'Ready', accent: 'var(--brand-primary)', empty: 'Nothing queued.' },
  { key: 'building', title: 'Building', accent: 'var(--color-highlighter)', live: true, empty: 'No agents running.' },
  { key: 'review', title: 'Needs Review', accent: 'var(--status-warning)', empty: 'Nothing to review.' },
  { key: 'merged', title: 'Merged', accent: 'var(--status-success)', empty: 'Nothing shipped yet.' },
]
