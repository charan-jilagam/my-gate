import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiCalendar, FiCheck, FiPlus, FiX } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { ConfirmDialog, DataList, EmptyState, ErrorState, Field, Modal, PageHeader, Spinner, StatusTag, formatDate, formatINR } from '../components/ui'
import { dayLabel, dayParts, timeLabel } from '../utils/services'
import AmenityManager from '../components/AmenityManager'
import { amenityIcon } from '../utils/amenity'

const EMPTY_FORM = { amenity: '', date: '', picked: [], numberOfGuests: 0, notes: '' }
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' }
]

const timeRange = (b) => {
  const f = (v) => new Date(v).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  return `${f(b.startTime)} to ${f(b.endTime)}`
}

// Today's date in the society's time zone. A missing or unknown zone falls back to India time instead of breaking the page.
const todayIn = (zone) => {
  for (const tz of [zone, 'Asia/Kolkata']) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined }).format(new Date())
    } catch (e) {
      /* try the next zone */
    }
  }
  return new Date().toISOString().slice(0, 10)
}

const REASON = { past: 'That day has passed', too_far: 'Too far ahead to book', paused: 'Not available', no_slots: 'No slots on this day', invalid_date: 'Pick a valid date', too_soon: 'Too soon', booked: 'Booked' }

