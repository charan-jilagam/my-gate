import { FiArrowDownLeft, FiArrowUpRight, FiLogIn, FiLogOut } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import { Avatar } from './ui'

// Family are "going out / coming in"; everyone else is "entry / exit".
export const actionText = (action, family) => (family ? (action === 'out' ? 'Went out' : 'Came in') : action === 'out' ? 'Exit' : 'Entry')

export const when = (value) => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toDateString() === new Date().toDateString() ? '' : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}, `
  return `${day}${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`
}

export const ActionBadge = ({ action, family, size = 14 }) => {
  const { t } = useT()
  const out = action === 'out'
  const Icon = family ? (out ? FiArrowUpRight : FiArrowDownLeft) : out ? FiLogOut : FiLogIn
  return (
    <span className={out ? 'tag-warn' : 'tag-ok'}>
      <Icon size={size} aria-hidden="true" /> {t(actionText(action, family))}
    </span>
  )
}

/** A simple list of a person's gate events (newest first). family = use going out / coming in wording. */
export const MovementList = ({ events, family = false, empty = 'No entries or exits yet.' }) => {
  const { t } = useT()
  if (!events.length) return <p className="px-4 py-6 text-sm text-muted">{t(empty)}</p>
  return (
    <ul className="divide-y divide-line">
      {events.map((e) => (
        <li key={e._id || e.id || `${e.at}${e.action}`} className="flex items-center justify-between gap-3 px-4 py-3">
          <ActionBadge action={e.action} family={family} />
          <span className="text-sm text-muted">{when(e.at)}</span>
        </li>
      ))}
    </ul>
  )
}

/** The flat's activity feed: family, visitors and daily help together. */
export const ActivityList = ({ items }) => {
  const { t } = useT()
  const KIND = { family: 'Family', visitor: 'Visitor', helper: 'Daily help' }
  if (!items.length) return <p className="px-4 py-6 text-sm text-muted">{t('No entries or exits in this time.')}</p>
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => (
        <li key={i.id} className="flex items-center gap-3 px-4 py-3">
          <Avatar name={i.name} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{i.name}</p>
            <p className="truncate text-xs text-muted">{[t(KIND[i.kind] || 'Visitor'), i.detail].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <ActionBadge action={i.action} family={i.kind === 'family'} />
            <p className="mt-0.5 text-xs text-muted">{when(i.at)}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
