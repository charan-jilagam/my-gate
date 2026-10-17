import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiCalendar, FiPause, FiPlay, FiSettings, FiTool } from 'react-icons/fi'
import toast from 'react-hot-toast'
import api from '../services/api'
import useApi from '../hooks/useApi'
import RequestCard from '../components/RequestCard'
import RequestActions from '../components/RequestActions'
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Stat, errorMessage } from '../components/ui'
import { dayLabel, rupees } from '../utils/services'

const Section = ({ id, title, count, children }) => (
  <section className="mb-6" aria-labelledby={id}>
    <h2 id={id} className="mb-2 flex items-center gap-2 text-base font-bold">
      {title}
      {count > 0 && <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-amber px-1 text-[11px] font-bold text-[#1b1400]">{count}</span>}
    </h2>
    {children}
  </section>
)

const WorkHome = () => {
  const me = useApi('/services/me')
  const jobs = useApi('/service-requests', { params: { scope: 'upcoming', limit: 100 }, select: (d) => d.requests || [] })
  const [busy, setBusy] = useState(false)

  if (me.loading) return <div className="panel"><ListSkeleton rows={4} /></div>
  if (me.error) return <div className="panel"><ErrorState message={me.error} onRetry={me.reload} /></div>

  const { profile, stats, today } = me.data
  if (!profile) {
    return (
      <>
        <PageHeader title="My jobs" />
        <div className="panel">
          <EmptyState
            icon={FiTool}
            title="Set up your service profile"
            text="Choose what you do, your working hours and your visit charge. Residents in your society can then book your free slots."
            action={<Link to="/work/setup" className="btn-primary">Set up now</Link>}
          />
        </div>
      </>
    )
  }

  const list = jobs.data || []
  const awaiting = list.filter((r) => r.status === 'requested')
  const todays = list.filter((r) => r.date === today && r.status !== 'requested')
  const later = list.filter((r) => r.date !== today && r.status !== 'requested')

  const togglePause = async () => {
    setBusy(true)
    try {
      await api.put('/services/me', { acceptingJobs: !profile.acceptingJobs })
      toast.success(profile.acceptingJobs ? 'Bookings paused' : 'You are taking bookings again')
      me.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const refresh = () => {
    jobs.reload()
    me.reload()
  }

  return (
    <>
      <PageHeader
        title="My jobs"
        subtitle={dayLabel(today)}
        action={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={togglePause} disabled={busy}>
              {profile.acceptingJobs ? <FiPause size={15} /> : <FiPlay size={15} />}
              {profile.acceptingJobs ? 'Pause bookings' : 'Resume bookings'}
            </button>
            <Link to="/work/setup" className="btn-secondary">
              <FiSettings size={15} /> Schedule
            </Link>
          </div>
        }
      />

      {!profile.isActive && (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          The society office has hidden your listing, so residents cannot book you. Please contact them.
        </p>
      )}
      {profile.isActive && !profile.acceptingJobs && (
        <p className="mb-4 rounded-md bg-sunken px-4 py-3 text-sm">Bookings are paused. Residents cannot book you until you resume.</p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today" value={stats.today} hint="jobs" />
        <Stat label="Need your reply" value={stats.awaiting} tone={stats.awaiting ? 'warn' : undefined} />
        <Stat label="Upcoming" value={stats.upcoming} />
        <Stat label="This month" value={rupees(stats.monthEarnings)} hint={`${stats.monthJobs} jobs done`} />
      </div>

      {jobs.loading ? (
        <div className="panel"><ListSkeleton rows={3} /></div>
      ) : jobs.error ? (
        <div className="panel"><ErrorState message={jobs.error} onRetry={jobs.reload} /></div>
      ) : (
        <>
          {awaiting.length > 0 && (
            <Section id="aw-h" title="Waiting for your reply" count={awaiting.length}>
              <ul className="space-y-2">
                {awaiting.map((r) => (
                  <RequestCard key={r._id} request={r}>
                    <RequestActions request={r} onDone={refresh} size="sm" />
                  </RequestCard>
                ))}
              </ul>
            </Section>
          )}

          <Section id="td-h" title="Today" count={0}>
            {todays.length ? (
              <ul className="space-y-2">
                {todays.map((r) => (
                  <RequestCard key={r._id} request={r}>
                    <RequestActions request={r} onDone={refresh} size="sm" />
                  </RequestCard>
                ))}
              </ul>
            ) : (
              <p className="panel px-4 py-5 text-sm text-muted">No jobs today.</p>
            )}
          </Section>

          {later.length > 0 && (
            <Section id="lt-h" title="Coming up">
              <ul className="space-y-2">
                {later.map((r) => (
                  <RequestCard key={r._id} request={r} />
                ))}
              </ul>
            </Section>
          )}

          <Link to="/services/requests" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
            <FiCalendar size={14} /> See past jobs
          </Link>
        </>
      )}
    </>
  )
}

export default WorkHome
