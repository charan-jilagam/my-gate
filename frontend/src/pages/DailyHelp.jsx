import { useState } from 'react'
import { FiClock, FiLink, FiPhone, FiPlus, FiTrash2 } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { Avatar, ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, Modal, PageHeader, Spinner, errorMessage, formatDate } from '../components/ui'
import { dayLabel } from '../utils/services'
import HelperGate from '../components/HelperGate'
import HelperPass from '../components/HelperPass'

const KINDS = [['maid', 'Maid'], ['cook', 'Cook'], ['driver', 'Driver'], ['nanny', 'Nanny'], ['gardener', 'Gardener'], ['cleaner', 'Cleaner'], ['tutor', 'Tutor'], ['other', 'Other']]
const kindLabel = (k) => KINDS.find((x) => x[0] === k)?.[1] || 'Helper'
const time = (v) => new Date(v).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

const TodayTag = ({ today }) => {
  if (!today) return null
  if (today.status === 'inside') return <span className="tag-ok">Inside since {time(today.checkIn)}</span>
  if (today.status === 'left') return <span className="tag-neutral">Left at {time(today.checkOut)}</span>
  return <span className="tag-neutral">Not arrived today</span>
}

const monthNow = () => new Date().toISOString().slice(0, 7)

const DailyHelp = () => {
  const { user, isResident } = useAuth()
  const isGate = ['security', 'society_admin', 'super_admin'].includes(user?.role)
  const { data, loading, error, reload } = useApi('/daily-help', { select: (d) => d.helpers || [] })
  const { busy, run } = useAction(reload)

  const [form, setForm] = useState(null)
  const [linking, setLinking] = useState(false)
  const [linkCode, setLinkCode] = useState('')
  const [removing, setRemoving] = useState(null)
  const [history, setHistory] = useState(null)
  const [month, setMonth] = useState(monthNow())
  const [records, setRecords] = useState(null)
  const [passFor, setPassFor] = useState(null)

  const openHistory = async (h, m = monthNow()) => {
    setHistory(h)
    setMonth(m)
    setRecords(null)
    try {
      const res = await api.get(`/daily-help/${h._id}/attendance`, { params: { month: m } })
      setRecords(res.data)
    } catch (e) {
      setRecords({ error: errorMessage(e) })
    }
  }

  return (
    <>
      <PageHeader
        title="Daily help"
        subtitle={isResident ? 'Maids, cooks, drivers and others who come to your home. Each gets a QR code and a code for the gate, for coming in and for leaving. The code changes every day.' : 'Household staff are checked in and out with their QR code or gate code.'}
        action={isResident && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setLinking(true)}><FiLink size={15} /> Add by code</button>
            <button className="btn-primary" onClick={() => setForm({ name: '', phone: '', kind: 'maid' })}><FiPlus size={16} /> Add helper</button>
          </div>
        )}
      />

      {isGate && <div className="mb-6"><HelperGate /></div>}

      {user?.role === 'security' ? null : loading ? <div className="panel"><ListSkeleton rows={3} /></div> : error ? <div className="panel"><ErrorState message={error} onRetry={reload} /></div> : !data.length ? (
        <div className="panel"><EmptyState icon={FiClock} title="No helpers yet" text={isResident ? 'Add your maid, cook or driver. You will see when they arrive and leave, and their monthly attendance.' : 'No household staff are registered.'} action={isResident ? <button className="btn-primary" onClick={() => setForm({ name: '', phone: '', kind: 'maid' })}>Add helper</button> : null} /></div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map((h) => (
            <li key={h._id} className="panel p-4">
              <div className="flex gap-3">
                <Avatar name={h.name} src={h.photo} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{h.name}</p>
                  <p className="text-sm text-muted">{kindLabel(h.kind)}{h.households > 1 ? ` · ${h.households} homes` : ''}{isGate && h.flats.length ? ` · ${h.flats.join(', ')}` : ''}</p>
                  <div className="mt-1"><TodayTag today={h.today} /></div>
                </div>
                {h.code && (
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase text-muted">Today's code</p>
                    <p className="font-display text-xl font-extrabold tracking-widest">{h.code}</p>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                {isResident && <button className="btn-primary btn-sm" onClick={() => setPassFor(h)}>{h.today?.status === 'inside' ? 'Show pass to leave' : 'Show pass'}</button>}
                {h.phone && <a className="btn-secondary btn-sm" href={`tel:${h.phone}`}><FiPhone size={14} /> Call</a>}
                {(isResident || user?.role !== 'security') && <button className="btn-secondary btn-sm" onClick={() => openHistory(h)}>Attendance</button>}
                {(isResident || user?.role !== 'security') && <button className="btn-ghost btn-sm text-danger" onClick={() => setRemoving(h)}><FiTrash2 size={14} /> {isResident ? 'Remove' : 'Bar from society'}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <HelperPass helper={passFor} onClose={() => setPassFor(null)} />

      <Modal open={!!form} onClose={() => setForm(null)} title="Add a helper" size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
          <button className="btn-primary" form="help-form" type="submit" disabled={busy === 'add'}>{busy === 'add' && <Spinner className="h-4 w-4" />} Add</button>
        </>}>
        {form && (
          <form id="help-form" className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const ok = await run('add', () => api.post('/daily-help', { name: form.name.trim(), phone: form.phone.trim() || undefined, kind: form.kind }), 'Helper added'); if (ok) setForm(null) }}>
            <Field label="Name" htmlFor="h-name"><input id="h-name" required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Phone" htmlFor="h-phone" hint="Optional"><input id="h-phone" inputMode="tel" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Type" htmlFor="h-kind"><select id="h-kind" className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <p className="text-xs text-muted">We will give you a 6-digit code. Share it with them to show at the gate.</p>
          </form>
        )}
      </Modal>

      <Modal open={linking} onClose={() => setLinking(false)} title="Add by code" size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => setLinking(false)}>Cancel</button>
          <button className="btn-primary" disabled={linkCode.length !== 6 || busy === 'link'} onClick={async () => { const ok = await run('link', () => api.post('/daily-help/link', { code: linkCode }), 'Helper added'); if (ok) { setLinking(false); setLinkCode('') } }}>Add</button>
        </>}>
        <Field label="Their gate code" htmlFor="l-code" hint="If your maid or driver already works for a neighbour, ask them for the code they show at the gate today. Codes change every day.">
          <input id="l-code" className="input text-center font-display text-xl tracking-[0.3em]" inputMode="numeric" maxLength={6} value={linkCode} onChange={(e) => setLinkCode(e.target.value.replace(/\D/g, ''))} />
        </Field>
      </Modal>

      <Modal open={!!history} onClose={() => setHistory(null)} title={history ? `${history.name}: attendance` : ''}>
        <div className="mb-3 flex items-center gap-2">
          <input type="month" className="input w-auto" aria-label="Month" value={month} max={monthNow()} onChange={(e) => e.target.value && openHistory(history, e.target.value)} />
          {records && !records.error && <p className="text-sm font-semibold">{records.daysPresent} {records.daysPresent === 1 ? 'day' : 'days'} present</p>}
        </div>
        {!records ? <ListSkeleton rows={3} /> : records.error ? <p className="text-sm text-danger">{records.error}</p> : !records.records.length ? <p className="text-sm text-muted">No visits recorded this month.</p> : (
          <ul className="divide-y divide-line text-sm">
            {records.records.map((r, i) => (
              <li key={i} className="flex justify-between py-2"><span>{dayLabel(r.date)}</span><span className="text-muted">{time(r.checkIn)} to {r.checkOut ? time(r.checkOut) : 'still inside'}</span></li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog open={!!removing} danger title={isResident ? 'Remove this helper?' : 'Bar this helper from the society?'} text={isResident ? `${removing?.name} will no longer be on your list. Other homes they work in are not affected.` : `${removing?.name}'s code will stop working.`} confirmLabel="Remove" busy={busy === 'rm'} onClose={() => setRemoving(null)}
        onConfirm={async () => { const ok = await run('rm', () => api.delete(`/daily-help/${removing._id}`), 'Removed'); if (ok) setRemoving(null) }} />
    </>
  )
}

export default DailyHelp
