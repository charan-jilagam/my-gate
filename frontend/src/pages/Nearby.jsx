import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiNavigation, FiPhone, FiMapPin, FiCrosshair, FiClock, FiMap, FiRefreshCw } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../contexts/LanguageContext'
import useApi from '../hooks/useApi'
import MapView from '../components/MapView'
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Spinner } from '../components/ui'
import { getPosition } from '../utils/location'
import { CATEGORIES, DISTANCES, categoryOf, directionsUrl, bestMode, distanceLabel, findPlaces } from '../utils/places'

const Chip = ({ active, onClick, children }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition-all active:scale-95 ${active ? 'bg-brand text-brand-ink shadow-sm ring-brand' : 'bg-surface text-ink ring-edge hover:bg-sunken'}`}
  >
    {children}
  </button>
)

const PlaceCard = ({ p, n, from, onShow, active, inside }) => {
  const { t } = useT()
  const mode = bestMode(p.distanceM)
  const other = mode === 'walking' ? 'driving' : 'walking'
  return (
    <li data-item-id={p.id} className={`panel p-3.5 transition-shadow ${active ? 'ring-2 ring-brand' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">{n}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{p.name}</p>
          <p className="mt-0.5 text-sm text-muted">
            <span className="font-semibold text-ink">{distanceLabel(p.distanceM)}</span> {t('away')}
            {inside && <span className="tag-ok ml-2">{t('Inside the 1 km circle')}</span>}
          </p>
          {p.address && <p className="mt-0.5 truncate text-xs text-muted">{p.address}</p>}
          {p.hours && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><FiClock size={12} /> {p.open24 ? t('Open 24 hours') : p.hours}</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="btn-primary btn-sm flex-1" href={directionsUrl(p, from, mode)} target="_blank" rel="noopener noreferrer">
          <FiNavigation size={14} /> {mode === 'walking' ? t('Walking directions') : t('Directions')}
        </a>
        <a className="btn-secondary btn-sm" href={directionsUrl(p, from, other)} target="_blank" rel="noopener noreferrer">
          {other === 'walking' ? t('Walk') : t('Drive')}
        </a>
        {p.phone && (
          <a className="btn-secondary btn-sm" href={`tel:${p.phone.split(';')[0].replace(/[^\d+]/g, '')}`}><FiPhone size={14} /> {t('Call')}</a>
        )}
        <button className="btn-ghost btn-sm" onClick={() => onShow(p)}><FiMap size={14} /> {t('Show on map')}</button>
      </div>
    </li>
  )
}

const Nearby = () => {
  const { t } = useT()
  const { user } = useAuth()
  const home = useApi('/nearby/home', { live: false })
  const base = home.data?.home
  const pinned = base && base.lat != null && base.lng != null
  const [categoryKey, setCategoryKey] = useState(CATEGORIES[0].key)
  const [radius, setRadius] = useState(1000)
  const [origin, setOrigin] = useState('society') // society | me
  const [me, setMe] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')
  const [state, setState] = useState({ loading: false, error: '', places: [] })
  const [focus, setFocus] = useState(null)
  const mapBox = useRef(null)
  const category = categoryOf(categoryKey)
  const society = pinned ? { lat: base.lat, lng: base.lng } : null
  const centre = origin === 'me' && me ? me : society

  const useMyPlace = async () => {
    setLocating(true)
    setLocError('')
    try {
      const pos = await getPosition({ timeout: 15000 })
      setMe({ lat: pos.lat, lng: pos.lng })
      setOrigin('me')
    } catch (e) {
      setLocError(e.message)
      setOrigin('society')
    } finally {
      setLocating(false)
    }
  }

  // Only the latest search may update the screen, so quickly switching chips never shows an older answer.
  const latest = useRef(0)
  const load = useCallback(async () => {
    if (!centre) return
    const mine = ++latest.current
    setState((s) => ({ ...s, loading: true, error: '' }))
    try {
      const places = await findPlaces(category, centre, radius)
      if (mine === latest.current) setState({ loading: false, error: '', places })
    } catch (e) {
      if (mine === latest.current) setState({ loading: false, error: e.message || 'Could not load places.', places: [] })
    }
  }, [category, centre?.lat, centre?.lng, radius]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setFocus(null)
    load()
    return () => { latest.current += 1 }
  }, [load])

  const markers = useMemo(() => {
    const list = state.places.slice(0, 30).map((p, i) => ({ id: p.id, lat: p.lat, lng: p.lng, label: String(i + 1), tone: category.tone, title: p.name, detail: distanceLabel(p.distanceM) }))
    if (society) list.unshift({ id: 'home', lat: society.lat, lng: society.lng, label: 'H', tone: 'danger', title: base?.label || base?.name || 'Your society', detail: base?.address || '' })
    if (me && origin === 'me') list.unshift({ id: 'me', lat: me.lat, lng: me.lng, label: 'Y', tone: 'warn', title: t('You are here') })
    return list
  }, [state.places, society?.lat, society?.lng, me, origin, category.tone]) // eslint-disable-line react-hooks/exhaustive-deps

  const circles = useMemo(() => {
    if (!society) return []
    const rings = [{ lat: society.lat, lng: society.lng, radius: home.data?.areaMeters || 1000, dashed: true, label: t('1 km around your society') }]
    if (radius > 1000) rings.push({ lat: society.lat, lng: society.lng, radius, tone: 'muted', dashed: true, label: `${radius / 1000} km` })
    return rings
  }, [society?.lat, society?.lng, radius, home.data?.areaMeters]) // eslint-disable-line react-hooks/exhaustive-deps

  const showOnMap = (p) => {
    setFocus(p)
    mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isAdmin = ['society_admin', 'super_admin'].includes(user?.role)
  const from = origin === 'me' ? me : society

  return (
    <>
      <PageHeader title="Nearby places" subtitle="Shops, hospitals, petrol bunks, temples and more around your society, with directions." />

      {home.loading ? (
        <div className="panel"><ListSkeleton rows={3} /></div>
      ) : home.error ? (
        <div className="panel"><ErrorState message={home.error} onRetry={home.reload} /></div>
      ) : !home.data?.home ? (
        <div className="panel"><EmptyState icon={FiMapPin} title="No society found" text="Your account is not linked to a society yet." /></div>
      ) : !pinned ? (
        <div className="panel">
          <EmptyState
            icon={FiMapPin}
            title="The society is not on the map yet"
            text={isAdmin ? 'Add the apartment address and drop the pin once. Then everyone can find places nearby.' : 'Ask the office to add the apartment address and location. Then you can find places nearby.'}
            action={isAdmin ? <Link className="btn-primary" to="/guard-posts">{t('Add the address')}</Link> : undefined}
          />
        </div>
      ) : (
        <>
          <section className="panel mb-4 flex items-start gap-3 p-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><FiMapPin /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{base.label || base.name}</p>
              {base.address && <p className="text-sm text-muted">{base.address}</p>}
              <p className="mt-1 text-xs text-muted">{t('The dashed circle is 1 km around your society.')}</p>
            </div>
          </section>

          <div className="-mx-4 mb-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label={t('Kind of place')}>
            <div className="flex gap-2">
              {CATEGORIES.map((c) => (
                <Chip key={c.key} active={c.key === categoryKey} onClick={() => setCategoryKey(c.key)}><span aria-hidden="true">{c.emoji}</span> {t(c.short)}</Chip>
              ))}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-sunken p-1" role="group" aria-label={t('How far')}>
              {DISTANCES.map((d) => (
                <button key={d.m} type="button" aria-pressed={radius === d.m} onClick={() => setRadius(d.m)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${radius === d.m ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}>{d.label}</button>
              ))}
            </div>
            <div className="flex gap-1 rounded-lg bg-sunken p-1" role="group" aria-label={t('Start from')}>
              <button type="button" aria-pressed={origin === 'society'} onClick={() => setOrigin('society')} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${origin === 'society' ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}>{t('From the society')}</button>
              <button type="button" aria-pressed={origin === 'me'} disabled={locating} onClick={() => (me ? setOrigin('me') : useMyPlace())} className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${origin === 'me' ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}>
                {locating ? <Spinner className="h-3.5 w-3.5" /> : <FiCrosshair size={14} />} {t('From where I am')}
              </button>
            </div>
          </div>
          {locError && <p className="mb-3 rounded-lg bg-amber-soft px-3 py-2 text-sm" role="alert">{t(locError)}</p>}

          <div ref={mapBox} className="scroll-mt-20">
            <MapView key={focus ? focus.id : `${categoryKey}-${radius}-${origin}`} markers={markers} circles={circles} center={focus ? { lat: focus.lat, lng: focus.lng } : centre} zoom={focus ? 17 : 15} height={300} className="mb-4" />
          </div>

          {state.loading ? (
            <div className="panel"><ListSkeleton rows={4} /></div>
          ) : state.error ? (
            <div className="panel"><ErrorState message={state.error} onRetry={load} /></div>
          ) : !state.places.length ? (
            <div className="panel">
              <EmptyState
                icon={FiMapPin}
                title="Nothing found nearby"
                text="The map may not list every place. Try a longer distance."
                action={radius < 5000 ? <button className="btn-primary" onClick={() => setRadius(radius === 1000 ? 2000 : 5000)}><FiRefreshCw /> {t('Look further')}</button> : undefined}
              />
            </div>
          ) : (
            <>
              <p className="mb-2 text-sm text-muted" aria-live="polite">{state.places.length} {t(category.label)} · {t('nearest first')}</p>
              <ul className="space-y-3">
                {state.places.slice(0, 30).map((p, i) => (
                  <PlaceCard key={p.id} p={p} n={i + 1} from={from} onShow={showOnMap} active={focus?.id === p.id} inside={society ? p.distanceM <= (home.data?.areaMeters || 1000) && origin === 'society' : false} />
                ))}
              </ul>
              <p className="mt-4 text-center text-xs text-muted">{t('Place information comes from OpenStreetMap volunteers. Please call ahead for timings.')}</p>
            </>
          )}
        </>
      )}
    </>
  )
}

export default Nearby
