import {
  MdAcUnit,
  MdCarpenter,
  MdCleaningServices,
  MdElectricalServices,
  MdFormatPaint,
  MdHomeRepairService,
  MdKey,
  MdKitchen,
  MdPestControl,
  MdPlumbing,
  MdYard
} from 'react-icons/md'

const ICONS = {
  electrician: MdElectricalServices,
  plumber: MdPlumbing,
  carpenter: MdCarpenter,
  painter: MdFormatPaint,
  ac_repair: MdAcUnit,
  appliance_repair: MdKitchen,
  cleaning: MdCleaningServices,
  pest_control: MdPestControl,
  gardener: MdYard,
  locksmith: MdKey,
  other: MdHomeRepairService
}

export const categoryIcon = (key) => ICONS[key] || MdHomeRepairService

/* Dates arrive as plain calendar days ("2026-10-20") and times as "14:30" in the society's time zone.
   They are formatted here as text without ever building a local Date, so the browser's time zone cannot shift them. */

export const dayLabel = (date) =>
  date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '-'

export const dayParts = (date) => {
  const d = new Date(`${date}T00:00:00Z`)
  return {
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
    day: d.getUTCDate(),
    month: d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
  }
}

export const timeLabel = (hm) => {
  if (!hm) return '-'
  const [h, m] = hm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export const slotLabel = (start, end) => `${timeLabel(start)} to ${timeLabel(end)}`

export const STATUS_LABEL = {
  requested: 'Waiting for vendor',
  confirmed: 'Confirmed',
  on_the_way: 'On the way',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  declined: 'Declined'
}

export const CLOSED_REASON = {
  day_off: 'Not working this day',
  time_off: 'Away',
  paused: 'Not taking bookings right now',
  past: 'This day has passed',
  too_far: 'Too far ahead to book',
  no_slots: 'No slots this day',
  invalid_date: 'Pick a valid date'
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

export const ACTIVE = ['requested', 'confirmed', 'on_the_way', 'in_progress']
