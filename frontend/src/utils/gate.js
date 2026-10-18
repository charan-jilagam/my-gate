// Small helpers shared by the gate console and the visitors list.

// "Floor 2" from a flat number like 210 or A-1204. Only a guess from the number, so the screen says "by flat number".
export const floorOf = (flatNo) => {
  const digits = String(flatNo || '').match(/\d+/g)
  if (!digits) return ''
  const last = digits[digits.length - 1]
  const n = parseInt(last, 10)
  if (!Number.isFinite(n)) return ''
  if (last.length <= 2) return n === 0 ? '' : 'Ground floor'
  const f = Math.floor(n / 100)
  return f === 0 ? 'Ground floor' : `Floor ${f}`
}

export const flatText = (v) => `${v?.block ? `${v.block}-` : ''}${v?.flatNo || '-'}`

export const clock = (value) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

export const sameDay = (a, b = new Date()) => new Date(a).toDateString() === new Date(b).toDateString()

// "6:30 pm", or "Tomorrow, 6:30 pm" / "19 Oct, 6:30 pm" when it is not today.
export const clockWithDay = (value) => {
  if (!value) return '-'
  if (sameDay(value)) return clock(value)
  const d = new Date(value)
  const tomorrow = new Date(Date.now() + 86400000)
  return `${sameDay(value, tomorrow) ? 'Tomorrow' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}, ${clock(value)}`
}

// Someone who is still inside after the time the guard noted.
export const isOverdue = (v, now = Date.now()) => v?.status === 'checked_in' && v.expectedExit && new Date(v.expectedExit).getTime() < now

export const minutesOver = (v, now = Date.now()) => Math.max(0, Math.round((now - new Date(v.expectedExit).getTime()) / 60000))

export const overText = (mins) => (mins < 60 ? `${mins} min over` : mins < 1440 ? `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min ` : ''}over` : `${Math.floor(mins / 1440)} d over`)

export const ROLE_NAME = { resident: 'Resident', security: 'Security', society_admin: 'Society office', super_admin: 'Platform admin' }
