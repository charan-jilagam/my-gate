import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowLeft, FiPlus, FiSave, FiX } from 'react-icons/fi'
import toast from 'react-hot-toast'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useCategories from '../hooks/useCategories'
import { ErrorState, Field, ListSkeleton, Spinner, errorMessage } from '../components/ui'
import { categoryIcon, dayLabel, WEEKDAYS } from '../utils/services'

const SLOT_LENGTHS = [30, 60, 90, 120, 180]
const defaultWeek = () => [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: day !== 0, start: '09:00', end: '18:00' }))
const EMPTY = {
  categories: [],
  bio: '',
  experienceYears: 0,
  visitCharge: 0,
  priceNote: '',
  slotMinutes: 60,
  weeklySchedule: defaultWeek(),
  breakTime: { enabled: false, start: '13:00', end: '14:00' },
  timeOff: [],
  minNoticeMinutes: 60,
  maxAdvanceDays: 14,
  acceptingJobs: true,
  autoAccept: false
}

const Card = ({ title, hint, children }) => (
  <section className="panel p-5">
    <h2 className="text-base font-bold">{title}</h2>
    {hint && <p className="mb-3 mt-0.5 text-sm text-muted">{hint}</p>}
    <div className={hint ? '' : 'mt-3'}>{children}</div>
  </section>
)

