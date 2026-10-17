import { FiLogIn, FiLogOut, FiMoon, FiClock } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Spinner, StatusTag } from '../components/ui'
import { dayLabel, timeLabel } from '../utils/services'

const POST = { main_gate: 'Main gate', tower_gate: 'Tower gate', patrol: 'Patrol', control_room: 'Control room', housekeeping: 'Housekeeping', garden: 'Garden', maintenance: 'Maintenance', other: 'Other' }
const PHASE = { scheduled: ['on_the_way', 'Scheduled'], on_duty: ['active', 'On duty'], completed: ['checked_out', 'Completed'], missed: ['rejected', 'Missed'] }
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')

const MyShifts = () => {
  const { t } = useT()
  const { data, loading, error, reload } = useApi('/roster/mine')
  const { busy, run } = useAction(reload)
  const shifts = data?.shifts || []

  return (
    <>
      <PageHeader title="My shifts" subtitle="Your duty roster. Clock in when you start and out when you hand over." />
      {loading ? (
        <div className="panel"><ListSkeleton rows={3} /></div>
      ) : error ? (
        <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
      ) : !shifts.length ? (
        <div className="panel"><EmptyState icon={FiClock} title="No shifts" text="You have no shifts coming up. The office plans the roster." /></div>
      ) : (
        <ul className="space-y-3">
          {shifts.map((s) => {
            const today = s.date === data.today
            return (
              <li key={s._id} className={`panel p-4 ${today || s.phase === 'on_duty' ? 'ring-2 ring-brand/40' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg font-bold">{dayLabel(s.date)}{today ? ` · ${t('Today')}` : ''}</p>
                  <StatusTag status={PHASE[s.phase][0]} label={PHASE[s.phase][1]} />
                </div>
                <p className="mt-1 text-sm">{timeLabel(s.startTime)} to {timeLabel(s.endTime)} · {POST[s.post] || s.post}{s.overnight && <span className="ml-2 inline-flex items-center gap-1 text-muted"><FiMoon size={12} /> overnight</span>}</p>
                {s.note && <p className="text-sm text-muted">{s.note}</p>}
                {(s.clockInAt || s.clockOutAt) && <p className="mt-1 text-xs text-muted">{s.clockInAt && `Clocked in ${fmtTime(s.clockInAt)}`}{s.clockOutAt && ` · out ${fmtTime(s.clockOutAt)}`}</p>}
                <div className="mt-3 flex gap-2">
                  {s.canClockIn && <button className="btn-primary" disabled={!!busy} onClick={() => run(s._id, () => api.post(`/roster/${s._id}/clock-in`), 'You are on duty.')}>{busy === s._id ? <Spinner className="h-4 w-4" /> : <FiLogIn size={16} />} {t('Clock in')}</button>}
                  {s.canClockOut && <button className="btn-secondary" disabled={!!busy} onClick={() => run(s._id, () => api.post(`/roster/${s._id}/clock-out`), 'Shift finished. Thank you!')}>{busy === s._id ? <Spinner className="h-4 w-4" /> : <FiLogOut size={16} />} {t('Clock out')}</button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export default MyShifts
