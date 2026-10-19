import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FiClock, FiRepeat, FiSearch, FiShield, FiStar, FiThumbsUp, FiTool } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import useApi from '../hooks/useApi'
import useCategories from '../hooks/useCategories'
import useDebounced from '../hooks/useDebounced'
import RequestCard from '../components/RequestCard'
import { Avatar, EmptyState, ErrorState, ListSkeleton, PageHeader, Stars } from '../components/ui'
import { categoryIcon, dayLabel, rupees, timeLabel } from '../utils/services'

const SORTS = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'soonest', label: 'Soonest available' },
  { key: 'rating', label: 'Best rated' },
  { key: 'price', label: 'Lowest visit charge' }
]

const ProviderCard = ({ p, category }) => {
  const { labelOf } = useCategories()
  const next = p.nextAvailable
  return (
    <li>
      <Link
        to={`/services/providers/${p._id}${category ? `?category=${category}` : ''}`}
        className="panel flex gap-4 p-4 transition-shadow hover:shadow-pop focus-visible:shadow-pop"
      >
        <Avatar name={p.name} src={p.photo} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-base font-bold">{p.name}</h3>
            {p.badge === 'top_rated' && <span className="tag-ok"><FiStar size={12} /> Top rated</span>}
            {p.badge === 'recommended' && <span className="tag-ok"><FiThumbsUp size={12} /> Recommended</span>}
            {p.badge === 'new' && <span className="tag-neutral">New</span>}
            {p.bookedBefore && <span className="tag-info"><FiRepeat size={12} /> You booked before</span>}
            {p.isVerified && (
              <span className="tag-ok" title="Identity checked by your society office">
                <FiShield size={12} /> Verified
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <Stars value={p.rating.avg} count={p.rating.count} />
            {p.jobsCompleted > 0 && <span>{p.jobsCompleted} jobs done</span>}
            {p.experienceYears > 0 && <span>{p.experienceYears} yrs experience</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.categories.map((c) => (
              <span key={c} className="tag-neutral">{labelOf(c)}</span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">{p.visitCharge ? `${rupees(p.visitCharge)} visit` : 'No visit charge'}</span>
            {next ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-ok-soft px-2 py-1 text-xs font-semibold text-ok">
                <FiClock size={13} /> Next free: {dayLabel(next.date)}, {timeLabel(next.start)}
              </span>
            ) : (
              <span className="rounded-md bg-sunken px-2 py-1 text-xs font-semibold text-muted">{p.acceptingJobs ? 'No free slots soon' : 'Not taking bookings'}</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  )
}

const Services = () => {
  const { isResident } = useAuth()
  const [params, setParams] = useSearchParams()
  const category = params.get('category') || ''
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recommended')
  const q = useDebounced(query.trim(), 300)
  const { categories, loading: loadingCategories } = useCategories()

  const providers = useApi('/services/providers', {
    params: { category: category || undefined, q: q || undefined, sort },
    select: (d) => d.providers || []
  })
  const upcoming = useApi('/service-requests', { params: { scope: 'upcoming', limit: 3 }, enabled: isResident, select: (d) => d.requests || [] })

  const pick = (key) => {
    const next = new URLSearchParams(params)
    if (key) next.set('category', key)
    else next.delete('category')
    setParams(next, { replace: true })
  }

  const chosen = categories.find((c) => c.key === category)

  return (
    <>
      <PageHeader
        title="Home services"
        subtitle="Electricians, plumbers, carpenters and more, listed by your society. Pick someone, choose a free slot and you are booked."
        action={
          isResident && (
            <Link to="/services/requests" className="btn-secondary">
              My bookings
            </Link>
          )
        }
      />

      {isResident && upcoming.data?.length > 0 && (
        <section className="mb-6" aria-labelledby="up-h">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="up-h" className="text-base font-bold">Coming up</h2>
            <Link to="/services/requests" className="text-sm font-semibold text-brand hover:underline">See all</Link>
          </div>
          <ul className="space-y-2">
            {upcoming.data.map((r) => (
              <RequestCard key={r._id} request={r} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="cat-h" className="mb-5">
        <h2 id="cat-h" className="sr-only">Choose a service</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {loadingCategories
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[84px]" />)
            : categories.map((c) => {
                const Icon = categoryIcon(c.key)
                const on = category === c.key
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(on ? '' : c.key)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center text-xs font-semibold transition-colors sm:text-sm ${
                      on ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface hover:border-brand'
                    }`}
                  >
                    <Icon size={26} className={on ? '' : 'text-brand'} />
                    {c.label}
                  </button>
                )
              })}
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            className="input pl-9"
            type="search"
            placeholder={chosen ? `Search ${chosen.label.toLowerCase()} by name` : 'Search by name or trade'}
            aria-label="Search vendors"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="input w-auto" aria-label="Sort vendors" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {providers.loading ? (
        <div className="panel"><ListSkeleton rows={4} /></div>
      ) : providers.error ? (
        <div className="panel"><ErrorState message={providers.error} onRetry={providers.reload} /></div>
      ) : !providers.data?.length ? (
        <div className="panel">
          <EmptyState
            icon={FiTool}
            title={chosen ? `No ${chosen.label.toLowerCase()} listed yet` : 'No vendors found'}
            text={q ? 'Try a different name or clear the search.' : 'Ask your society office to invite trusted vendors. Vendors can sign up as "Vendor" and are approved by the office.'}
            action={category || q ? <button className="btn-secondary" onClick={() => { pick(''); setQuery('') }}>Show all vendors</button> : null}
          />
        </div>
      ) : (
        <ul className="space-y-3" aria-live="polite">
          {providers.data.map((p) => (
            <ProviderCard key={p._id} p={p} category={category && p.categories.includes(category) ? category : ''} />
          ))}
        </ul>
      )}
    </>
  )
}

export default Services
