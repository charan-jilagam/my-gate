import { FiActivity, FiAward, FiCalendar, FiGift, FiMusic, FiSun, FiUsers, FiClipboard } from 'react-icons/fi'

// [key, label, icon]. The first photo of an occasion is its cover; without a photo the type's icon stands in.
export const KINDS = [
  ['festival', 'Festival', FiSun],
  ['celebration', 'Celebration', FiGift],
  ['cultural', 'Cultural', FiMusic],
  ['sports', 'Sports', FiActivity],
  ['community', 'Get-together', FiUsers],
  ['meeting', 'Meeting', FiClipboard],
  ['achievement', 'Achievement', FiAward],
  ['other', 'Other', FiCalendar]
]

export const kindLabel = (k) => KINDS.find((x) => x[0] === k)?.[1] || 'Occasion'
export const kindIcon = (k) => KINDS.find((x) => x[0] === k)?.[2] || FiCalendar

const part = (d, opts) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', ...opts })
const Y = { day: 'numeric', month: 'short', year: 'numeric' }

/** "8 Nov 2026", "8 to 10 Nov 2026", "30 Oct to 2 Nov 2026" or across years. */
export const dateText = (date, endDate) => {
  if (!date) return ''
  if (!endDate || endDate === date) return part(date, Y)
  const [y1, m1, d1] = date.split('-')
  const [y2, m2] = endDate.split('-')
  if (y1 === y2 && m1 === m2) return `${Number(d1)} to ${part(endDate, Y)}`
  if (y1 === y2) return `${part(date, { day: 'numeric', month: 'short' })} to ${part(endDate, Y)}`
  return `${part(date, Y)} to ${part(endDate, Y)}`
}

export const yearOf = (date) => String(date || '').slice(0, 4)
export const dayOf = (date) => (date ? String(Number(date.split('-')[2])) : '')
export const monthOf = (date) => (date ? part(date, { month: 'short' }) : '')