/** Day strip + slot grid for one amenity. Slots in a row can be picked together. */
const SlotGrid = ({ amenity, date, onDate, picked, onPick, today, refreshKey }) => {
  const day = useApi('/bookings/availability', { params: { amenity: amenity.name, date, k: refreshKey }, enabled: !!date, live: false })
  const strip = Array.from({ length: Math.min(Number(amenity.maxAdvanceDays) || 30, 14) + 1 }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
  const max = Number(amenity.maxSlotsPerBooking) || 3

  const toggle = (slot) => {
    const has = picked.some((p) => p.start === slot.start)
    if (has) {
      // Only an end slot can be removed, so the selection stays one unbroken block.
      const sorted = [...picked].sort((a, b) => a.start.localeCompare(b.start))
      const edge = sorted[0].start === slot.start || sorted[sorted.length - 1].start === slot.start
      return onPick(edge ? picked.filter((p) => p.start !== slot.start) : [slot])
    }
    if (!picked.length) return onPick([slot])
    const sorted = [...picked].sort((a, b) => a.start.localeCompare(b.start))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (slot.start === last.end && picked.length < max) return onPick([...sorted, slot])
    if (slot.end === first.start && picked.length < max) return onPick([slot, ...sorted])
    return onPick([slot])
  }

  return (
    <div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Pick a day">
        {strip.map((d) => {
          const p = dayParts(d)
          const on = d === date
          return (
            <button key={d} type="button" role="option" aria-selected={on} onClick={() => onDate(d)}
              className={`flex w-14 shrink-0 flex-col items-center rounded-lg border py-2 ${on ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface hover:border-brand'}`}>
              <span className="text-[11px] font-semibold uppercase">{p.weekday}</span>
              <span className="font-display text-xl font-extrabold leading-none">{p.day}</span>
              <span className="text-[11px]">{p.month}</span>
            </button>
          )
        })}
      </div>

      {!date ? <p className="mt-2 text-sm text-muted">Choose a day to see the free slots.</p> : day.loading || (!day.data && !day.error) ? <div className="skeleton mt-2 h-32" /> : day.error ? <ErrorState message={day.error} onRetry={day.reload} /> : day.data.closed ? (
        <p className="mt-2 rounded-md bg-sunken px-3 py-3 text-sm text-muted">{REASON[day.data.reason] || 'Closed'}</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Time slots">
          {(day.data.slots || []).map((s) => {
            const on = picked.some((p) => p.start === s.start)
            return (
              <button key={s.start} type="button" disabled={!s.available} aria-pressed={on} onClick={() => toggle(s)}
                className={`rounded-md border px-2 py-2 text-sm font-semibold ${on ? 'border-brand bg-brand text-brand-ink' : s.available ? 'border-line bg-surface hover:border-brand' : 'cursor-not-allowed border-line bg-sunken text-muted line-through'}`}
                title={s.available ? undefined : REASON[s.reason]}>
                {timeLabel(s.start)}
              </button>
            )
          })}
        </div>
      )}
      {max > 1 && <p className="mt-2 text-xs text-muted">Tap neighbouring slots to book up to {max} in a row.</p>}
    </div>
  )
}

const Bookings = () => {
  const { t } = useT()
  const { user, isResident, isAdmin: isOfficeAdmin } = useAuth()
  // Staff can approve and reject booking requests too. Only the admin sets up the amenities.
  const isAdmin = isOfficeAdmin || user?.role === 'staff'
  const canManage = user?.role === 'society_admin'
  const [view, setView] = useState('bookings')
  const { data, loading, error, reload } = useApi('/bookings', { params: { limit: 100 }, select: (d) => d.bookings || [] })
  const amenityInfo = useApi('/bookings/amenities', { enabled: isResident, live: false })
  const amenities = amenityInfo.data?.amenities
  const [refreshKey, setRefreshKey] = useState(0)
  const { busy, run } = useAction(reload)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [cancelling, setCancelling] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')

  const rows = useMemo(() => (filter === 'all' ? data || [] : (data || []).filter((b) => b.status === filter)), [data, filter])

  const chosen = amenities?.find((a) => a.name === form.amenity)
  const sortedPick = [...form.picked].sort((a, b) => a.start.localeCompare(b.start))
  const startTime = sortedPick[0]?.start
  const endTime = sortedPick[sortedPick.length - 1]?.end
  const price = chosen && sortedPick.length ? (chosen.hourlyRate * sortedPick.length * chosen.slotMinutes) / 60 : 0
  const todayStr = amenityInfo.data ? todayIn(amenityInfo.data.timezone) : ''

  const submit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!chosen) return setFormError('Choose an amenity.')
    if (!form.date || !sortedPick.length) return setFormError('Pick a day and at least one time slot.')
    if (chosen.capacity && Number(form.numberOfGuests) + 1 > chosen.capacity) return setFormError(`${chosen.name} fits ${chosen.capacity} people.`)

    const ok = await run('create', () => api.post('/bookings', {
      amenity: chosen.name,
      date: form.date,
      startTime,
      endTime,
      numberOfGuests: Number(form.numberOfGuests) || 0,
      notes: form.notes.trim() || undefined
    }), chosen.requiresApproval ? 'Request sent' : 'Booked')
    if (ok) {
      setOpen(false)
      setForm(EMPTY_FORM)
    } else {
      // The slot may have just been taken: show what is free now.
      setForm((f) => ({ ...f, picked: [] }))
      setRefreshKey((n) => n + 1)
    }
  }

  const columns = [
    { key: 'amenity', header: 'Amenity', render: (b) => <span className="font-semibold">{b.amenity}</span> },
    ...(isResident ? [] : [{ key: 'who', header: 'Booked by', render: (b) => `${b.residentId?.name || '-'}${b.residentId?.flatNo ? ` (${b.residentId.flatNo})` : ''}` }]),
    { key: 'date', header: 'Date', render: (b) => (b.dateStr ? dayLabel(b.dateStr) : formatDate(b.slotDate)) },
    { key: 'time', header: 'Time', render: timeRange },
    { key: 'amount', header: 'Amount', render: (b) => (b.amount ? formatINR(b.amount) : 'No charge') },
    { key: 'status', header: 'Status', render: (b) => <StatusTag status={b.status} /> },
    ...(isResident || isAdmin ? [{
      key: 'pay',
      header: 'Payment',
      render: (b) => {
        if (!b.amount) return <span className="text-muted">-</span>
        const st = b.paymentId?.status
        if (st === 'completed') return <StatusTag status="completed" label="Paid" />
        if (st === 'refunded') return <StatusTag status="refunded" label="Refunded" />
        if (st === 'pending' || st === 'processing') {
          return isResident
            ? <Link className="btn-primary btn-sm" to={`/payments?highlight=${b.paymentId._id || b.paymentId}`}>{t('Pay')} {formatINR(b.amount)}</Link>
            : <StatusTag status="pending" label="Waiting for payment" />
        }
        return <span className="text-sm text-muted">{b.status === 'pending' ? 'Due after approval' : '-'}</span>
      }
    }] : []),
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
          {['pending', 'approved'].includes(b.status) && new Date(b.startTime) > new Date() && (isResident || isAdmin) && (
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
        subtitle={isResident ? 'Book the clubhouse, courts and other shared spaces.' : canManage ? 'Choose which spaces residents can book, and handle their requests.' : 'Booking requests for shared spaces.'}
        action={
          isResident && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <FiPlus size={16} /> Book amenity
            </button>
          )
        }
      />

      {canManage && (
        <div className="mb-5 flex gap-1 rounded-xl bg-sunken p-1" role="tablist" aria-label="Amenities sections">
          {[['bookings', 'Booking requests'], ['amenities', 'Our amenities']].map(([key, label]) => (
            <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${view === key ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {canManage && view === 'amenities' ? <AmenityManager /> : (
      <>
      {isResident && amenities?.length > 0 && (
        <section className="mb-6" aria-label="Spaces you can book">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {amenities.map((a) => {
              const Icon = amenityIcon(a.name)
              return (
                <li key={a._id}>
                  <button className="panel-link flex w-full items-center gap-3 p-4 text-left" onClick={() => { setForm({ ...EMPTY_FORM, amenity: a.name }); setFormError(''); setOpen(true) }}>
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon size={20} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display font-bold">{a.name}</span>
                      <span className="block text-xs text-muted">{`${timeLabel(a.openTime)} to ${timeLabel(a.closeTime)} · ${a.hourlyRate ? `${formatINR(a.hourlyRate)} per hour` : 'No charge'}`}</span>
                    </span>
                    <span className="text-sm font-semibold text-brand">Book</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter bookings">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${filter === f.key ? 'bg-brand text-brand-ink' : 'bg-surface text-muted ring-1 ring-edge hover:text-ink'}`}>
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

      </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Book an amenity"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="booking-form" type="submit" disabled={busy === 'create' || !sortedPick.length}>
              {busy === 'create' && <Spinner className="h-4 w-4" />}
              {chosen && !chosen.requiresApproval ? 'Book now' : 'Request booking'}
            </button>
          </>
        }
      >
        <form id="booking-form" onSubmit={submit} className="space-y-4">
          {amenityInfo.loading ? <div className="skeleton h-10" /> : !amenities?.length ? (
            <p className="rounded-md bg-sunken px-3 py-3 text-sm text-muted">The society office has not set up any amenities for booking yet.</p>
          ) : (
            <>
              <Field label="Amenity" htmlFor="b-amenity" hint={chosen ? `Open ${timeLabel(chosen.openTime)} to ${timeLabel(chosen.closeTime)}. ${chosen.hourlyRate ? `${formatINR(chosen.hourlyRate)} per hour.` : 'No charge.'}${chosen.requiresApproval ? ' Needs approval from the office.' : ' Confirmed instantly.'}` : undefined}>
                <select id="b-amenity" required className="input" value={form.amenity} onChange={(e) => setForm({ ...EMPTY_FORM, amenity: e.target.value })}>
                  <option value="">Select amenity</option>
                  {amenities.map((a) => <option key={a._id} value={a.name}>{a.name}</option>)}
                </select>
              </Field>
              {chosen && (
                <SlotGrid amenity={chosen} today={todayStr} date={form.date} onDate={(d) => setForm({ ...form, date: d, picked: [] })} picked={form.picked} onPick={(picked) => setForm({ ...form, picked })} refreshKey={refreshKey} />
              )}
              {chosen && sortedPick.length > 0 && (
                <p className="rounded-md bg-brand-soft px-3 py-2 text-sm font-semibold" role="status">
                  {dayLabel(form.date)}, {timeLabel(startTime)} to {timeLabel(endTime)} · {price ? formatINR(price) : 'No charge'}
                </p>
              )}
              <Field label="Number of guests" htmlFor="b-guests" hint={chosen?.capacity ? `Capacity ${chosen.capacity} including you` : undefined}>
                <input id="b-guests" type="number" min="0" className="input" value={form.numberOfGuests} onChange={(e) => setForm({ ...form, numberOfGuests: e.target.value })} />
              </Field>
              <Field label="Notes" htmlFor="b-notes" hint="Optional">
                <textarea id="b-notes" rows={2} className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </>
          )}
          {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!cancelling}
        danger
        title="Cancel this booking?"
        text={`Your ${cancelling?.amenity} booking on ${cancelling?.dateStr ? dayLabel(cancelling.dateStr) : formatDate(cancelling?.slotDate)} will be released for others.`}
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