const WorkSetup = () => {
  const { categories } = useCategories()
  const me = useApi('/services/me', { live: false })
  const [form, setForm] = useState(EMPTY)
  const [off, setOff] = useState('')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!me.data || loaded) return
    const p = me.data.profile
    if (p) {
      setForm({
        ...EMPTY,
        ...p,
        weeklySchedule: defaultWeek().map((d) => p.weeklySchedule.find((w) => w.day === d.day) || d),
        breakTime: { ...EMPTY.breakTime, ...p.breakTime },
        timeOff: p.timeOff || []
      })
    }
    setLoaded(true)
  }, [me.data, loaded])

  if (me.loading) return <div className="panel"><ListSkeleton rows={5} /></div>
  if (me.error) return <div className="panel"><ErrorState message={me.error} onRetry={me.reload} /></div>

  const today = me.data.today
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setDay = (day, patch) => set({ weeklySchedule: form.weeklySchedule.map((d) => (d.day === day ? { ...d, ...patch } : d)) })
  const toggleCat = (key) =>
    set({ categories: form.categories.includes(key) ? form.categories.filter((c) => c !== key) : form.categories.length < 5 ? [...form.categories, key] : form.categories })

  const addOff = () => {
    if (!off || off < today || form.timeOff.some((t) => t.date === off)) return
    set({ timeOff: [...form.timeOff, { date: off, reason: '' }].sort((a, b) => a.date.localeCompare(b.date)) })
    setOff('')
  }

  const save = async (e) => {
    e.preventDefault()
    setProblem('')
    if (!form.categories.length) return setProblem('Choose at least one service you offer.')
    setSaving(true)
    try {
      const body = {
        categories: form.categories,
        bio: form.bio,
        experienceYears: Number(form.experienceYears) || 0,
        visitCharge: Number(form.visitCharge) || 0,
        priceNote: form.priceNote,
        slotMinutes: Number(form.slotMinutes),
        weeklySchedule: form.weeklySchedule,
        breakTime: form.breakTime,
        timeOff: form.timeOff,
        minNoticeMinutes: Number(form.minNoticeMinutes),
        maxAdvanceDays: Number(form.maxAdvanceDays),
        acceptingJobs: form.acceptingJobs,
        autoAccept: form.autoAccept
      }
      const { data } = await api.put('/services/me', body)
      toast.success(data.message || 'Saved')
      me.reload()
    } catch (err) {
      const m = errorMessage(err)
      setProblem(m)
      toast.error(m)
    } finally {
      setSaving(false)
    }
  }

  const time = (value, onChange, label) => (
    <input type="time" className="input w-auto" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  )

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl space-y-5">
      <Link to="/work" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <FiArrowLeft size={15} /> My jobs
      </Link>
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{me.data.profile ? 'Your schedule and services' : 'Set up your service profile'}</h1>
        <p className="mt-1 text-sm text-muted">Residents pick from the free slots this creates. Change it any time. Existing bookings stay as they are.</p>
      </div>

      <Card title="What you do" hint="Choose up to five.">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const Icon = categoryIcon(c.key)
            const on = form.categories.includes(c.key)
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCat(c.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface hover:border-brand'}`}
              >
                <Icon size={16} /> {c.label}
              </button>
            )
          })}
        </div>
      </Card>

      <Card title="About you">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Introduction" htmlFor="ws-bio" className="sm:col-span-2" hint="Neighbours read this before booking.">
            <textarea id="ws-bio" rows={3} maxLength={500} className="input" value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
          </Field>
          <Field label="Years of experience" htmlFor="ws-exp">
            <input id="ws-exp" type="number" min="0" max="60" className="input" value={form.experienceYears} onChange={(e) => set({ experienceYears: e.target.value })} />
          </Field>
          <Field label="Visit charge (rupees)" htmlFor="ws-fee" hint="0 if you do not charge to come and look.">
            <input id="ws-fee" type="number" min="0" className="input" value={form.visitCharge} onChange={(e) => set({ visitCharge: e.target.value })} />
          </Field>
          <Field label="Price note" htmlFor="ws-note" className="sm:col-span-2">
            <input id="ws-note" maxLength={160} className="input" placeholder="For example: Parts and materials extra" value={form.priceNote} onChange={(e) => set({ priceNote: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card title="Working hours">
        <ul className="divide-y divide-line">
          {form.weeklySchedule.map((d) => (
            <li key={d.day} className="flex flex-wrap items-center gap-3 py-2.5">
              <label className="flex w-32 cursor-pointer items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={d.enabled} onChange={(e) => setDay(d.day, { enabled: e.target.checked })} />
                {WEEKDAYS[d.day]}
              </label>
              {d.enabled ? (
                <span className="flex items-center gap-2 text-sm">
                  {time(d.start, (v) => setDay(d.day, { start: v }), `${WEEKDAYS[d.day]} opens`)} to {time(d.end, (v) => setDay(d.day, { end: v }), `${WEEKDAYS[d.day]} closes`)}
                </span>
              ) : (
                <span className="text-sm text-muted">Day off</span>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="Slot length" htmlFor="ws-slot">
            <select id="ws-slot" className="input" value={form.slotMinutes} onChange={(e) => set({ slotMinutes: Number(e.target.value) })}>
              {SLOT_LENGTHS.map((n) => <option key={n} value={n}>{n >= 60 ? `${n / 60} ${n === 60 ? 'hour' : 'hours'}`.replace('1.5 hours', '1.5 hours') : `${n} minutes`}</option>)}
            </select>
          </Field>
          <div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.breakTime.enabled} onChange={(e) => set({ breakTime: { ...form.breakTime, enabled: e.target.checked } })} />
              Daily break
            </label>
            {form.breakTime.enabled && (
              <span className="mt-2 flex items-center gap-2 text-sm">
                {time(form.breakTime.start, (v) => set({ breakTime: { ...form.breakTime, start: v } }), 'Break starts')} to {time(form.breakTime.end, (v) => set({ breakTime: { ...form.breakTime, end: v } }), 'Break ends')}
              </span>
            )}
          </div>
          <Field label="Minimum notice" htmlFor="ws-notice" hint="How far ahead a booking must be made.">
            <select id="ws-notice" className="input" value={form.minNoticeMinutes} onChange={(e) => set({ minNoticeMinutes: Number(e.target.value) })}>
              {[[0, 'None'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [720, '12 hours'], [1440, '1 day']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Bookable up to" htmlFor="ws-adv">
            <select id="ws-adv" className="input" value={form.maxAdvanceDays} onChange={(e) => set({ maxAdvanceDays: Number(e.target.value) })}>
              {[7, 14, 30, 60].map((n) => <option key={n} value={n}>{n} days ahead</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Days off" hint="Residents cannot book these days.">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input w-auto" aria-label="Add a day off" min={today} value={off} onChange={(e) => setOff(e.target.value)} />
          <button type="button" className="btn-secondary" onClick={addOff} disabled={!off}>
            <FiPlus size={15} /> Add
          </button>
        </div>
        {form.timeOff.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {form.timeOff.map((t) => (
              <li key={t.date} className="tag-neutral gap-1.5">
                {dayLabel(t.date)}
                <button type="button" aria-label={`Remove ${dayLabel(t.date)}`} onClick={() => set({ timeOff: form.timeOff.filter((x) => x.date !== t.date) })}>
                  <FiX size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Booking settings">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1" checked={form.autoAccept} onChange={(e) => set({ autoAccept: e.target.checked })} />
          <span>
            <span className="block text-sm font-semibold">Confirm bookings automatically</span>
            <span className="block text-xs text-muted">Otherwise you accept or decline each request.</span>
          </span>
        </label>
        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1" checked={form.acceptingJobs} onChange={(e) => set({ acceptingJobs: e.target.checked })} />
          <span>
            <span className="block text-sm font-semibold">Taking bookings</span>
            <span className="block text-xs text-muted">Turn off to pause without losing your schedule.</span>
          </span>
        </label>
      </Card>

      <div className="panel sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-between gap-3 p-4 lg:bottom-4">
        <p role="alert" className="text-sm font-medium text-danger">{problem}</p>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Spinner className="h-4 w-4" /> : <FiSave size={16} />} Save
        </button>
      </div>
    </form>
  )
}

export default WorkSetup
