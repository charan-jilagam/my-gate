import { FiActivity, FiAlertTriangle, FiArrowDownRight, FiArrowUpRight, FiChevronRight, FiCloudLightning, FiCloudRain, FiExternalLink, FiNavigation, FiPhone, FiShield, FiSun, FiWind } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import { bestMode, directionsUrl, distanceLabel } from '../utils/places'
import { formatINR } from './ui'

/* ---------- Colour tones: a soft tinted square behind an icon ---------- */

export const TONE = {
  blue: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  teal: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300'
}
export const TONE_ORDER = ['blue', 'amber', 'violet', 'green', 'teal', 'rose']

// The sky behind the big temperature follows the weather and the time of day.
export const skyClass = (c) => {
  if (!c) return 'sky'
  if (c.icon === 'storm') return 'sky sky-storm'
  if (c.icon === 'rain' || c.icon === 'heavy-rain' || c.icon === 'drizzle') return 'sky sky-rain'
  if (!c.isDay) return 'sky sky-night'
  if (c.icon === 'cloud' || c.icon === 'fog') return 'sky sky-cloud'
  return 'sky'
}

/* ---------- Dates and times ---------- */

// 'YYYY-MM-DD' -> a Date at local midnight (no time-zone shift).
const parseDay = (s) => {
  const [y, m, d] = String(s || '').split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
const dayDiff = (date, today) => Math.round((parseDay(date) - parseDay(today)) / 86400000)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Wed, 18 Jun": fixed English words so the app's translator can render them in Hindi or Telugu. */
export const shortDay = (date) => {
  const d = parseDay(date)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "Today", "Tomorrow", then "Wed, 18 Jun". */
export const dayLabel = (date, today) => {
  const diff = dayDiff(date, today || date)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return shortDay(date)
}

/** '2026-10-28T15:00' -> '3 PM'. The time is already local to the place, so it is read as text. */
export const hourLabel = (iso, withMinutes = false) => {
  const m = /T(\d{2}):(\d{2})/.exec(String(iso || ''))
  if (!m) return ''
  const h = Number(m[1])
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return withMinutes ? `${h12}:${m[2]} ${suffix}` : `${h12} ${suffix}`
}

export const clockLabel = (value) => {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()
}

export const timeAgo = (value) => {
  const ms = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(ms)) return ''
  const mins = Math.max(Math.round(ms / 60000), 0)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs === 1 ? '1 hour ago' : `${hrs} hours ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

/* ---------- Alerts ---------- */

const ALERT_ICON = { rain: FiCloudRain, wind: FiWind, storm: FiCloudLightning, heat: FiSun }
const alertIcon = (a) => (a.kind === 'quake' ? FiActivity : a.kind === 'official' ? FiShield : ALERT_ICON[a.subtype] || FiAlertTriangle)
const SEVERITY_TONE = { danger: 'rose', warning: 'amber', watch: 'blue', info: 'slate' }
export const SEVERITY_LABEL = { danger: 'Danger', warning: 'Warning', watch: 'Be aware', info: 'For information' }

const alertWhen = (a, today, t) => {
  if (a.kind === 'forecast' && a.date) return t(dayLabel(a.date, today))
  const at = a.kind === 'quake' ? a.at : a.effective
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  return sameDay(d, Date.now()) ? `${t('Today')}, ${clockLabel(d)}` : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Show only what is worth a banner: anything above "for information".
export const bannerAlert = (alerts = []) => alerts.find((a) => a.severity !== 'info') || null

export const AlertRow = ({ alert, today, compact = false }) => {
  const { t } = useT()
  const Icon = alertIcon(alert)
  const tone = TONE[SEVERITY_TONE[alert.severity] || 'slate']
  const when = alertWhen(alert, today, t)
  const body = (
    <>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${tone}`}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold leading-snug">{t(alert.title)}</span>
          {when && <span className="shrink-0 text-xs text-muted">{when}</span>}
        </span>
        <span className={`mt-0.5 block text-sm text-muted ${compact ? 'line-clamp-2' : ''}`}>{alert.kind === 'forecast' ? t(alert.message) : alert.message}</span>
        {alert.note && <span className="mt-0.5 block text-xs text-muted">({t(alert.note)})</span>}
        {!compact && (
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className={`tag ${tone}`}>{t(SEVERITY_LABEL[alert.severity] || 'For information')}</span>
            <span>{alert.source}</span>
            {alert.area && <span className="truncate">· {alert.area}</span>}
          </span>
        )}
      </span>
      {alert.url && <FiExternalLink size={15} className="mt-1 shrink-0 text-muted" aria-hidden="true" />}
    </>
  )
  const cls = 'flex items-start gap-3 px-4 py-3.5'
  return alert.url ? (
    <a href={alert.url} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-sunken/60`}>{body}</a>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/* ---------- News ---------- */

const hash = (s) => [...String(s)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)

export const NewsRow = ({ item }) => {
  const { t } = useT()
  const tone = TONE[TONE_ORDER[hash(item.source) % TONE_ORDER.length]]
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 px-4 py-3.5 hover:bg-sunken/60">
      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl font-display text-xl font-extrabold ${tone}`} aria-hidden="true">
        {String(item.source || 'N').trim().charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        {item.breaking && <span className="mb-1 inline-block rounded bg-danger px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-on-solid">{t('Breaking')}</span>}
        <span className="line-clamp-2 block font-semibold leading-snug">{item.title}</span>
        <span className="mt-1 block text-xs text-muted">{t(timeAgo(item.publishedAt))} · {item.source}</span>
      </span>
      <FiChevronRight size={18} className="mt-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </a>
  )
}

