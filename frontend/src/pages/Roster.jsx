import { useMemo, useState } from 'react'
import { FiChevronLeft, FiChevronRight, FiClipboard, FiMoon, FiPlus, FiTrash2, FiZap, FiAlertTriangle } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useHighlight } from '../hooks/useHighlight'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { useSocietyScope } from '../components/SocietyPicker'
import { ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, Modal, PageHeader, Spinner, StatusTag } from '../components/ui'
import { dayLabel, timeLabel } from '../utils/services'

const POSTS = [['main_gate', 'Main gate'], ['tower_gate', 'Tower gate'], ['patrol', 'Patrol'], ['control_room', 'Control room'], ['housekeeping', 'Housekeeping'], ['garden', 'Garden'], ['maintenance', 'Maintenance'], ['other', 'Other']]
const postLabel = (k) => POSTS.find((p) => p[0] === k)?.[1] || k
const PHASE = { scheduled: ['on_the_way', 'Scheduled'], on_duty: ['active', 'On duty'], completed: ['checked_out', 'Completed'], missed: ['rejected', 'Missed'] }

const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const todayLocal = () => new Date().toLocaleDateString('en-CA')
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')

const ROLE = { security: 'Guard', guard_admin: 'Guard head', staff: 'Staff' }

// Plans shifts for a range of days from the posts and each guard's availability. First shows a preview; nothing is saved until the admin confirms.
const AutoPlan = ({ open, onClose, defaultFrom, scope, onApplied }) => {
  const { t } = useT()
  const [from, setFrom] = useState(defaultFrom)
  const [days, setDays] = useState(7)
  const [includeHead, setIncludeHead] = useState(false)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')
  const [postIds, setPostIds] = useState(null)
  const posts = useApi('/guards/posts', { params: scope.params, enabled: open && scope.ready, live: false, select: (d) => (d.posts || []).filter((p) => p.isActive !== false && (p.slots || []).length) })
  const chosen = postIds || (posts.data || []).map((p) => p._id)
  const to = addDays(from, days - 1)
  const body = (apply) => ({ from, to, apply, includeHead, postIds: chosen, ...(scope.societyId ? { societyId: scope.societyId } : {}) })
  const go = async (apply) => {
    setBusy(apply ? 'apply' : 'preview'); setErr('')
    try {
      const { data } = await api.post('/guards/allocate', body(apply))
      if (apply) { onApplied(data.message || 'Roster created'); setPlan(null) } else setPlan(data)
    } catch (e) { setErr(e.response?.data?.message || e.response?.data?.errors?.[0]?.msg || 'Could not plan the roster.') } finally { setBusy(null) }
  }
  const close = () => { setPlan(null); setErr(''); onClose() }
  return (
    <Modal open={open} onClose={close} title="Plan the roster automatically" size="lg"
      footer={plan ? (
        <>
          <button className="btn-secondary" onClick={() => setPlan(null)}>{t('Back')}</button>
          <button className="btn-primary" disabled={!!busy || !plan.planned} onClick={() => go(true)}>{busy === 'apply' && <Spinner className="h-4 w-4" />} {t('Create these shifts')} ({plan.planned})</button>
        </>
      ) : (
        <>
          <button className="btn-secondary" onClick={close}>{t('Cancel')}</button>
          <button className="btn-primary" disabled={!!busy || !chosen.length} onClick={() => go(false)}>{busy === 'preview' && <Spinner className="h-4 w-4" />} {t('Show me the plan')}</button>
        </>
      )}>
      {!plan ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('We give each shift to a guard who is free at that time, share the hours fairly, and make sure they get rest. You can check the plan before anything is saved.')}</p>
          {posts.data && !posts.data.length && (
            <p className="rounded-md bg-amber-soft px-4 py-3 text-sm">{t('No guard posts with times yet.')} <Link to="/guard-posts" className="font-semibold underline">{t('Add guard posts first')}</Link></p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" htmlFor="ap-from"><input id="ap-from" type="date" className="input" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></Field>
            <Field label="For how many days" htmlFor="ap-days">
              <select id="ap-days" className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[3, 7, 14, 21, 31].map((n) => <option key={n} value={n}>{n} {t('days')}</option>)}</select>
            </Field>
          </div>
          {!!posts.data?.length && (
            <fieldset>
              <legend className="label">{t('Where do you need guards?')}</legend>
              <div className="space-y-2">
                {posts.data.map((p) => (
                  <label key={p._id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-edge">
                    <input type="checkbox" checked={chosen.includes(p._id)} onChange={() => setPostIds(chosen.includes(p._id) ? chosen.filter((x) => x !== p._id) : [...chosen, p._id])} />
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{p.name}</span><span className="block text-xs text-muted">{p.slots.map((s) => `${timeLabel(s.start)}–${timeLabel(s.end)} × ${s.guards}`).join(' · ')}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeHead} onChange={(e) => setIncludeHead(e.target.checked)} /> {t('Include the guard head in the shifts')}</label>
          {err && <p className="text-sm font-medium text-danger">{err}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="panel px-4 py-3"><p className="font-display text-2xl font-extrabold">{plan.planned}</p><p className="text-xs font-semibold">{t('shifts will be created')}</p></div>
            <div className={`panel px-4 py-3 ${plan.unfilledCount ? 'ring-1 ring-danger/50' : ''}`}><p className={`font-display text-2xl font-extrabold ${plan.unfilledCount ? 'text-danger' : ''}`}>{plan.unfilledCount}</p><p className="text-xs font-semibold">{t('places nobody could take')}</p></div>
          </div>
          {plan.message && <p className="text-sm text-muted">{plan.message}</p>}
          {plan.perGuard?.length > 0 && (
            <div>
              <p className="label">{t('Hours for each guard')}</p>
              <ul className="space-y-1 text-sm">{plan.perGuard.map((g) => <li key={g.userId} className="flex justify-between"><span>{g.name}</span><span className="text-muted">{g.shifts} {t('shifts')} · {g.hours} h</span></li>)}</ul>
            </div>
          )}
          {plan.unfilled?.length > 0 && (
            <div className="rounded-lg bg-danger-soft p-3">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><FiAlertTriangle /> {t('Nobody is free for these')}</p>
              <ul className="space-y-1 text-xs">{plan.unfilled.slice(0, 12).map((u, i) => <li key={i}><b>{dayLabel(u.date)}</b> {timeLabel(u.start)}–{timeLabel(u.end)} · {u.postName}<br /><span className="text-muted">{u.reason}</span></li>)}{plan.unfilled.length > 12 && <li>+{plan.unfilled.length - 12} {t('more')}</li>}</ul>
              <p className="mt-2 text-xs text-muted">{t('Ask guards to update their availability, or add these shifts by hand.')}</p>
            </div>
          )}
          {plan.assignments?.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold">{t('See every shift')}</summary>
              <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-xs">{plan.assignments.map((a, i) => <li key={i}>{dayLabel(a.date)} · {timeLabel(a.startTime)}–{timeLabel(a.endTime)} · {a.postName} · <b>{a.name}</b></li>)}</ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  )
}

const Roster = () => {
  const { t } = useT()
  const scope = useSocietyScope()
  const [from, setFrom] = useState(todayLocal())
  const to = addDays(from, 6)
  const { data, loading, error, reload } = useApi('/roster', { params: { ...scope.params, from, to }, enabled: scope.ready })
  const people = useApi('/roster/people', { params: scope.params, enabled: scope.ready, live: false, select: (d) => d.people || [] })
  const { busy, run } = useAction(reload)
  const [form, setForm] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [planning, setPlanning] = useState(false)
  useHighlight(!loading)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(from, i)), [from])
  const shifts = data?.shifts || []
  const byDay = (d) => shifts.filter((s) => s.date === d)

  const openForm = () => setForm({ userId: people.data?.[0]?._id || '', dates: [], startTime: '08:00', endTime: '16:00', post: 'main_gate', note: '' })
  const toggleDate = (d) => setForm({ ...form, dates: form.dates.includes(d) ? form.dates.filter((x) => x !== d) : [...form.dates, d] })

  const save = async (e) => {
    e.preventDefault()
    if (!form.dates.length) return
    const body = { userId: form.userId, dates: form.dates, startTime: form.startTime, endTime: form.endTime, post: form.post, note: form.note.trim() || undefined }
    if (scope.societyId) body.societyId = scope.societyId
    const ok = await run('save', () => api.post('/roster', body), 'Shifts added')
    if (ok) setForm(null)
  }

  return (
    <>
      <PageHeader title="Duty roster" subtitle="Plan who is on duty, and see who turned up." action={scope.ready && <div className="flex gap-2"><button className="btn-secondary" onClick={() => setPlanning(true)}><FiZap size={16} /> {t('Plan automatically')}</button><button className="btn-primary" onClick={openForm} disabled={!people.data?.length}><FiPlus size={16} /> {t('Add shifts')}</button></div>} />
      {scope.picker}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-secondary btn-sm" aria-label="Previous week" onClick={() => setFrom(addDays(from, -7))}><FiChevronLeft size={16} /></button>
        <input type="date" className="input w-auto" aria-label="Week starting" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <button className="btn-secondary btn-sm" aria-label="Next week" onClick={() => setFrom(addDays(from, 7))}><FiChevronRight size={16} /></button>
        <button className="btn-ghost btn-sm" onClick={() => setFrom(todayLocal())}>{t('Today')}</button>
      </div>
      {people.data && !people.data.length && <p className="mb-4 rounded-md bg-sunken px-4 py-3 text-sm text-muted">No approved guards or staff yet. Approve them under People first, then give them shifts here.</p>}

      {!scope.ready || loading ? (
        <div className="panel"><ListSkeleton rows={5} /></div>
      ) : error ? (
        <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
      ) : !shifts.length ? (
        <div className="panel"><EmptyState icon={FiClipboard} title="No shifts" text="No one is rostered this week. Tap Add shifts to plan it." /></div>
      ) : (
        <div className="space-y-4">
          {days.map((d) => {
            const list = byDay(d)
            return (
              <section key={d} aria-label={dayLabel(d)}>
                <h2 className={`mb-1 text-sm font-bold ${d === data.today ? 'text-brand' : ''}`}>{dayLabel(d)}{d === data.today ? ` · ${t('Today')}` : ''}</h2>
                {!list.length ? <p className="rounded-md border border-dashed border-line px-3 py-2 text-xs text-muted">Nobody rostered</p> : (
                  <ul className="panel divide-y divide-line">
                    {list.map((s) => (
                      <li key={s._id} data-item-id={s._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{s.person?.name || 'Unknown'} <span className="text-xs font-normal text-muted">· {ROLE[s.person?.role] || 'Staff'}</span>{s.autoAllocated && <span className="tag-info ml-2">{t('Auto')}</span>}</p>
                          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            <span>{timeLabel(s.startTime)} to {timeLabel(s.endTime)}</span>
                            {s.overnight && <span className="inline-flex items-center gap-1"><FiMoon size={11} /> overnight</span>}
                            <span>{s.postName || postLabel(s.post)}</span>
                            {s.clockInAt && <span>in {fmtTime(s.clockInAt)}</span>}
                            {s.clockOutAt && <span>out {fmtTime(s.clockOutAt)}</span>}
                          </p>
                          {s.note && <p className="text-xs text-muted">{s.note}</p>}
                        </div>
                        <StatusTag status={PHASE[s.phase][0]} label={PHASE[s.phase][1]} />
                        {!s.clockInAt && <button className="btn-ghost btn-sm text-danger" aria-label={`${t('Delete')} ${s.person?.name || ''} ${dayLabel(d)}`} onClick={() => setRemoving(s)}><FiTrash2 size={14} /></button>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title="Add shifts" size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => setForm(null)}>{t('Cancel')}</button>
          <button className="btn-primary" form="shift-form" type="submit" disabled={busy === 'save' || !form?.dates.length}>{busy === 'save' && <Spinner className="h-4 w-4" />} {form?.dates.length ? `${t('Add shifts')} (${form.dates.length})` : t('Add shifts')}</button>
        </>}>
        {form && (
          <form id="shift-form" onSubmit={save} className="space-y-4">
            <Field label="Who is on duty" htmlFor="s-who">
              <select id="s-who" required className="input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                {(people.data || []).map((p) => <option key={p._id} value={p._id}>{p.name} ({ROLE[p.role] || 'Staff'})</option>)}
              </select>
            </Field>
            <fieldset>
              <legend className="label">Days</legend>
              <div className="flex flex-wrap gap-2">
                {days.map((d) => (
                  <label key={d} className={`cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold ${form.dates.includes(d) ? 'border-brand bg-brand-soft' : 'border-line'}`}>
                    <input type="checkbox" className="sr-only" checked={form.dates.includes(d)} onChange={() => toggleDate(d)} /> {dayLabel(d)}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">Use the arrows above to move to another week, then add shifts there.</p>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Starts" htmlFor="s-start"><input id="s-start" type="time" required className="input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
              <Field label="Ends" htmlFor="s-end" hint="Earlier than the start means overnight"><input id="s-end" type="time" required className="input" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
              <Field label="Post" htmlFor="s-post"><select id="s-post" className="input" value={form.post} onChange={(e) => setForm({ ...form, post: e.target.value })}>{POSTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            </div>
            <Field label="Note" htmlFor="s-note" hint="Optional"><input id="s-note" className="input" maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          </form>
        )}
      </Modal>

      <AutoPlan open={planning} onClose={() => setPlanning(false)} defaultFrom={from} scope={scope} onApplied={(m) => { setPlanning(false); toast.success(m); reload() }} />

      <ConfirmDialog open={!!removing} danger title="Remove this shift?" text={removing ? `${removing.person?.name}, ${dayLabel(removing.date)}` : ''} confirmLabel="Remove" busy={busy === 'rm'} onClose={() => setRemoving(null)}
        onConfirm={async () => { const ok = await run('rm', () => api.delete(`/roster/${removing._id}`), 'Shift removed'); if (ok) setRemoving(null) }} />
    </>
  )
}

export default Roster
