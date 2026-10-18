import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiClock, FiEdit2, FiPlus, FiTrash2, FiUsers } from 'react-icons/fi'
import api from '../services/api'
import useApi from '../hooks/useApi'
import { ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, Modal, Spinner, errorMessage, formatINR } from './ui'
import { AMENITY_PRESETS, amenityIcon } from '../utils/amenity'
import { timeLabel } from '../utils/services'

const BLANK = { name: '', description: '', capacity: '', hourlyRate: '', openTime: '06:00', closeTime: '22:00', slotMinutes: 60, maxSlotsPerBooking: 3, maxAdvanceDays: 30, requiresApproval: true, isActive: true }

const Switch = ({ checked, onChange, label, disabled }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-brand' : 'bg-line'}`}>
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
)

/** The society office decides which spaces residents can book. Every society has its own list. */
const AmenityManager = ({ onChanged }) => {
  const { data, loading, error, reload } = useApi('/bookings/amenities', { params: { all: 1 }, live: false, select: (d) => d.amenities || [] })
  const [form, setForm] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState('')
  const [formError, setFormError] = useState('')

  const changed = async () => { await reload(); onChanged?.() }

  const open = (a) => {
    setFormError('')
    setForm(a ? { ...BLANK, ...a, capacity: a.capacity ?? '', hourlyRate: a.hourlyRate || '', description: a.description || '' } : { ...BLANK })
  }

  const save = async (e) => {
    e.preventDefault()
    setFormError('')
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      capacity: form.capacity === '' ? null : Number(form.capacity),
      hourlyRate: form.hourlyRate === '' ? 0 : Number(form.hourlyRate),
      openTime: form.openTime,
      closeTime: form.closeTime,
      slotMinutes: Number(form.slotMinutes),
      maxSlotsPerBooking: Number(form.maxSlotsPerBooking),
      maxAdvanceDays: Number(form.maxAdvanceDays),
      requiresApproval: !!form.requiresApproval,
      isActive: form.isActive !== false
    }
    if (!body.name) return setFormError('Give the amenity a name.')
    setBusy('save')
    try {
      const { data: res } = await (form._id ? api.put(`/bookings/amenities/${form._id}`, body) : api.post('/bookings/amenities', body))
      toast.success(res.message || 'Saved')
      setForm(null)
      await changed()
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save this amenity.'))
    } finally {
      setBusy('')
    }
  }

  const toggle = async (a) => {
    setBusy(a._id)
    try {
      await api.put(`/bookings/amenities/${a._id}`, { isActive: !a.isActive })
      toast.success(a.isActive ? `${a.name} closed for booking` : `${a.name} open for booking`)
      await changed()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  const remove = async () => {
    setBusy('remove')
    try {
      const { data: res } = await api.delete(`/bookings/amenities/${removing._id}`)
      toast.success(res.message || 'Removed')
      setRemoving(null)
      await changed()
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove this amenity.'), { duration: 6000 })
      setRemoving(null)
    } finally {
      setBusy('')
    }
  }

  if (loading) return <div className="panel"><ListSkeleton rows={3} /></div>
  if (error) return <div className="panel"><ErrorState message={error} onRetry={reload} /></div>

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted">Add the spaces your society has. Residents only see what is on this list, with the hours, price and rules you set.</p>
        <button className="btn-primary" onClick={() => open(null)}><FiPlus size={16} /> Add amenity</button>
      </div>

      {data.length === 0 ? (
        <div className="panel">
          <EmptyState icon={FiPlus} title="No amenities yet" text="Start with a clubhouse, gym or court. You can change hours and prices any time."
            action={<button className="btn-primary" onClick={() => open(null)}>Add the first amenity</button>} />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((a) => {
            const Icon = amenityIcon(a.name)
            return (
              <li key={a._id} className={`panel flex flex-col p-5 transition-opacity ${a.isActive ? '' : 'opacity-70'}`}>
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-lg font-bold">{a.name}</h3>
                    <p className="text-xs text-muted">{a.isActive ? 'Open for booking' : 'Closed for booking'}</p>
                  </div>
                  <Switch checked={a.isActive} onChange={() => toggle(a)} disabled={busy === a._id} label={`${a.name} open for booking`} />
                </div>
                {a.description && <p className="mt-3 line-clamp-2 text-sm text-muted">{a.description}</p>}
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="caption flex items-center gap-1"><FiClock size={11} /> Hours</dt><dd className="font-semibold">{`${timeLabel(a.openTime)} to ${timeLabel(a.closeTime)}`}</dd></div>
                  <div><dt className="caption">Price</dt><dd className="font-semibold">{a.hourlyRate ? `${formatINR(a.hourlyRate)} per hour` : 'No charge'}</dd></div>
                  <div><dt className="caption flex items-center gap-1"><FiUsers size={11} /> Fits</dt><dd className="font-semibold">{a.capacity ? `${a.capacity} people` : 'No limit'}</dd></div>
                  <div><dt className="caption">Booking</dt><dd className="font-semibold">{a.requiresApproval ? 'Office approves' : 'Instant'}</dd></div>
                </dl>
                <div className="mt-5 flex gap-2 border-t border-line pt-4">
                  <button className="btn-secondary btn-sm flex-1" onClick={() => open(a)}><FiEdit2 size={13} /> Edit</button>
                  <button className="btn-ghost btn-sm text-danger" onClick={() => setRemoving(a)} aria-label={`Remove ${a.name}`}><FiTrash2 size={14} /></button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? 'Edit amenity' : 'Add amenity'}
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn-primary" form="amenity-form" type="submit" disabled={busy === 'save'}>{busy === 'save' && <Spinner className="h-4 w-4" />} Save amenity</button>
          </>
        }
      >
        {form && (
          <form id="amenity-form" onSubmit={save} className="space-y-5">
            {!form._id && (
              <div>
                <p className="caption mb-2">Quick start</p>
                <div className="flex flex-wrap gap-2">
                  {AMENITY_PRESETS.map((p) => (
                    <button key={p.name} type="button" onClick={() => setForm({ ...form, name: p.name, capacity: p.capacity, hourlyRate: p.hourlyRate || '' })}
                      className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${form.name === p.name ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface hover:border-brand'}`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Field label="Name" htmlFor="am-name" hint="Residents see this name, so use what they call it.">
              <input id="am-name" required maxLength={60} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor="am-desc" hint="Optional. Rules, what is included, who it is for.">
              <textarea id="am-desc" rows={2} maxLength={300} className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Opens" htmlFor="am-open"><input id="am-open" type="time" required className="input" value={form.openTime} onChange={(e) => setForm({ ...form, openTime: e.target.value })} /></Field>
              <Field label="Closes" htmlFor="am-close"><input id="am-close" type="time" required className="input" value={form.closeTime} onChange={(e) => setForm({ ...form, closeTime: e.target.value })} /></Field>
              <Field label="Price per hour (₹)" htmlFor="am-rate" hint="Leave empty for free."><input id="am-rate" type="number" min="0" className="input" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} /></Field>
              <Field label="How many people it fits" htmlFor="am-cap" hint="Leave empty for no limit."><input id="am-cap" type="number" min="1" className="input" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
              <Field label="Slot length" htmlFor="am-slot">
                <select id="am-slot" className="input" value={form.slotMinutes} onChange={(e) => setForm({ ...form, slotMinutes: e.target.value })}>
                  {[30, 60, 90, 120].map((n) => <option key={n} value={n}>{`${n} minutes`}</option>)}
                </select>
              </Field>
              <Field label="Most slots in a row" htmlFor="am-max"><input id="am-max" type="number" min="1" max="12" className="input" value={form.maxSlotsPerBooking} onChange={(e) => setForm({ ...form, maxSlotsPerBooking: e.target.value })} /></Field>
              <Field label="Book up to (days ahead)" htmlFor="am-adv"><input id="am-adv" type="number" min="1" max="90" className="input" value={form.maxAdvanceDays} onChange={(e) => setForm({ ...form, maxAdvanceDays: e.target.value })} /></Field>
            </div>
            <div className="space-y-3 rounded-xl bg-sunken px-4 py-3">
              <label className="flex items-center justify-between gap-4 text-sm"><span><span className="block font-semibold">Office approves each booking</span><span className="text-xs text-muted">Turn off to confirm bookings instantly.</span></span><Switch checked={form.requiresApproval} onChange={(v) => setForm({ ...form, requiresApproval: v })} label="Office approves each booking" /></label>
              <label className="flex items-center justify-between gap-4 text-sm"><span><span className="block font-semibold">Open for booking</span><span className="text-xs text-muted">Turn off to hide it from residents.</span></span><Switch checked={form.isActive !== false} onChange={(v) => setForm({ ...form, isActive: v })} label="Open for booking" /></label>
            </div>
            {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!removing}
        danger
        title="Remove this amenity?"
        text={`${removing?.name} will be taken off the list. If it still has upcoming bookings, close it for booking instead.`}
        confirmLabel="Remove"
        busy={busy === 'remove'}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
      />
    </>
  )
}

export default AmenityManager
