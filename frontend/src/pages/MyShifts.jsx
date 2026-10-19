import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiLogIn, FiLogOut, FiMoon, FiClock, FiRepeat, FiMapPin } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Spinner, StatusTag, Tabs, Stat, Field, errorMessage } from '../components/ui'
import { dayLabel, timeLabel } from '../utils/services'
import { tryPosition, locationPermission } from '../utils/location'
import { keepAwakePreferred } from '../components/DutyTracker'
import { ShiftRows } from './Attendance'

const POST = { main_gate: 'Main gate', tower_gate: 'Tower gate', patrol: 'Patrol', control_room: 'Control room', housekeeping: 'Housekeeping', garden: 'Garden', maintenance: 'Maintenance', other: 'Other' }
const PHASE = { scheduled: ['on_the_way', 'Scheduled'], on_duty: ['active', 'On duty'], completed: ['checked_out', 'Completed'], missed: ['rejected', 'Missed'] }
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDER = [1, 2, 3, 4, 5, 6, 0]

const Shifts = () => {
  const { t } = useT()
  const { data, loading, error, reload } = useApi('/roster/mine')
  const { busy, run } = useAction(reload)
  const [perm, setPerm] = useState('unknown')
  const shifts = data?.shifts || []
  useEffect(() => { locationPermission().then(setPerm) }, [])

  const clockIn = async (s) => {
    // The phone's position is attached so the office knows you reached your post. Clock-in still works without it.
    const pos = await tryPosition({ timeout: 12000 })
    const res = await run(s._id, async () => {
      const r = await api.post(`/roster/${s._id}/clock-in`, pos || {})
      if (r.data?.message) toast(r.data.message, { icon: r.data.location?.outside ? '⚠️' : '✅', duration: 6000 })
      return r
    })
    if (res && !pos) toast(t('You are on duty. Location was not shared, so the office cannot see where you are.'), { icon: '📍', duration: 6000 })
  }
  const clockOut = async (s) => {
    const pos = await tryPosition({ timeout: 8000 })
    await run(s._id, () => api.post(`/roster/${s._id}/clock-out`, pos || {}), 'Shift finished. Thank you!')
  }

  if (loading) return <div className="panel"><ListSkeleton rows={3} /></div>
  if (error) return <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
  return (
    <>
      {perm === 'denied' && <p className="mb-3 rounded-lg bg-amber-soft px-4 py-3 text-sm">{t('Location is blocked for this website. Turn it on in your browser settings so the office can see you are at your post.')}</p>}
      {!shifts.length ? (
        <div className="panel"><EmptyState icon={FiClock} title="No shifts" text="You have no shifts coming up. The office plans the roster." /></div>
      ) : (
        <ul className="space-y-3">
          {shifts.map((s) => {
            const today = s.date === data.today
            return (
              <li key={s._id} data-item-id={s._id} className={`panel p-4 ${today || s.phase === 'on_duty' ? 'ring-2 ring-brand/40' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg font-bold">{dayLabel(s.date)}{today ? ` · ${t('Today')}` : ''}</p>
                  <StatusTag status={PHASE[s.phase][0]} label={PHASE[s.phase][1]} />
                </div>
                <p className="mt-1 text-sm">{timeLabel(s.startTime)} to {timeLabel(s.endTime)} · {s.postName || POST[s.post] || s.post}{s.overnight && <span className="ml-2 inline-flex items-center gap-1 text-muted"><FiMoon size={12} /> overnight</span>}</p>
                {s.note && <p className="text-sm text-muted">{s.note}</p>}
                {(s.clockInAt || s.clockOutAt) && <p className="mt-1 text-xs text-muted">{s.clockInAt && `Clocked in ${fmtTime(s.clockInAt)}`}{s.clockOutAt && ` · out ${fmtTime(s.clockOutAt)}`}{s.clockInOutside && <span className="ml-1 inline-flex items-center gap-1 text-danger"><FiMapPin size={11} /> {s.clockInDistanceM} m from post</span>}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.canClockIn && <button className="btn-primary" disabled={!!busy} onClick={() => clockIn(s)}>{busy === s._id ? <Spinner className="h-4 w-4" /> : <FiLogIn size={16} />} {t('Clock in')}</button>}
                  {s.canClockOut && <button className="btn-secondary" disabled={!!busy} onClick={() => clockOut(s)}>{busy === s._id ? <Spinner className="h-4 w-4" /> : <FiLogOut size={16} />} {t('Clock out')}</button>}
                  {s.phase === 'scheduled' && !s.clockInAt && <Link to="/swaps" className="btn-ghost"><FiRepeat size={15} /> {t('Ask to swap')}</Link>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <KeepAwake />
      <p className="mt-4 text-xs text-muted">{t('When you clock in, your phone shares its location with the office until you clock out. This works while the app is open on your screen.')}</p>
    </>
  )
}

const KeepAwake = () => {
  const { t } = useT()
  const [on, setOn] = useState(keepAwakePreferred())
  if (!navigator.wakeLock?.request) return null
  const toggle = (v) => { setOn(v); try { localStorage.setItem('keepAwake', v ? '1' : '0') } catch (e) { /* ignore */ } }
  return <label className="panel mt-4 flex items-center gap-3 p-4 text-sm"><input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} /> <span><b>{t('Keep my screen on while on duty')}</b><br /><span className="text-muted">{t('Helps the office keep seeing your location. Uses more battery.')}</span></span></label>
}

// Which days and hours the guard can work. The automatic roster only uses these.
const Availability = () => {
  const { t } = useT()
  const { data, loading, error, reload } = useApi('/guards/availability/me', { live: false })
  const [weekly, setWeekly] = useState(null)
  const [offDates, setOffDates] = useState([])
  const [note, setNote] = useState('')
  const [newOff, setNewOff] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (data) { setWeekly(data.weekly); setOffDates(data.offDates || []); setNote(data.note || '') } }, [data])
  if (loading || !weekly) return error ? <div className="panel"><ErrorState message={error} onRetry={reload} /></div> : <div className="panel"><ListSkeleton rows={4} /></div>
  const setDay = (day, patch) => setWeekly(weekly.map((w) => (w.day === day ? { ...w, ...patch } : w)))
  const save = async () => {
    setSaving(true)
    try { await api.put('/guards/availability/me', { weekly, offDates, note }); toast.success(t('Your availability is saved')); reload() } catch (e) { toast.error(errorMessage(e)) } finally { setSaving(false) }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{data.isSet ? t('The office plans your shifts only on the days and hours below.') : t('You have not set this yet, so you can be given a shift at any time. Set it so shifts suit you.')}</p>
      <ul className="panel divide-y divide-edge">
        {ORDER.map((d) => {
          const w = weekly.find((x) => x.day === d) || { day: d, available: true, start: '00:00', end: '23:59' }
          return (
            <li key={d} className="px-4 py-3">
              <label className="flex items-center gap-3 font-semibold"><input type="checkbox" checked={w.available} onChange={(e) => setDay(d, { available: e.target.checked })} /> {t(DAYS[d])} {!w.available && <span className="text-xs font-normal text-muted">· {t('day off')}</span>}</label>
              {w.available && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label="Free from"><input type="time" className="input" value={w.start} onChange={(e) => setDay(d, { start: e.target.value })} /></Field>
                  <Field label="Free until"><input type="time" className="input" value={w.end} onChange={(e) => setDay(d, { end: e.target.value })} /></Field>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="panel p-4">
        <p className="label">{t('Days off (leave, function, travel)')}</p>
        <div className="flex gap-2"><input type="date" className="input" value={newOff} onChange={(e) => setNewOff(e.target.value)} /><button className="btn-secondary" disabled={!newOff} onClick={() => { setOffDates([...new Set([...offDates, newOff])].sort()); setNewOff('') }}>{t('Add')}</button></div>
        {offDates.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{offDates.map((o) => <button key={o} className="tag-neutral" onClick={() => setOffDates(offDates.filter((x) => x !== o))}>{dayLabel(o)} ✕</button>)}</div>}
      </div>
      <Field label="Note for the office (optional)"><input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="btn-primary w-full" disabled={saving} onClick={save}>{saving && <Spinner className="h-4 w-4" />} {t('Save my availability')}</button>
    </div>
  )
}

const MyAttendance = () => {
  const { data, loading, error, reload } = useApi('/guards/attendance/me')
  if (loading) return <div className="panel"><ListSkeleton rows={4} /></div>
  if (error) return <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
  const s = data.summary
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Shifts attended" value={s.present} hint={`of ${s.due}`} />
        <Stat label="On time" value={s.onTime} />
        <Stat label="Late" value={s.late} />
        <Stat label="Hours worked" value={s.hoursWorked} />
      </div>
      {data.shifts.length ? <div className="panel px-4"><ShiftRows rows={[...data.shifts].reverse()} /></div> : <div className="panel"><EmptyState icon={FiClock} title="No shifts in the last week" text="Your attendance shows here." /></div>}
    </>
  )
}

const MyShiftsPage = () => {
  const [tab, setTab] = useState('shifts')
  return (
    <>
      <PageHeader title="My shifts" subtitle="Your duty roster. Clock in when you start and out when you hand over." />
      <Tabs items={[{ key: 'shifts', label: 'Shifts' }, { key: 'free', label: 'When I can work' }, { key: 'attendance', label: 'My attendance' }]} value={tab} onChange={setTab} />
      {tab === 'shifts' ? <Shifts /> : tab === 'free' ? <Availability /> : <MyAttendance />}
    </>
  )
}

export default MyShiftsPage
