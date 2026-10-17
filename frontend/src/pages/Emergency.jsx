import { useState } from 'react'
import { FiAlertTriangle, FiPhone, FiPlus, FiTrash2 } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, Modal, PageHeader, Spinner, StatusTag, formatDate } from '../components/ui'

const TYPES = [
  { key: 'medical', label: 'Medical', hint: 'Someone is hurt or unwell' },
  { key: 'fire', label: 'Fire or smoke', hint: 'Fire, gas smell, smoke' },
  { key: 'security', label: 'Security threat', hint: 'Intruder, theft, danger' },
  { key: 'other', label: 'Something else', hint: 'Any other emergency' }
]
const KINDS = [['police', 'Police'], ['fire', 'Fire brigade'], ['ambulance', 'Ambulance'], ['hospital', 'Hospital'], ['security', 'Security desk'], ['management', 'Society office'], ['utility', 'Electricity, water, gas'], ['other', 'Other']]
const STATUS = { active: 'Needs help', acknowledged: 'Help on the way', resolved: 'Resolved' }

const AlertRow = ({ alert: a, responder, busy, onAck, onResolve }) => (
  <li className={`panel p-4 ${a.status === 'active' ? 'border-2 border-danger' : ''}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-bold">
          {a.typeLabel}{a.flat ? ` at ${a.flat}` : ''}
          <StatusTag status={a.status === 'active' ? 'urgent' : a.status === 'acknowledged' ? 'in_progress' : 'completed'} label={STATUS[a.status]} />
        </p>
        {a.note && <p className="mt-1 text-sm">{a.note}</p>}
        <p className="mt-1 text-xs text-muted">
          {formatDate(a.createdAt, true)}
          {a.acknowledgedBy ? ` · ${a.acknowledgedBy} responded` : ''}
          {a.resolutionNote ? ` · ${a.resolutionNote}` : ''}
        </p>
      </div>
      {responder && a.status !== 'resolved' && (
        <div className="flex flex-wrap gap-2">
          {a.resident?.phone && <a className="btn-secondary btn-sm" href={`tel:${a.resident.phone}`}><FiPhone size={14} /> Call {a.resident.name?.split(' ')[0]}</a>}
          {a.status === 'active' && <button className="btn-primary btn-sm" disabled={busy === a._id} onClick={() => onAck(a)}>I am responding</button>}
          <button className="btn-secondary btn-sm" disabled={busy === a._id} onClick={() => onResolve(a)}>Resolve</button>
        </div>
      )}
    </div>
  </li>
)

const Emergency = () => {
  const { user, isResident, isAdmin } = useAuth()
  const responder = ['security', 'society_admin', 'super_admin'].includes(user?.role)
  const alerts = useApi('/emergency/alerts', { params: { limit: 30 }, select: (d) => d.alerts || [] })
  const contacts = useApi('/emergency/contacts', { select: (d) => d.contacts || [] })
  const { busy, run } = useAction(() => { alerts.reload(); contacts.reload() })

  const [sosOpen, setSosOpen] = useState(false)
  const [type, setType] = useState('medical')
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(null)
  const [resolving, setResolving] = useState(null)
  const [resolveNote, setResolveNote] = useState('')
  const [contactForm, setContactForm] = useState(null)
  const [removing, setRemoving] = useState(null)

  const send = async () => {
    const res = await run('sos', async () => (await api.post('/emergency/sos', { type, note: note.trim() || undefined })).data)
    if (res && res !== true) {
      setSent(res)
      setSosOpen(false)
      setNote('')
    }
  }

  const saveContact = async (e) => {
    e.preventDefault()
    const f = contactForm
    const body = { name: f.name.trim(), phone: f.phone.trim(), kind: f.kind, note: f.note?.trim() || undefined }
    const ok = await run('contact', () => (f._id ? api.put(`/emergency/contacts/${f._id}`, body) : api.post('/emergency/contacts', body)), 'Contact saved')
    if (ok) setContactForm(null)
  }

  const open = (alerts.data || []).filter((a) => a.status !== 'resolved')

  return (
    <>
      <PageHeader title="Emergency" subtitle={responder ? 'Alerts from residents and the numbers everyone may need.' : 'Raise an alarm that reaches the gate and the society office, or call for help.'} />

      {isResident && (
        <section className="panel mb-6 border-2 border-danger/50 p-5 text-center" aria-label="SOS">
          {sent ? (
            <div role="status">
              <p className="text-lg font-bold text-ok">{sent.repeated ? 'Your alert is already with the gate' : 'Alert sent'}</p>
              <p className="mt-1 text-sm">{sent.message}</p>
              <button className="btn-secondary mt-3" onClick={() => setSent(null)}>Done</button>
            </div>
          ) : (
            <>
              <button
                className="mx-auto grid h-36 w-36 place-items-center rounded-full bg-danger text-white shadow-pop transition-transform active:scale-95 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-danger"
                onClick={() => setSosOpen(true)}
                aria-label="Send an SOS alert"
              >
                <span className="flex flex-col items-center"><FiAlertTriangle size={40} /><span className="font-display text-2xl font-extrabold tracking-wide">SOS</span></span>
              </button>
              <p className="mt-3 text-sm text-muted">Tells the guards and the society office your flat and phone number. In a life-threatening emergency, also call 112.</p>
            </>
          )}
        </section>
      )}

      {(responder || (alerts.data || []).length > 0) && (
        <section className="mb-6" aria-labelledby="al-h">
          <h2 id="al-h" className="mb-2 flex items-center gap-2 text-base font-bold">{responder ? 'Alerts' : 'Your alerts'}{open.length > 0 && <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{open.length}</span>}</h2>
          {alerts.loading ? <div className="panel"><ListSkeleton rows={2} /></div> : alerts.error ? <div className="panel"><ErrorState message={alerts.error} onRetry={alerts.reload} /></div> : !alerts.data.length ? (
            <p className="panel px-4 py-5 text-sm text-muted">No alerts. Good.</p>
          ) : (
            <ul className="space-y-2" aria-live="polite">
              {alerts.data.map((a) => (
                <AlertRow key={a._id} alert={a} responder={responder} busy={busy}
                  onAck={(x) => run(x._id, () => api.put(`/emergency/alerts/${x._id}/acknowledge`), 'Marked as responding')}
                  onResolve={(x) => { setResolving(x); setResolveNote('') }} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="ct-h">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="ct-h" className="text-base font-bold">Important numbers</h2>
          {isAdmin && <button className="btn-secondary btn-sm" onClick={() => setContactForm({ name: '', phone: '', kind: 'police', note: '' })}><FiPlus size={14} /> Add</button>}
        </div>
        {contacts.loading ? <div className="panel"><ListSkeleton rows={3} /></div> : contacts.error ? <div className="panel"><ErrorState message={contacts.error} onRetry={contacts.reload} /></div> : !contacts.data.length ? (
          <div className="panel"><EmptyState icon={FiPhone} title="No numbers yet" text={isAdmin ? 'Add the police, fire brigade, ambulance, nearest hospital and your own security desk.' : 'The society office has not added any numbers yet. In an emergency call 112.'} /></div>
        ) : (
          <ul className="panel divide-y divide-line">
            {contacts.data.map((c) => (
              <li key={c._id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-muted">{KINDS.find((k) => k[0] === c.kind)?.[1]}{c.note ? ` · ${c.note}` : ''}</p>
                </div>
                <a className="btn-primary btn-sm" href={`tel:${c.phone}`} aria-label={`Call ${c.name}`}><FiPhone size={14} /> {c.phone}</a>
                {isAdmin && (
                  <>
                    <button className="btn-ghost btn-sm" onClick={() => setContactForm({ ...c })}>Edit</button>
                    <button className="btn-ghost btn-sm text-danger" aria-label={`Remove ${c.name}`} onClick={() => setRemoving(c)}><FiTrash2 size={14} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={sosOpen} onClose={() => setSosOpen(false)} title="What is happening?" size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => setSosOpen(false)}>Cancel</button>
          <button className="btn-danger" onClick={send} disabled={busy === 'sos'}>{busy === 'sos' && <Spinner className="h-4 w-4" />} Send alert now</button>
        </>}>
        <fieldset className="space-y-2">
          <legend className="sr-only">Type of emergency</legend>
          {TYPES.map((t) => (
            <label key={t.key} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${type === t.key ? 'border-danger bg-danger-soft' : 'border-line'}`}>
              <input type="radio" name="sos-type" className="mt-1" checked={type === t.key} onChange={() => setType(t.key)} />
              <span><span className="block text-sm font-semibold">{t.label}</span><span className="block text-xs text-muted">{t.hint}</span></span>
            </label>
          ))}
        </fieldset>
        <Field label="Anything the guard should know?" htmlFor="sos-note" className="mt-3" hint="Optional"><input id="sos-note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>

      <Modal open={!!resolving} onClose={() => setResolving(null)} title="Resolve alert" size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => setResolving(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy === resolving?._id} onClick={async () => { const ok = await run(resolving._id, () => api.put(`/emergency/alerts/${resolving._id}/resolve`, { note: resolveNote.trim() || undefined }), 'Alert resolved'); if (ok) setResolving(null) }}>Mark resolved</button>
        </>}>
        <Field label="What happened?" htmlFor="res-note" hint="Optional. The resident sees this."><input id="res-note" className="input" maxLength={300} value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} /></Field>
      </Modal>

      <Modal open={!!contactForm} onClose={() => setContactForm(null)} title={contactForm?._id ? 'Edit number' : 'Add a number'}
        footer={<>
          <button className="btn-secondary" onClick={() => setContactForm(null)}>Cancel</button>
          <button className="btn-primary" form="contact-form" type="submit" disabled={busy === 'contact'}>{busy === 'contact' && <Spinner className="h-4 w-4" />} Save</button>
        </>}>
        {contactForm && (
          <form id="contact-form" onSubmit={saveContact} className="space-y-4">
            <Field label="Name" htmlFor="c-name"><input id="c-name" required className="input" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} /></Field>
            <Field label="Phone" htmlFor="c-phone"><input id="c-phone" required inputMode="tel" className="input" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} /></Field>
            <Field label="Type" htmlFor="c-kind"><select id="c-kind" className="input" value={contactForm.kind} onChange={(e) => setContactForm({ ...contactForm, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Note" htmlFor="c-note" hint="Optional, for example 'Open 24 hours'"><input id="c-note" className="input" maxLength={120} value={contactForm.note || ''} onChange={(e) => setContactForm({ ...contactForm, note: e.target.value })} /></Field>
          </form>
        )}
      </Modal>

      <ConfirmDialog open={!!removing} danger title="Remove this number?" text={removing?.name} confirmLabel="Remove" busy={busy === 'rm'} onClose={() => setRemoving(null)}
        onConfirm={async () => { const ok = await run('rm', () => api.delete(`/emergency/contacts/${removing._id}`), 'Removed'); if (ok) setRemoving(null) }} />
    </>
  )
}

export default Emergency
