import { useState } from 'react'
import { FiDroplet, FiEye, FiMapPin, FiRefreshCw, FiSunrise, FiSunset, FiWind, FiAlertTriangle } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import useApi from '../hooks/useApi'
import WeatherIcon from '../components/WeatherIcon'
import { AlertRow, SectionCard, SoftNote, clockLabel, dayLabel, hourLabel, shortDay, skyClass } from '../components/insights'
import { ErrorState, ListSkeleton, Tabs } from '../components/ui'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'hourly', label: 'Hourly' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' }
]

const Stat = ({ icon: Icon, value, label }) => (
  <div className="flex flex-1 flex-col items-center gap-0.5 px-2 py-3 text-center">
    <Icon size={20} className="text-info" aria-hidden="true" />
    <p className="mt-0.5 font-display text-base font-extrabold tabular-nums sm:text-lg">{value}</p>
    <p className="text-xs text-muted">{label}</p>
  </div>
)

const Hero = ({ w, place, updatedAt }) => {
  const { t } = useT()
  const c = w.current
  return (
    <div className={`${skyClass(c)} rounded-3xl p-5 shadow-lift`}>
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-white/90">
            <FiMapPin size={14} aria-hidden="true" /> {place.label}
          </p>
          <p className="mt-3 font-display text-6xl font-extrabold leading-none tracking-tight drop-shadow-sm">{c.temp}°<span className="text-3xl font-bold">C</span></p>
          <p className="mt-1 text-lg font-bold drop-shadow-sm">{t(c.condition)}</p>
        </div>
        <div className="text-right">
          <WeatherIcon icon={c.icon} isDay={c.isDay} size={104} className="-mr-2 -mt-2 drop-shadow-lg" title={t(c.condition)} />
          {updatedAt && <p className="text-xs font-semibold text-white/85">{t('Updated')} {clockLabel(updatedAt)}</p>}
        </div>
      </div>
      <p className="relative z-10 mt-3 text-sm font-semibold text-white/95">
        {t('Feels like')} {c.feelsLike}°C <span className="mx-1 opacity-70">|</span> {t('Humidity')} {c.humidity}%
      </p>
      <p className="relative z-10 text-sm font-semibold text-white/95">
        {t('Wind')} {c.windKmh} km/h{c.windDir ? ` (${c.windDir})` : ''} <span className="mx-1 opacity-70">|</span> {t('UV Index')} {c.uv ?? '-'}{c.uvLabel ? ` (${t(c.uvLabel)})` : ''}
      </p>
    </div>
  )
}

const HourCell = ({ h, first }) => {
  const { t } = useT()
  return (
    <li className={`flex w-[4.4rem] shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-2.5 ${first ? 'bg-info-soft' : 'bg-sunken/60'}`}>
      <span className="text-xs font-semibold text-muted">{first ? t('Now') : hourLabel(h.time)}</span>
      <WeatherIcon icon={h.icon} isDay={h.isDay} size={34} title={t(h.condition)} />
      <span className="font-display text-base font-extrabold tabular-nums">{h.temp}°</span>
      {h.rainChance != null && <span className="flex items-center gap-0.5 text-[11px] font-semibold text-info"><FiDroplet size={10} aria-hidden="true" />{h.rainChance}%</span>}
    </li>
  )
}

const HourlyStrip = ({ hours }) => (
  <ul className="flex gap-2 overflow-x-auto px-4 pb-4 pt-3">{hours.slice(0, 12).map((h, i) => <HourCell key={h.time} h={h} first={i === 0} />)}</ul>
)

const Range = ({ lo, hi, min, max }) => {
  const span = Math.max(max - min, 1)
  const left = ((lo - min) / span) * 100
  const width = Math.max(((hi - lo) / span) * 100, 6)
  return (
    <span className="relative block h-1.5 w-full rounded-full bg-sunken" aria-hidden="true">
      <span className="absolute inset-y-0 rounded-full bg-gradient-to-r from-sky-400 to-amber-400" style={{ left: `${left}%`, width: `${width}%` }} />
    </span>
  )
}