/* ---------- Gold ---------- */

const Change = ({ change }) => {
  const { t } = useT()
  if (!change) return <p className="mt-1 text-xs text-muted">{t('Change shows from tomorrow')}</p>
  const up = change.amount >= 0
  const Icon = up ? FiArrowUpRight : FiArrowDownRight
  return (
    <p className={`mt-1 flex items-center gap-1 text-sm font-semibold ${up ? 'text-ok' : 'text-danger'}`}>
      <Icon size={15} aria-hidden="true" /> {up ? '+' : '-'}{Math.abs(change.amount)} ({Math.abs(change.percent).toFixed(2)}%)
    </p>
  )
}

const GoldCard = ({ label, rate }) => {
  const { t } = useT()
  return (
    <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-amber-100/60 p-4 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-amber-500/5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">
        {formatINR(rate.perGram).replace(/\.00$/, '')}
        <span className="block text-sm font-medium text-muted">/ {t('gram')}</span>
      </p>
      <Change change={rate.change} />
    </div>
  )
}

export const GoldCards = ({ gold }) => {
  const { t } = useT()
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <GoldCard label={`${t('Gold')} (24K)`} rate={gold.k24} />
        <GoldCard label={`${t('Gold')} (22K)`} rate={gold.k22} />
      </div>
      <p className="mt-3 text-xs text-muted">{t('Prices are indicative international rates and may vary in local markets.')}</p>
    </div>
  )
}

/* ---------- Emergency services ---------- */

export const ServicePlace = ({ p }) => {
  const { t } = useT()
  const tel = p.phone ? p.phone.replace(/[^\d+]/g, '') : ''
  const police = p.kind === 'police'
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${police ? TONE.blue : TONE.rose}`} aria-hidden="true">
        {police ? <FiShield size={22} /> : <FiActivity size={22} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{p.name}</p>
        <p className="text-sm text-muted">
          {distanceLabel(p.distanceM)}
          {p.open24 && <span className="font-semibold text-ok"> · {t('Open 24 Hours')}</span>}
        </p>
      </div>
      {tel && (
        <a href={`tel:${tel}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ok text-on-solid shadow-sm hover:opacity-90" aria-label={`${t('Call')} ${p.name}`}>
          <FiPhone size={18} />
        </a>
      )}
      <a href={directionsUrl(p, null, bestMode(p.distanceM))} target="_blank" rel="noopener noreferrer" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-info-soft text-info hover:opacity-90" aria-label={`${t('Directions')}: ${p.name}`}>
        <FiNavigation size={18} />
      </a>
    </li>
  )
}

export const Helplines = ({ list }) => {
  const { t } = useT()
  return (
    <ul className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
      {list.map((h) => (
        <li key={h.number}>
          <a href={`tel:${h.number}`} className="flex h-full items-center gap-2.5 rounded-xl border border-line bg-sunken/50 px-3 py-2.5 hover:border-brand">
            <FiPhone size={16} className="shrink-0 text-ok" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-display text-lg font-extrabold leading-none">{h.number}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">{t(h.label)}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/* ---------- Small shared pieces ---------- */

export const SectionCard = ({ id, title, icon: Icon, tone = 'blue', action, children }) => {
  const { t } = useT()
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="panel scroll-mt-20 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-4">
        <h2 id={`${id}-h`} className="flex items-center gap-2.5 text-base font-bold">
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${TONE[tone]}`} aria-hidden="true">
            <Icon size={18} />
          </span>
          {t(title)}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export const SoftNote = ({ children }) => <p className="px-4 py-6 text-center text-sm text-muted">{children}</p>
