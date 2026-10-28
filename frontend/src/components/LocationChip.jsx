import { FiCrosshair, FiMapPin, FiX } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import { useLiveLocation } from '../contexts/LocationContext'

// Shows where the local information is for, and lets the person switch to their live position (or back to the society).
// place: the place the server answered for ({ label, live }).
const LocationChip = ({ place, className = '' }) => {
  const { t } = useT()
  const { status, supported, enable, disable } = useLiveLocation()
  if (!supported) return place ? <p className={`flex items-center gap-1.5 text-sm text-muted ${className}`}><FiMapPin size={14} className="text-info" aria-hidden="true" /> {place.label}</p> : null

  const live = status === 'on' && place?.live
  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${className}`}>
      {place && (
        <span className="flex min-w-0 items-center gap-1.5 text-muted">
          <FiMapPin size={14} className="shrink-0 text-info" aria-hidden="true" />
          <span className="truncate">{place.label}</span>
          {live && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{t('Live')}</span>}
        </span>
      )}
      {status === 'on' ? (
        <button type="button" className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink" onClick={disable}>
          <FiX size={12} aria-hidden="true" /> {t('Use society location')}
        </button>
      ) : (
        <button type="button" className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-info hover:bg-info-soft disabled:opacity-60" onClick={enable} disabled={status === 'asking'}>
          <FiCrosshair size={12} aria-hidden="true" /> {status === 'asking' ? t('Finding you...') : t('Use my live location')}
        </button>
      )}
      {status === 'denied' && <span className="text-xs text-muted">{t('Location is blocked. Allow it in your browser settings to use it here.')}</span>}
      {status === 'error' && <span className="text-xs text-muted">{t('Could not find your location. Showing your society instead.')}</span>}
    </div>
  )
}

export default LocationChip
