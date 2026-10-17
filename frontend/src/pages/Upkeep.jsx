import { useState } from 'react'
import { FiCheckCircle, FiClock, FiPhone, FiPlus, FiTool, FiTrash2 } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { useSocietyScope } from '../components/SocietyPicker'
import { ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, Modal, PageHeader, Spinner, Stat, StatusTag, formatDate, formatINR } from '../components/ui'
import { dayLabel } from '../utils/services'

const CATS = [['water_tank', 'Water tanks'], ['lift', 'Lifts'], ['generator', 'Generator'], ['fire_safety', 'Fire safety'], ['pest_control', 'Pest control'], ['electrical', 'Electrical'], ['plumbing', 'Plumbing'], ['cleaning', 'Cleaning'], ['garden', 'Garden'], ['other', 'Other']]
const catLabel = (k) => CATS.find((c) => c[0] === k)?.[1] || k
const todayStr = () => new Date().toLocaleDateString('en-CA')
const EMPTY = { name: '', category: 'water_tank', location: '', intervalDays: '90', nextDue: '', contractor: '', contractorPhone: '', notes: '' }
const STATUS = { overdue: ['danger', 'Overdue'], due_soon: ['warn', 'Due soon'], ok: ['ok', 'Ok'] }

const whenText = (t) => {
  if (t.status === 'overdue') return `${-t.daysLeft} ${-t.daysLeft === 1 ? 'day' : 'days'} overdue`
  if (t.daysLeft === 0) return 'Due today'
  return `Due ${dayLabel(t.nextDue)}`
}

