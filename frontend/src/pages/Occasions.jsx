import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiCamera, FiImage, FiMapPin, FiPlus, FiUsers } from 'react-icons/fi'
import useApi from '../hooks/useApi'
import { useSocietyScope } from '../components/SocietyPicker'
import OccasionCover from '../components/OccasionCover'
import OccasionForm from '../components/OccasionForm'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '../components/ui'
import { KINDS, dateText, dayOf, kindIcon, kindLabel, monthOf, yearOf } from '../utils/occasions'

const Chip = ({ on, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${on ? 'border-brand bg-brand text-brand-ink' : 'border-edge bg-surface text-ink hover:border-brand'}`}
  >
    {children}
  </button>
)

const Meta = ({ o }) => (
  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
    {o.venue && <span className="inline-flex items-center gap-1"><FiMapPin size={13} /> {o.venue}</span>}
    {o.attendees ? <span className="inline-flex items-center gap-1"><FiUsers size={13} /> {`${o.attendees} came`}</span> : null}
  </p>
)

const KindTag = ({ kind, className = '' }) => {
  const Icon = kindIcon(kind)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-semibold text-ink shadow-sm ${className}`}>
      <Icon size={12} className="text-brand" /> {kindLabel(kind)}
    </span>
  )
}

// The newest occasion, shown large.
const Featured = ({ o }) => (
  <Link to={`/occasions/${o._id}`} className="group mb-6 grid overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-lift md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <div className="relative aspect-[16/10] overflow-hidden md:aspect-auto md:min-h-[20rem]">
      <OccasionCover src={o.cover} kind={o.kind} alt={o.title} eager className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" iconSize={56} />
      <KindTag kind={o.kind} className="absolute left-3 top-3" />
      {o.photoCount > 1 && (
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
          <FiImage size={12} /> {`${o.photoCount} photos`}
        </span>
      )}
    </div>
    <div className="flex flex-col justify-center gap-3 p-5 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">Latest</p>
      <h2 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">{o.title}</h2>
      <p className="text-sm font-semibold">{dateText(o.date, o.endDate)}</p>
      <Meta o={o} />
      {o.description && <p className="line-clamp-3 text-sm text-muted">{o.description}</p>}
      {o.preview?.length > 0 && (
        <div className="mt-1 flex gap-2" aria-hidden="true">
          {o.preview.map((p) => <OccasionCover key={p} src={p} kind={o.kind} className="h-14 w-14 rounded-lg" iconSize={18} />)}
        </div>
      )}
      <span className="mt-1 text-sm font-semibold text-brand">View photos and details</span>
    </div>
  </Link>
)

const Card = ({ o }) => (
  <Link to={`/occasions/${o._id}`} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-lift">
    <div className="relative aspect-[4/3] overflow-hidden">
      <OccasionCover src={o.cover} kind={o.kind} alt={o.title} className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.04]" />
      <KindTag kind={o.kind} className="absolute left-2.5 top-2.5" />
      {o.photoCount > 1 && (
        <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
          <FiImage size={11} /> {o.photoCount}
        </span>
      )}
    </div>
    <div className="flex flex-1 gap-3 p-4">
      <div className="w-11 shrink-0 text-center leading-none" aria-hidden="true">
        <p className="font-display text-2xl font-extrabold">{dayOf(o.date)}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-brand">{monthOf(o.date)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 font-bold leading-snug">{o.title}</h3>
        <p className="mt-0.5 text-xs text-muted">{dateText(o.date, o.endDate)}</p>
        <div className="mt-1.5"><Meta o={o} /></div>
      </div>
    </div>
  </Link>
)

const Occasions = () => {
  const navigate = useNavigate()
  const scope = useSocietyScope()
  const [kind, setKind] = useState('')
  const [year, setYear] = useState('')
  const [adding, setAdding] = useState(false)
  // Load everything once and filter here, so the chips and years always reflect what exists.
  const { data, loading, error, reload } = useApi('/occasions', { params: { ...scope.params, limit: 100 }, enabled: scope.ready })
  const all = data?.occasions || []
  const canAdd = !!data?.canAdd

  const years = useMemo(() => [...new Set(all.map((o) => yearOf(o.date)))].sort().reverse(), [all])
  const kinds = useMemo(() => KINDS.filter(([k]) => all.some((o) => o.kind === k)), [all])
  const shown = all.filter((o) => (!kind || o.kind === kind) && (!year || yearOf(o.date) === year))
  const [first, ...rest] = shown
  const filtering = !!(kind || year)

  const addButton = canAdd && (
    <button className="btn-primary" onClick={() => setAdding(true)}>
      <FiPlus size={16} /> Add occasion
    </button>
  )

  return (
    <>
      <PageHeader title="Occasions" subtitle="Festivals, celebrations and get-togethers in your society, with photos to look back on." action={addButton} />
      {scope.picker}

      {(kinds.length > 1 || years.length > 1) && (
        <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filter occasions">
          <Chip on={!kind} onClick={() => setKind('')}>All</Chip>
          {kinds.map(([k, label]) => <Chip key={k} on={kind === k} onClick={() => setKind(kind === k ? '' : k)}>{label}</Chip>)}
          {years.length > 1 && (
            <select className="input ml-auto w-auto py-1.5 text-sm" aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">All years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      )}

      {loading ? (
        <div className="panel"><ListSkeleton rows={4} /></div>
      ) : error ? (
        <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
      ) : !shown.length ? (
        <div className="panel">
          <EmptyState
            icon={FiCamera}
            title={filtering ? 'Nothing matches these filters' : 'No occasions yet'}
            text={filtering ? 'Try another type or year.' : canAdd ? 'Add the first one: a festival, a match, a get-together. Photos and a few details are enough.' : 'When the society office adds a festival or celebration, its photos will show up here.'}
            action={filtering ? <button className="btn-secondary" onClick={() => { setKind(''); setYear('') }}>Clear filters</button> : canAdd ? <button className="btn-primary" onClick={() => setAdding(true)}>Add occasion</button> : null}
          />
        </div>
      ) : (
        <>
          <Featured o={first} />
          {rest.length > 0 && (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((o) => <li key={o._id} className="min-w-0"><Card o={o} /></li>)}
            </ul>
          )}
        </>
      )}

      {adding && (
        <OccasionForm
          open
          societyParams={scope.params}
          onClose={() => setAdding(false)}
          onSaved={(o) => { setAdding(false); reload(); navigate(`/occasions/${o._id}`) }}
        />
      )}
    </>
  )
}

export default Occasions
