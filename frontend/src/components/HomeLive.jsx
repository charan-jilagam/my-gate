import { Link } from 'react-router-dom'
import { FiAlertTriangle, FiArrowRight, FiChevronRight, FiDroplet, FiMapPin, FiRss } from 'react-icons/fi'
import { GiGoldBar } from 'react-icons/gi'
import { useT } from '../contexts/LanguageContext'
import WeatherIcon from './WeatherIcon'
import { NewsRow, TONE, bannerAlert, clockLabel, hourLabel, skyClass } from './insights'

// The weather card on the home screen: today at a glance, the next few hours, and a way into the full forecast.
export const WeatherHero = ({ weather, place, updatedAt }) => {
  const { t } = useT()
  const c = weather.current
  return (
    <section className={`${skyClass(c)} rounded-3xl p-5 shadow-lift`} aria-label={t('Weather')}>
      <div className="relative z-10 flex items-center justify-between text-sm font-semibold text-white/90">
        <span className="flex items-center gap-2">
          <WeatherIcon icon={c.icon} isDay={c.isDay} size={26} />
          {t('Weather')}
        </span>
        {updatedAt && <span className="text-xs">{t('Updated')} {clockLabel(updatedAt)}</span>}
      </div>

      <div className="relative z-10 mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-6xl font-extrabold leading-none tracking-tight drop-shadow-sm">
            {c.temp}°<span className="text-3xl font-bold">C</span>
          </p>
          <p className="mt-1.5 text-base font-bold drop-shadow-sm">{t(c.condition)}</p>
          <p className="mt-0.5 text-sm font-semibold text-white/90">
            {t('Feels like')} {c.feelsLike}°C <span className="mx-1 opacity-70">·</span> {t('Humidity')} {c.humidity}%
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-white/90"><FiMapPin size={13} aria-hidden="true" /> {place.label}</p>
        </div>
        <WeatherIcon icon={c.icon} isDay={c.isDay} size={92} className="-mb-1 drop-shadow-lg" title={t(c.condition)} />
      </div>

      <ul className="relative z-10 mt-4 grid grid-cols-6 gap-1.5">
        {weather.hourly.slice(0, 6).map((h, i) => (
          <li key={h.time} className="glass flex flex-col items-center gap-0.5 rounded-xl px-0.5 py-2">
            <span className="text-[11px] font-semibold">{i === 0 ? t('Now') : hourLabel(h.time)}</span>
            <WeatherIcon icon={h.icon} isDay={h.isDay} size={26} />
            <span className="text-sm font-extrabold tabular-nums">{h.temp}°</span>
            {h.rainChance >= 30 && <span className="flex items-center text-[10px] font-semibold"><FiDroplet size={9} aria-hidden="true" />{h.rainChance}%</span>}
          </li>
        ))}
      </ul>

      <Link to="/weather" className="relative z-10 mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-sm font-bold text-[#1f4fa8] shadow-sm hover:bg-white/90">
        {t('View Full Forecast')} <FiArrowRight size={15} />
      </Link>
    </section>
  )
}

const TILES = [
  { key: 'news', to: '/news', icon: FiRss, label: 'Local News', tone: 'blue' },
  { key: 'gold', to: '/more#gold', icon: GiGoldBar, label: 'Gold Rates', tone: 'amber' },
  { key: 'emergency', icon: FiAlertTriangle, label: 'Emergency', tone: 'rose' },
  { key: 'nearby', to: '/nearby', icon: FiMapPin, label: 'Nearby', tone: 'green' }
]

// Four shortcuts under the weather card. Emergency opens SOS for people who have it, otherwise the emergency list.
export const ServiceTiles = ({ canSos }) => {
  const { t } = useT()
  return (
    <ul className="grid grid-cols-4 gap-2.5 lg:grid-cols-2 xl:grid-cols-4">
      {TILES.map(({ key, to, icon: Icon, label, tone }) => (
        <li key={key}>
          <Link
            to={to || (canSos ? '/emergency' : '/more#emergency')}
            className="panel-link flex h-full flex-col items-center gap-2 px-1.5 py-3.5 text-center text-xs font-semibold sm:text-sm"
          >
            <span className={`grid h-11 w-11 place-items-center rounded-2xl ${TONE[tone]}`} aria-hidden="true">
              <Icon size={22} />
            </span>
            {t(label)}
          </Link>
        </li>
      ))}
    </ul>
  )
}

// A red strip for the most serious alert, so it is seen before anything else.
export const AlertBanner = ({ alerts }) => {
  const { t } = useT()
  const a = bannerAlert(alerts)
  if (!a) return null
  const danger = a.severity === 'danger'
  return (
    <Link
      to="/more#alerts"
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-card transition hover:-translate-y-0.5 ${danger ? 'border-danger/40 bg-danger-soft' : 'border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${danger ? 'bg-danger text-on-solid' : 'bg-amber-400 text-[#2a1d00]'}`} aria-hidden="true">
        <FiAlertTriangle size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-bold ${danger ? 'text-danger' : ''}`}>{t(a.kind === 'quake' ? 'Earthquake Update' : a.kind === 'official' ? 'Official Alert' : 'Weather Alert')}</span>
        <span className="line-clamp-2 block text-sm">{a.kind === 'forecast' ? `${t(a.title)}: ${t(a.message)}` : `${a.title}${a.message ? `: ${a.message}` : ''}`}</span>
      </span>
      <FiChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
    </Link>
  )
}

export const TopNews = ({ items }) => {
  const { t } = useT()
  if (!items?.length) return null
  return (
    <section className="panel mb-6 overflow-hidden" aria-labelledby="news-h">
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <h2 id="news-h" className="text-base font-bold">{t('Top Local News')}</h2>
        <Link to="/news" className="text-sm font-semibold text-info hover:underline">{t('See All')}</Link>
      </div>
      <ul className="divide-y divide-line">
        {items.slice(0, 3).map((n) => (
          <li key={n.id}><NewsRow item={n} /></li>
        ))}
      </ul>
    </section>
  )
}