const WeekRows = ({ days, today, bars = false }) => {
  const { t } = useT()
  const min = Math.min(...days.map((d) => d.min))
  const max = Math.max(...days.map((d) => d.max))
  return (
    <ul className="divide-y divide-line">
      {days.map((d) => (
        <li key={d.date} className="flex items-center gap-3 px-4 py-3">
          <span className="w-[5.6rem] shrink-0 text-sm font-semibold">{t(dayLabel(d.date, today))}</span>
          <WeatherIcon icon={d.icon} size={34} title={t(d.condition)} />
          <span className="hidden min-w-0 flex-1 truncate text-sm text-muted sm:block">{t(d.condition)}</span>
          {bars ? (
            <span className="flex flex-1 items-center gap-2 sm:max-w-[14rem]">
              <span className="w-7 text-right text-sm tabular-nums text-muted">{d.min}°</span>
              <Range lo={d.min} hi={d.max} min={min} max={max} />
              <span className="w-7 text-sm font-bold tabular-nums text-danger">{d.max}°</span>
            </span>
          ) : (
            <span className="ml-auto text-sm tabular-nums">
              <span className="text-muted">{d.min}°</span> <span className="font-bold text-danger">{d.max}°</span>
            </span>
          )}
          <span className="flex w-12 shrink-0 items-center justify-end gap-0.5 text-xs font-semibold text-info"><FiDroplet size={12} aria-hidden="true" />{d.rainChance ?? 0}%</span>
        </li>
      ))}
    </ul>
  )
}

const DayCard = ({ d, today }) => {
  const { t } = useT()
  const fact = (label, value) => (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  )
  return (
    <li className="panel p-4">
      <div className="flex items-center gap-3">
        <WeatherIcon icon={d.icon} size={52} title={t(d.condition)} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold">{t(dayLabel(d.date, today))}</p>
          <p className="text-sm text-muted">{t(d.condition)}</p>
        </div>
        <p className="text-right font-display text-xl font-extrabold tabular-nums">{d.max}°<span className="text-sm font-semibold text-muted"> / {d.min}°</span></p>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-line pt-3">
        {fact(t('Chance of Rain'), `${d.rainChance ?? 0}%`)}
        {fact(t('Rainfall'), `${d.rainMm ?? 0} mm`)}
        {fact(t('Gusts'), `${d.gustMax ?? '-'} km/h`)}
        {fact(t('UV Index'), d.uvMax ?? '-')}
        {fact(t('Sunrise'), hourLabel(d.sunrise, true))}
        {fact(t('Sunset'), hourLabel(d.sunset, true))}
      </dl>
    </li>
  )
}

const HourRow = ({ h, first }) => {
  const { t } = useT()
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-14 shrink-0 text-sm font-semibold">{first ? t('Now') : hourLabel(h.time)}</span>
      <WeatherIcon icon={h.icon} isDay={h.isDay} size={34} title={t(h.condition)} />
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{t(h.condition)}</span>
      <span className="flex w-24 items-center gap-1.5" aria-hidden="true">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full bg-sky-500" style={{ width: `${h.rainChance ?? 0}%` }} /></span>
      </span>
      <span className="w-10 text-right text-xs font-semibold text-info">{h.rainChance ?? 0}%</span>
      <span className="w-10 text-right font-display text-base font-extrabold tabular-nums">{h.temp}°</span>
    </li>
  )
}

const Alerts = ({ alerts, today }) => {
  const { t } = useT()
  const list = alerts.data?.alerts || []
  return (
    <SectionCard id="alerts" title="Weather alerts" icon={FiAlertTriangle} tone="rose">
      {alerts.loading && !alerts.data ? (
        <div className="p-4"><ListSkeleton rows={2} /></div>
      ) : alerts.error && !alerts.data ? (
        <SoftNote>{t('Alerts are not available right now. Please try again later.')}</SoftNote>
      ) : list.length === 0 ? (
        <SoftNote>{t('No alerts for your area right now.')}</SoftNote>
      ) : (
        <ul className="divide-y divide-line">{list.map((a) => <li key={a.id}><AlertRow alert={a} today={today} /></li>)}</ul>
      )}
      <p className="border-t border-line px-4 py-3 text-xs text-muted">{t('Warnings come from NDMA SACHET, the forecast and USGS. For life-threatening danger call 112.')}</p>
    </SectionCard>
  )
}

