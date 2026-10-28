import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FiAlertTriangle, FiMapPin, FiRss, FiShield, FiRefreshCw } from 'react-icons/fi'
import { GiGoldBar } from 'react-icons/gi'
import { useT } from '../contexts/LanguageContext'
import useApi from '../hooks/useApi'
import { AlertRow, GoldCards, Helplines, NewsRow, SectionCard, ServicePlace, SoftNote, clockLabel } from '../components/insights'
import { ListSkeleton, PageHeader } from '../components/ui'

const MoreServices = () => {
  const { t, lang } = useT()
  const { hash } = useLocation()
  const [allAlerts, setAllAlerts] = useState(false)
  const alerts = useApi('/insights/alerts', { live: false })
  const gold = useApi('/insights/gold', { live: false })
  const emergency = useApi('/insights/emergency', { live: false })
  const news = useApi('/insights/news', { params: { lang }, live: false })

  // /more#gold opens scrolled to the gold section.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, gold.data, alerts.data])

  const list = alerts.data?.alerts || []
  const shown = allAlerts ? list : list.slice(0, 3)
  const today = alerts.data?.today
  const places = [...(emergency.data?.police || []), ...(emergency.data?.hospitals || [])]

  const refresh = () => {
    alerts.reload()
    gold.reload()
    emergency.reload()
    news.reload()
  }

  return (
    <>
      <PageHeader
        title="More Services"
        subtitle={alerts.data?.place ? `${t('Updates for')} ${alerts.data.place.label}` : 'Alerts, gold rates, emergency help and news for your area.'}
        action={
          <button className="btn-secondary btn-sm" onClick={refresh} aria-label={t('Refresh')}>
            <FiRefreshCw size={14} /> {t('Refresh')}
          </button>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SectionCard
            id="alerts"
            title="Natural Disaster Alerts"
            icon={FiAlertTriangle}
            tone="rose"
            action={list.length > 3 && <button className="text-sm font-semibold text-info hover:underline" onClick={() => setAllAlerts((v) => !v)}>{allAlerts ? t('Show less') : t('See All')}</button>}
          >
            {alerts.loading && !alerts.data ? (
              <div className="p-4"><ListSkeleton rows={3} /></div>
            ) : alerts.error && !alerts.data ? (
              <SoftNote>{t('Alerts are not available right now. Please try again later.')}</SoftNote>
            ) : shown.length === 0 ? (
              <SoftNote>{t('No alerts for your area right now.')}</SoftNote>
            ) : (
              <ul className="divide-y divide-line">{shown.map((a) => <li key={a.id}><AlertRow alert={a} today={today} compact={!allAlerts} /></li>)}</ul>
            )}
            {alerts.data && (
              <p className="border-t border-line px-4 py-3 text-xs text-muted">
                {t('Sources')}: NDMA SACHET{alerts.data.sources?.official ? '' : ` (${t('not answering')})`} · {t('Forecast')} · USGS{alerts.data.sources?.earthquakes ? '' : ` (${t('not answering')})`}
              </p>
            )}
          </SectionCard>

          <SectionCard id="gold" title="Gold Rates" icon={GiGoldBar} tone="amber" action={gold.data && <span className="text-xs text-muted">{t('Last updated')}: {clockLabel(gold.data.updatedAt)}</span>}>
            <div className="p-4">
              {gold.loading && !gold.data ? <ListSkeleton rows={1} /> : gold.data ? <GoldCards gold={gold.data.gold} /> : <SoftNote>{t('Gold rates are not available right now.')}</SoftNote>}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard id="emergency" title="Nearby Emergency Services" icon={FiShield} tone="rose" action={<Link to="/nearby" className="text-sm font-semibold text-info hover:underline">{t('View on Map')}</Link>}>
            {emergency.loading && !emergency.data ? (
              <div className="p-4"><ListSkeleton rows={2} /></div>
            ) : (
              <>
                {places.length > 0 ? (
                  <ul className="divide-y divide-line">{places.map((p) => <ServicePlace key={p.id} p={p} />)}</ul>
                ) : (
                  <SoftNote>{emergency.data && !emergency.data.nearbyAvailable ? t('The map is busy right now. Use the helpline numbers below.') : t('No stations found nearby.')}</SoftNote>
                )}
                {emergency.data && (
                  <div className="border-t border-line">
                    <Helplines list={emergency.data.helplines} />
                  </div>
                )}
              </>
            )}
          </SectionCard>

          <SectionCard id="news" title="Local News & Updates" icon={FiRss} tone="blue" action={<Link to="/news" className="text-sm font-semibold text-info hover:underline">{t('See All')}</Link>}>
            {news.loading && !news.data ? (
              <div className="p-4"><ListSkeleton rows={3} /></div>
            ) : news.data?.news?.length ? (
              <ul className="divide-y divide-line">{news.data.news.slice(0, 4).map((n) => <li key={n.id}><NewsRow item={n} /></li>)}</ul>
            ) : (
              <SoftNote>{t('No news right now.')}</SoftNote>
            )}
          </SectionCard>
        </div>
      </div>

      <p className="mt-5 flex items-center gap-1.5 text-xs text-muted"><FiMapPin size={12} aria-hidden="true" /> {t('All information comes from free public sources and may be delayed. In an emergency call 112.')}</p>
    </>
  )
}

export default MoreServices
