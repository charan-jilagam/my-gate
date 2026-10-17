import { useMemo, useState } from 'react'
import { FiChevronLeft, FiChevronRight, FiClipboard, FiMoon, FiPlus, FiTrash2 } from 'react-icons/fi'
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
      <PageHeader title="Duty roster" subtitle="Plan who is on duty, and see who turned up." action={scope.ready && <button className="btn-primary" onClick={openForm} disabled={!people.data?.length}><FiPlus size={16} /> {t('Add shifts')}</button>} />
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
                      <li key={s._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{s.person?.name || 'Unknown'} <span className="text-xs font-normal text-muted">· {s.person?.role === 'security' ? 'Guard' : 'Staff'}</span></p>
                          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            <span>{timeLabel(s.startTime)} to {timeLabel(s.endTime)}</span>
                            {s.overnight && <span className="inline-flex items-center gap-1"><FiMoon size={11} /> overnight</span>}
                            <span>{postLabel(s.post)}</span>
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
                {(people.data || []).map((p) => <option key={p._id} value={p._id}>{p.name} ({p.role === 'security' ? 'Guard' : 'Staff'})</option>)}
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

      <ConfirmDialog open={!!removing} danger title="Remove this shift?" text={removing ? `${removing.person?.name}, ${dayLabel(removing.date)}` : ''} confirmLabel="Remove" busy={busy === 'rm'} onClose={() => setRemoving(null)}
        onConfirm={async () => { const ok = await run('rm', () => api.delete(`/roster/${removing._id}`), 'Shift removed'); if (ok) setRemoving(null) }} />
    </>
  )
}

export default Roster