const Upkeep = () => {
  const { isAdmin } = useAuth()
  const { t } = useT()
  const scope = useSocietyScope()
  const { data, loading, error, reload } = useApi('/facility', { params: scope.params, enabled: scope.ready })
  const { busy, run } = useAction(reload)
  const [form, setForm] = useState(null)
  const [doneFor, setDoneFor] = useState(null)
  const [done, setDone] = useState({ doneOn: todayStr(), note: '', cost: '' })
  const [openId, setOpenId] = useState(null)
  const [removing, setRemoving] = useState(null)

  const tasks = data?.tasks || []
  const counts = data?.counts || { overdue: 0, due_soon: 0, ok: 0 }
  const open = tasks.find((x) => x._id === openId)

  const save = async (e) => {
    e.preventDefault()
    const body = { name: form.name.trim(), category: form.category, location: form.location.trim(), intervalDays: Number(form.intervalDays), nextDue: form.nextDue || undefined, contractor: form.contractor.trim(), contractorPhone: form.contractorPhone.trim() || undefined, notes: form.notes.trim() }
    if (scope.societyId) body.societyId = scope.societyId
    const ok = await run('save', () => (form._id ? api.put(`/facility/${form._id}`, body) : api.post('/facility', body)), 'Saved')
    if (ok) setForm(null)
  }

  const markDone = async (e) => {
    e.preventDefault()
    const body = { doneOn: done.doneOn, note: done.note.trim() || undefined, cost: isAdmin && done.cost !== '' ? Number(done.cost) : undefined }
    const ok = await run('done', () => api.post(`/facility/${doneFor._id}/complete`, body), 'Recorded')
    if (ok) setDoneFor(null)
  }

  return (
    <>
      <PageHeader
        title="Society upkeep"
        subtitle={isAdmin ? 'Recurring maintenance: tanks, lifts, generators, fire equipment and more.' : 'When shared facilities were last looked after, and when they are next due.'}
        action={isAdmin && scope.ready && <button className="btn-primary" onClick={() => setForm({ ...EMPTY })}><FiPlus size={16} /> {t('Add job')}</button>}
      />
      {scope.picker}

      {!scope.ready || loading ? (
        <div className="panel"><ListSkeleton rows={4} /></div>
      ) : error ? (
        <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-3">
            <Stat label="Overdue" value={counts.overdue} tone={counts.overdue ? 'warn' : undefined} />
            <Stat label="Due soon" value={counts.due_soon} hint="in the next 7 days" />
            <Stat label="Ok" value={counts.ok} />
          </div>

          {!tasks.length ? (
            <div className="panel"><EmptyState icon={FiTool} title="No upkeep jobs yet" text={isAdmin ? 'Add the jobs that repeat, like cleaning the water tanks every 90 days.' : 'The office has not added any upkeep jobs yet.'} /></div>
          ) : (
            <ul className="space-y-2">
              {tasks.map((x) => (
                <li key={x._id} className={`panel flex flex-wrap items-center gap-3 p-4 ${x.active ? '' : 'opacity-60'}`}>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(x._id)}>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{x.name}</span>
                      {x.active ? <StatusTag status={x.status === 'overdue' ? 'rejected' : x.status === 'due_soon' ? 'pending' : 'approved'} label={STATUS[x.status][1]} /> : <span className="tag-neutral">Switched off</span>}
                    </p>
                    <p className="text-xs text-muted">{catLabel(x.category)}{x.location ? ` · ${x.location}` : ''} · every {x.intervalDays} days · {x.lastDone ? `last done ${dayLabel(x.lastDone)}` : 'never recorded'}</p>
                    <p className={`text-sm font-semibold ${x.status === 'overdue' ? 'text-danger' : ''}`}>{x.active ? whenText(x) : ''}</p>
                  </button>
                  {x.canComplete && <button className="btn-primary btn-sm" onClick={() => { setDone({ doneOn: todayStr(), note: '', cost: '' }); setDoneFor(x) }}><FiCheckCircle size={14} /> {t('Mark done')}</button>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Details and history */}
      <Modal open={!!open} onClose={() => setOpenId(null)} title={open?.name || ''} size="lg"
        footer={open && (
          <>
            {open.canManage && <button className="btn-ghost text-danger" onClick={() => { setRemoving(open); setOpenId(null) }}><FiTrash2 size={14} /> {t('Delete')}</button>}
            {open.canManage && <button className="btn-secondary" onClick={() => { setForm({ ...EMPTY, ...open, intervalDays: String(open.intervalDays), contractor: open.contractor || '', contractorPhone: open.contractorPhone || '', notes: open.notes || '', location: open.location || '' }); setOpenId(null) }}>{t('Edit')}</button>}
            <button className="btn-secondary" onClick={() => setOpenId(null)}>{t('Close')}</button>
          </>
        )}>
        {open && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Next due</dt><dd className="font-semibold">{dayLabel(open.nextDue)}</dd></div>
              <div><dt className="text-xs text-muted">Last done</dt><dd className="font-semibold">{open.lastDone ? dayLabel(open.lastDone) : 'Never recorded'}</dd></div>
              {open.contractor && <div><dt className="text-xs text-muted">Contractor</dt><dd className="font-semibold">{open.contractor}{open.contractorPhone && <a className="ml-2 inline-flex items-center gap-1 text-brand" href={`tel:${open.contractorPhone}`}><FiPhone size={12} /> {open.contractorPhone}</a>}</dd></div>}
              {open.notes && <div className="sm:col-span-2"><dt className="text-xs text-muted">Notes</dt><dd>{open.notes}</dd></div>}
            </dl>
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 font-bold"><FiClock size={14} /> History</h3>
              {!open.history.length ? <p className="text-muted">Nothing recorded yet.</p> : (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {open.history.map((h) => (
                    <li key={h._id} className="px-3 py-2">
                      <p className="font-semibold">{dayLabel(h.doneOn)}{h.byName ? <span className="font-normal text-muted"> · {h.byName}</span> : null}{h.cost > 0 ? <span className="float-right">{formatINR(h.cost)}</span> : null}</p>
                      {h.note && <p className="text-muted">{h.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Mark done */}
      <Modal open={!!doneFor} onClose={() => setDoneFor(null)} title={doneFor ? `${t('Mark done')}: ${doneFor.name}` : ''} size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => setDoneFor(null)}>{t('Cancel')}</button>
          <button className="btn-primary" form="done-form" type="submit" disabled={busy === 'done'}>{busy === 'done' && <Spinner className="h-4 w-4" />} {t('Save')}</button>
        </>}>
        <form id="done-form" onSubmit={markDone} className="space-y-4">
          <Field label="Done on" htmlFor="u-date" hint="The next due date is counted from this day."><input id="u-date" type="date" required className="input" max={todayStr()} value={done.doneOn} onChange={(e) => setDone({ ...done, doneOn: e.target.value })} /></Field>
          <Field label="Note" htmlFor="u-note" hint="Optional. What was done, anything found."><input id="u-note" className="input" maxLength={300} value={done.note} onChange={(e) => setDone({ ...done, note: e.target.value })} /></Field>
          {isAdmin && <Field label="Cost (rupees)" htmlFor="u-cost" hint="Optional. Only the office sees this."><input id="u-cost" type="number" min="0" className="input" value={done.cost} onChange={(e) => setDone({ ...done, cost: e.target.value })} /></Field>}
        </form>
      </Modal>

      {/* Add or edit */}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?._id ? 'Edit job' : 'Add job'}
        footer={<>
          <button className="btn-secondary" onClick={() => setForm(null)}>{t('Cancel')}</button>
          <button className="btn-primary" form="up-form" type="submit" disabled={busy === 'save'}>{busy === 'save' && <Spinner className="h-4 w-4" />} {t('Save')}</button>
        </>}>
        {form && (
          <form id="up-form" onSubmit={save} className="space-y-4">
            <Field label="Name" htmlFor="f-name"><input id="f-name" required className="input" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Clean overhead water tanks" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="f-cat"><select id="f-cat" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Where" htmlFor="f-loc" hint="Optional"><input id="f-loc" className="input" maxLength={80} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Block B terrace" /></Field>
              <Field label="Repeat every (days)" htmlFor="f-int"><input id="f-int" type="number" required min="1" max="1095" className="input" value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: e.target.value })} /></Field>
              <Field label="Next due" htmlFor="f-due" hint={form._id ? undefined : 'Leave empty to count from today'}><input id="f-due" type="date" className="input" value={form.nextDue || ''} onChange={(e) => setForm({ ...form, nextDue: e.target.value })} /></Field>
              <Field label="Contractor" htmlFor="f-con" hint="Optional"><input id="f-con" className="input" maxLength={80} value={form.contractor} onChange={(e) => setForm({ ...form, contractor: e.target.value })} /></Field>
              <Field label="Contractor phone" htmlFor="f-ph" hint="Optional"><input id="f-ph" type="tel" className="input" maxLength={20} value={form.contractorPhone} onChange={(e) => setForm({ ...form, contractorPhone: e.target.value })} /></Field>
            </div>
            <Field label="Notes" htmlFor="f-notes" hint="Optional"><input id="f-notes" className="input" maxLength={300} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            {form._id && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> This job is active</label>}
          </form>
        )}
      </Modal>

      <ConfirmDialog open={!!removing} danger title="Delete this job?" text={removing ? `${removing.name} and its history will be removed.` : ''} confirmLabel="Delete" busy={busy === 'rm'} onClose={() => setRemoving(null)}
        onConfirm={async () => { const ok = await run('rm', () => api.delete(`/facility/${removing._id}`), 'Removed'); if (ok) setRemoving(null) }} />
    </>
  )
}

export default Upkeep