const Weather = () => {
  const { t } = useT()
  const [tab, setTab] = useState('overview')
  const weather = useApi('/insights/weather', { live: false })
  const alerts = useApi('/insights/alerts', { live: false })
  const w = weather.data?.weather
  const place = weather.data?.place
  const today = w?.today

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">{t('Weather & Alerts')}</h1>
          {place && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><FiMapPin size={14} className="text-info" aria-hidden="true" /> {place.label}</p>}
        </div>
        <button className="btn-secondary btn-sm" onClick={() => { weather.reload(); alerts.reload() }} aria-label={t('Refresh')}>
          <FiRefreshCw size={14} /> {t('Refresh')}
        </button>
      </div>

      <Tabs items={TABS} value={tab} onChange={setTab} label="Forecast views" />

      {weather.loading && !w ? (
        <ListSkeleton rows={4} />
      ) : weather.error && !w ? (
        <ErrorState message={weather.error} onRetry={weather.reload} />
      ) : (
        w && (
          <>
            {weather.data.stale && <p className="mb-3 rounded-xl bg-amber-soft px-3 py-2 text-xs font-semibold text-ink">{t('Showing the last saved forecast. The weather service is not answering right now.')}</p>}

            {tab === 'overview' && (
              <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
                <div className="space-y-5">
                  <Hero w={w} place={place} updatedAt={weather.data.updatedAt} />
                  <div className="panel flex divide-x divide-line">
                    <Stat icon={FiDroplet} value={`${w.current.rainChance ?? 0}%`} label={t('Chance of Rain')} />
                    <Stat icon={FiWind} value={`${w.current.pressure} hPa`} label={t('Pressure')} />
                    <Stat icon={FiEye} value={w.current.visibilityKm != null ? `${w.current.visibilityKm} km` : '-'} label={t('Visibility')} />
                  </div>
                  <section className="panel overflow-hidden" aria-labelledby="hourly-h">
                    <div className="flex items-center justify-between px-4 pt-4">
                      <h2 id="hourly-h" className="text-base font-bold">{t('Hourly Forecast')}</h2>
                      <button className="text-sm font-semibold text-info hover:underline" onClick={() => setTab('hourly')}>{t('See Full 24 Hours')} →</button>
                    </div>
                    <HourlyStrip hours={w.hourly} />
                  </section>
                  <Alerts alerts={alerts} today={today} />
                </div>
                <section className="panel h-fit overflow-hidden" aria-labelledby="week-h">
                  <h2 id="week-h" className="px-4 pb-1 pt-4 text-base font-bold">{t('7 Day Forecast')}</h2>
                  <WeekRows days={w.daily} today={today} />
                </section>
              </div>
            )}

            {tab === 'hourly' && (
              <section className="panel overflow-hidden" aria-labelledby="h24-h">
                <h2 id="h24-h" className="px-4 pb-1 pt-4 text-base font-bold">{t('Next 24 hours')}</h2>
                <ul className="divide-y divide-line">{w.hourly.map((h, i) => <HourRow key={h.time} h={h} first={i === 0} />)}</ul>
              </section>
            )}

            {tab === 'daily' && (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{w.daily.map((d) => <DayCard key={d.date} d={d} today={today} />)}</ul>
            )}

            {tab === 'weekly' && (
              <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
                <section className="panel overflow-hidden" aria-labelledby="wk-h">
                  <h2 id="wk-h" className="px-4 pb-1 pt-4 text-base font-bold">{t('This week')}</h2>
                  <WeekRows days={w.daily} today={today} bars />
                </section>
                <Alerts alerts={alerts} today={today} />
              </div>
            )}

            <p className="mt-5 text-xs text-muted">
              {t('Forecast data')}: Open-Meteo.com · {shortDay(today)}
            </p>
          </>
        )
      )}
    </>
  )
}

export default Weather
