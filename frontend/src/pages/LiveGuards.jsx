import { useEffect, useMemo, useState } from 'react'
import { FiPhone, FiMapPin, FiNavigation, FiAlertTriangle, FiRefreshCw } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useT } from '../contexts/LanguageContext'
import useApi from '../hooks/useApi'
import MapView from '../components/MapView'
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Avatar } from '../components/ui'
import { timeLabel } from '../utils/services'
import { agoLabel, distanceLabel, mapsLink } from '../utils/location'

const LiveGuards = () => {
  const { t } = useT()
  const { data, loading, error, reload } = useApi('/guards/live')
  const [focus, setFocus] = useState(null)

  // Refresh by itself every 30 seconds while the page is open.
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === 'visible' && reload(), 30000)
    return () => clearInterval(timer)
  }, [reload])

  const guards = data?.guards || []
  const markers = useMemo(() => {
    const m = guards.filter((g) => g.lat != null).map((g) => ({ id: g.userId, lat: g.lat, lng: g.lng, label: g.name.slice(0, 1), tone: g.outside ? 'danger' : g.stale ? 'muted' : 'brand', title: g.name, detail: `${g.postName || String(g.post).replace(/_/g, ' ')} · ${agoLabel(g.seenAt)}` }))
    ;(data?.posts || []).forEach((p) => m.push({ id: `p${p._id}`, lat: p.lat, lng: p.lng, label: 'P', tone: 'warn', title: p.name, detail: 'Guard post' }))
    return m
  }, [data, guards])
  const circles = useMemo(() => (data?.location ? [{ lat: data.location.lat, lng: data.location.lng, radius: data.location.radiusMeters || 300, label: 'At the society' }, { lat: data.location.lat, lng: data.location.lng, radius: 1000, dashed: true, noFit: true, tone: 'muted', label: '1 km around the society' }] : []), [data])
  const center = focus || data?.location

  return (
    <>
      <PageHeader title="Guard tracking" subtitle="Where each guard on duty was last seen. Only guards who are clocked in are shown." action={<button className="btn-secondary" onClick={reload}><FiRefreshCw size={15} /> {t('Refresh')}</button>} />
      {loading ? <div className="panel"><ListSkeleton rows={3} /></div> : error ? <div className="panel"><ErrorState message={error} onRetry={reload} /></div> : (
        <>
          {!data.location && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber bg-amber-soft p-4 text-sm">
              <FiAlertTriangle className="mt-0.5 shrink-0" />
              <p>{t('The society location is not set yet, so we cannot tell if guards are at their post.')} <Link to="/guard-posts" className="font-semibold underline">{t('Set it now')}</Link></p>
            </div>
          )}
          {(markers.length > 0 || data.location) && (
            <MapView key={focus ? `${focus.lat},${focus.lng}` : 'all'} markers={markers} circles={circles} center={center} height={300} className="mb-4" />
          )}
          {data.missing?.length > 0 && (
            <div className="mb-4 rounded-xl border border-danger/40 bg-danger-soft p-4">
              <p className="mb-2 font-semibold">{t('Should be on duty, not clocked in')}</p>
              <ul className="space-y-2">
                {data.missing.map((g) => (
                  <li key={g.shiftId} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1"><b>{g.name}</b> · {timeLabel(g.startTime)} {t('shift')}, {g.lateMinutes} {t('min late')}</span>
                    {g.phone && <a className="btn-secondary btn-sm" href={`tel:${g.phone}`}><FiPhone size={14} /> {t('Call')}</a>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!guards.length ? (
            <div className="panel"><EmptyState icon={FiNavigation} title="No guard is on duty right now" text="Guards show up here as soon as they clock in." /></div>
          ) : (
            <ul className="space-y-3">
              {guards.map((g) => (
                <li key={g.shiftId} className="panel p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={g.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{g.name}</p>
                      <p className="text-xs text-muted">{g.postName || String(g.post).replace(/_/g, ' ')} · {timeLabel(g.startTime)} – {timeLabel(g.endTime)}</p>
                    </div>
                    {g.outside ? <span className="tag-danger">{t('Away from post')}</span> : g.stale ? <span className="tag-neutral">{t('Not updating')}</span> : <span className="tag-ok">{t('At post')}</span>}
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {g.lat != null ? `${t('Last seen')} ${agoLabel(g.seenAt)}${g.distanceM != null ? ` · ${distanceLabel(g.distanceM)} ${t('from post')}` : ''}` : t('No location received yet. The guard may have location switched off.')}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {g.lat != null && <button className="btn-secondary btn-sm" onClick={() => { setFocus({ lat: g.lat, lng: g.lng }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><FiMapPin size={14} /> {t('Show on map')}</button>}
                    {g.lat != null && <a className="btn-ghost btn-sm" href={mapsLink(g.lat, g.lng)} target="_blank" rel="noreferrer">{t('Open in Maps')}</a>}
                    {g.phone && <a className="btn-secondary btn-sm" href={`tel:${g.phone}`}><FiPhone size={14} /> {t('Call')}</a>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted">{t('Location is shared only while a guard is clocked in, and only while the app is open on their phone.')}</p>
        </>
      )}
    </>
  )
}

export default LiveGuards
