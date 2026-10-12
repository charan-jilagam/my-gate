import { useMemo, useState } from 'react'
import { FiCalendar, FiCheck, FiPlus, FiX } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { ConfirmDialog, DataList, EmptyState, Field, Modal, PageHeader, Spinner, StatusTag, formatDate } from '../components/ui'

const today = () => new Date().toISOString().slice(0, 10)
const EMPTY_FORM = { amenity: '', slotDate: today(), startTime: '18:00', endTime: '19:00', numberOfGuests: 0, notes: '' }
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' }
]

const timeRange = (b) => {
  const f = (v) => new Date(v).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  return `${f(b.startTime)} to ${f(b.endTime)}`
}

const Bookings = () => {
  const { isResident, isAdmin } = useAuth()
  const { data, loading, error, reload } = useApi('/bookings', { params: { limit: 100 }, select: (d) => d.bookings || [] })
  const { data: amenities } = useApi('/societies', {
    enabled: isResident,
    live: false,
    select: (d) => (d.societies?.[0]?.amenities || []).filter((a) => a.isActive !== false)
  })
  const { busy, run } = useAction(reload)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [cancelling, setCancelling] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')

  const rows = useMemo(() => (filter === 'all' ? data || [] : (data || []).filter((b) => b.status === filter)), [data, filter])

  const submit = async (e) => {
    e.preventDefault()
    setFormError('')
    const start = new Date(`${form.slotDate}T${form.startTime}`)
    const end = new Date(`${form.slotDate}T${form.endTime}`)
    if (!form.amenity.trim()) return setFormError('Choose or enter an amenity.')
    if (!(end > start)) return setFormError('The end time must be after the start time.')
    if (start < new Date()) return setFormError('Pick a time in the future.')

    const payload = {
      amenity: form.amenity.trim(),
      slotDate: new Date(`${form.slotDate}T00:00`).toISOString(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      numberOfGuests: Number(form.numberOfGuests) || 0,
      notes: form.notes.trim() || undefined
    }
    const ok = await run('create', () => api.post('/bookings', payload), 'Booking requested')
    if (ok) {
      setOpen(false)
      setForm(EMPTY_FORM)
    }
  }

  const columns = [
    { key: 'amenity', header: 'Amenity', render: (b) => <span className="font-semibold">{b.amenity}</span> },
    ...(isResident ? [] : [{ key: 'who', header: 'Booked by', render: (b) => `${b.residentId?.name || '-'}${b.residentId?.flatNo ? ` (${b.residentId.flatNo})` : ''}` }]),
    { key: 'date', header: 'Date', render: (b) => formatDate(b.slotDate) },
    { key: 'time', header: 'Time', render: timeRange },
    { key: 'status', header: 'Status', render: (b) => <StatusTag status={b.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'md:text-right',
      render: (b) => (
        <div className="flex flex-wrap justify-end gap-2">
          {isAdmin && b.status === 'pending' && (
            <>
              <button className="btn-ok btn-sm" disabled={busy === b._id} onClick={() => run(b._id, () => api.put(`/bookings/${b._id}/approve`), 'Booking approved')}>
                <FiCheck size={14} /> Approve
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setRejecting(b)}>
                <FiX size={14} /> Reject
              </button>
            </>
          )}
          {isResident && ['pending', 'approved'].includes(b.status) && new Date(b.startTime) > new Date() && (
            <button className="btn-secondary btn-sm" onClick={() => setCancelling(b)}>Cancel</button>
          )}
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title="Amenities"
        subtitle={isResident ? 'Book the clubhouse, courts and other shared spaces.' : 'Booking requests for shared spaces.'}
        action={
          isResident && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <FiPlus size={16} /> Book amenity
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter bookings">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${filter === f.key ? 'bg-brand text-brand-ink' : 'bg-surface text-muted ring-1 ring-line hover:text-ink'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <DataList
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={
          <EmptyState
            icon={FiCalendar}
            title="No bookings"
            text={isResident ? 'Reserve a space for a time that suits you.' : 'Requests will appear here when residents book.'}
            action={isResident ? <button className="btn-primary" onClick={() => setOpen(true)}>Book amenity</button> : null}
          />
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Book an amenity"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="booking-form" type="submit" disabled={busy === 'create'}>
              {busy === 'create' && <Spinner className="h-4 w-4" />}
              Request booking
            </button>
          </>
        }
      >
        <form id="booking-form" onSubmit={submit} className="space-y-4">
          <Field label="Amenity" htmlFor="b-amenity">
            {amenities?.length ? (
              <select id="b-amenity" required className="input" value={form.amenity} onChange={(e) => setForm({ ...form, amenity: e.target.value })}>
                <option value="">Select amenity</option>
                {amenities.map((a) => <option key={a._id || a.name} value={a.name}>{a.name}</option>)}
              </select>
            ) : (
              <input id="b-amenity" required className="input" placeholder="Clubhouse" value={form.amenity} onChange={(e) => setForm({ ...form, amenity: e.target.value })} />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" htmlFor="b-date">
              <input id="b-date" type="date" required min={today()} className="input" value={form.slotDate} onChange={(e) => setForm({ ...form, slotDate: e.target.value })} />
            </Field>
            <Field label="From" htmlFor="b-start">
              <input id="b-start" type="time" required className="input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </Field>
            <Field label="To" htmlFor="b-end">
              <input id="b-end" type="time" required className="input" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </Field>
          </div>
          <Field label="Number of guests" htmlFor="b-guests">
            <input id="b-guests" type="number" min="0" className="input" value={form.numberOfGuests} onChange={(e) => setForm({ ...form, numberOfGuests: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="b-notes" hint="Optional">
            <textarea id="b-notes" rows={2} className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!cancelling}
        danger
        title="Cancel this booking?"
        text={`Your ${cancelling?.amenity} booking on ${formatDate(cancelling?.slotDate)} will be released for others.`}
        confirmLabel="Cancel booking"
        busy={busy === cancelling?._id}
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          const ok = await run(cancelling._id, () => api.put(`/bookings/${cancelling._id}/cancel`), 'Booking cancelled')
          if (ok) setCancelling(null)
        }}
      />

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject booking"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setRejecting(null)}>Cancel</button>
            <button
              className="btn-danger"
              disabled={busy === rejecting?._id}
              onClick={async () => {
                const ok = await run(rejecting._id, () => api.put(`/bookings/${rejecting._id}/reject`, { reason: reason.trim() || undefined }), 'Booking rejected')
                if (ok) { setRejecting(null); setReason('') }
              }}
            >
              Reject booking
            </button>
          </>
        }
      >
        <Field label="Reason for the resident" htmlFor="b-reason" hint="Optional">
          <input id="b-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}

export default Bookings
