import { useState } from 'react'
import { FiChevronDown, FiChevronUp, FiCheckCircle, FiPhone, FiMapPin } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import useApi from '../hooks/useApi'
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Stat, StatusTag, Avatar } from '../components/ui'
import { dayLabel, timeLabel } from '../utils/services'

const STATUS = {
  scheduled: ['on_the_way', 'Upcoming'],
  on_duty: ['active', 'On duty'],
  on_duty_late: ['pending', 'On duty (late)'],
  completed: ['checked_out', 'Done'],
  completed_late: ['pending', 'Done (late)'],
  missed: ['rejected', 'Did not come']
}
const fmt = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')
const iso = (d) => d.toISOString().slice(0, 10)
const RANGES = [['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days']]

export const ShiftRows = ({ rows }) => (
  <ul className="divide-y divide-edge">
    {rows.map((r) => (
      <li key={r._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
        <span className="w-24 font-semibold">{dayLabel(r.date)}</span>
        <span className="text-muted">{timeLabel(r.startTime)} – {timeLabel(r.endTime)}</span>
        <StatusTag status={STATUS[r.status]?.[0] || 'neutral'} label={STATUS[r.status]?.[1] || r.status} />
        <span className="w-full text-xs text-muted sm:w-auto sm:flex-1 sm:text-right">
          {r.clockInAt ? `In ${fmt(r.clockInAt)}${r.clockOutAt ? ` · out ${fmt(r.clockOutAt)}` : ''}${r.hoursWorked ? ` · ${r.hoursWorked} h` : ''}` : ''}
          {r.lateMinutes > 0 && ` · ${r.lateMinutes} min late`}
          {r.outsideAtClockIn && <span className="ml-1 inline-flex items-center gap-1 text-danger"><FiMapPin size={11} /> clocked in {r.distanceAtClockIn} m from post</span>}
        </span>
      </li>
    ))}
  </ul>
)

const Attendance = () => {
  const { t } = useT()
  const [range, setRange] = useState('7')
  const [open, setOpen] = useState(null)
  const to = iso(new Date())
  const from = iso(new Date(Date.now() - (Number(range) - 1) * 86400000))
  const { data, loading, error, reload } = useApi('/guards/attendance', { params: { from, to } })
  const tot = data?.totals

  return (
    <>
      <PageHeader title="Guard attendance" subtitle="Who came on time, who was late, and who did not come." />
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGES.map(([k, l]) => (
          <button key={k} onClick={() => setRange(k)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${range === k ? 'bg-brand text-brand-ink ring-brand' : 'bg-surface ring-edge'}`}>{t(l)}</button>
        ))}
      </div>
      {loading ? <div className="panel"><ListSkeleton rows={4} /></div> : error ? <div className="panel"><ErrorState message={error} onRetry={reload} /></div> : !data?.people?.length ? (
        <div className="panel"><EmptyState icon={FiCheckCircle} title="No shifts in this time" text="Attendance appears here once shifts are planned in the roster." /></div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Came" value={tot.present} hint={`of ${tot.due} shifts`} />
            <Stat label="On time" value={tot.onTime} />
            <Stat label="Late" value={tot.late} tone={tot.late ? 'warn' : undefined} />
            <Stat label="Did not come" value={tot.missed} tone={tot.missed ? 'warn' : undefined} />
          </div>
          <ul className="space-y-3">
            {data.people.map((p) => {
              const isOpen = open === p.userId
              return (
                <li key={p.userId} className="panel">
                  <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(isOpen ? null : p.userId)} aria-expanded={isOpen}>
                    <Avatar name={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block text-xs text-muted">{p.present} of {p.due} shifts · {p.hoursWorked} h{p.late ? ` · ${p.late} late` : ''}{p.missed ? ` · ${p.missed} missed` : ''}</span>
                    </span>
                    {p.attendancePct !== null && <span className={`font-display text-lg font-bold ${p.attendancePct < 80 ? 'text-danger' : ''}`}>{p.attendancePct}%</span>}
                    {isOpen ? <FiChevronUp /> : <FiChevronDown />}
                  </button>
                  {isOpen && (
                    <div className="border-t border-edge px-4 pb-2">
                      <ShiftRows rows={p.shifts} />
                      {p.phone && <a className="btn-secondary btn-sm my-3" href={`tel:${p.phone}`}><FiPhone size={14} /> {t('Call')} {p.name}</a>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}

export default Attendance
