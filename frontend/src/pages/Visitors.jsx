import { useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { FiCheck, FiCopy, FiEdit2, FiLogIn, FiLogOut, FiPlus, FiShare2, FiUsers, FiX } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { passCode } from '../utils/pass'
import ExportButtons from '../components/ExportButtons'
import CheckInSheet from '../components/CheckInSheet'
import VisitorCard from '../components/VisitorCard'
import HelperGate from '../components/HelperGate'
import HelperPass from '../components/HelperPass'
import { clock, clockWithDay, flatText, floorOf, isOverdue, minutesOver, overText } from '../utils/gate'
import { Avatar, ConfirmDialog, DataList, EmptyState, Field, Modal, PageHeader, Spinner, StatusTag, formatDate, titleCase } from '../components/ui'

const PURPOSES = ['personal', 'business', 'delivery', 'service', 'other']
const EMPTY_FORM = { name: '', phone: '', purpose: 'personal', numberOfVisitors: 1, vehicleNumber: '', expectedArrival: '' }

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Needs approval' },
  { key: 'approved', label: 'Expected' },
  { key: 'checked_in', label: 'Inside' },
  { key: 'checked_out', label: 'Left' }
]

const EXPORT_COLUMNS = [
  { header: 'Date', value: (v) => formatDate(v.entryTime || v.expectedArrival || v.createdAt, true) },
  { header: 'Visitor', value: (v) => v.name },
  { header: 'Phone', value: (v) => v.phone },
  { header: 'Visiting', value: (v) => `${v.block ? `${v.block}-` : ''}${v.flatNo || ''}` },
  { header: 'Resident', value: (v) => v.residentId?.name || '' },
  { header: 'Purpose', value: (v) => titleCase(v.purpose) },
  { header: 'People', value: (v) => v.numberOfVisitors || 1 },
  { header: 'Approved by', value: (v) => v.approvedBy?.name || '' },
  { header: 'In', value: (v) => (v.entryTime ? formatDate(v.entryTime, true) : '') },
  { header: 'Expected out', value: (v) => (v.expectedExit ? formatDate(v.expectedExit, true) : '') },
  { header: 'Out', value: (v) => (v.exitTime ? formatDate(v.exitTime, true) : '') },
  { header: 'Status', value: (v) => titleCase(v.status) }
]

const GatePass = ({ visitor, host }) => {
  const code = passCode(visitor) || '-'
  const when = visitor.expectedArrival ? formatDate(visitor.expectedArrival, true) : 'Any time today'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Pass code copied')
    } catch (e) {
      toast.error('Could not copy. Read the code out instead.')
    }
  }
  const share = async () => {
    const text = `Your Nivora gate pass for ${flatText(visitor)}. Pass code: ${code}.`
    try {
      if (navigator.share) await navigator.share({ title: 'Gate pass', text })
      else await navigator.clipboard.writeText(text)
      if (!navigator.share) toast.success('Message copied. Paste it to your guest.')
    } catch (e) {
      /* the person closed the share sheet */
    }
  }
  return (
    <div className="mx-auto max-w-[19rem]">
      <div className="overflow-hidden rounded-2xl bg-brand text-brand-ink shadow-lift">
        <div className="px-5 pb-5 pt-4">
          <p className="text-xs font-semibold opacity-80">Nivora gate pass</p>
          <p className="mt-1 font-display text-2xl font-extrabold leading-tight">{visitor.name}</p>
          <p className="mt-0.5 text-sm opacity-90">{`Visiting ${host?.name || 'a resident'}`}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs opacity-75">Flat</dt><dd className="font-semibold">{flatText(visitor)}</dd></div>
            <div><dt className="text-xs opacity-75">Floor</dt><dd className="font-semibold">{floorOf(visitor.flatNo) || '-'}</dd></div>
            <div className="col-span-2"><dt className="text-xs opacity-75">Arriving</dt><dd className="font-semibold">{when}</dd></div>
          </dl>
        </div>
        <div className="ticket-notch relative border-t-2 border-dashed border-brand-ink/30" aria-hidden="true" />
        <div className="bg-surface px-5 pb-5 pt-5 text-center text-ink">
          <div className="mx-auto inline-block rounded-xl bg-white p-2.5 ring-1 ring-line">
            <QRCodeSVG value={visitor.qrCode} size={168} />
          </div>
          <p className="mt-3 text-xs font-semibold text-muted">Pass code for the guard</p>
          <p className="font-mono text-2xl font-bold tracking-[0.25em]">{code}</p>
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-muted">Share this with your guest. They show the QR code or say the pass code to get in, and again to leave.</p>
      <div className="mt-3 flex justify-center gap-2 print:hidden">
        <button className="btn-secondary btn-sm" onClick={copy}><FiCopy size={14} /> Copy code</button>
        <button className="btn-secondary btn-sm" onClick={share}><FiShare2 size={14} /> Share</button>
      </div>
    </div>
  )
}

const Visitors = () => {
  const { user, isResident, isSecurity, isAdmin } = useAuth()
  const [filter, setFilter] = useState('all')
  const { data, loading, error, reload } = useApi('/visitors', { params: { limit: 500 }, select: (d) => d.visitors || [] })
  const { busy, run } = useAction(reload)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [passFor, setPassFor] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [editing, setEditing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [reason, setReason] = useState('')
  const [checkingIn, setCheckingIn] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [section, setSection] = useState('visitors')
  const [helperPass, setHelperPass] = useState(null)
  const help = useApi('/daily-help', { enabled: section === 'help' && !(isSecurity || isAdmin), select: (d) => d.helpers || [] })

  const visitors = useMemo(
    () => (filter === 'all' ? data || [] : (data || []).filter((v) => v.status === filter)),
    [data, filter]
  )

  const counts = useMemo(() => {
    const c = { all: (data || []).length }
    ;(data || []).forEach((v) => {
      c[v.status] = (c[v.status] || 0) + 1
    })
    return c
  }, [data])

  const submitInvite = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!/^[0-9]{10}$/.test(form.phone)) return setFormError('Enter a 10-digit phone number.')
    const payload = { ...form, numberOfVisitors: Number(form.numberOfVisitors) || 1 }
    if (!payload.expectedArrival) delete payload.expectedArrival
    else payload.expectedArrival = new Date(payload.expectedArrival).toISOString()
    if (!payload.vehicleNumber) delete payload.vehicleNumber

    if (editing) {
      const done = await run('invite', () => api.put(`/visitors/${editing._id}`, { ...payload, expectedArrival: payload.expectedArrival || null }), 'Invitation updated')
      if (done) {
        setInviteOpen(false)
        setEditing(null)
        setForm(EMPTY_FORM)
      }
      return
    }
    const res = await run('invite', () => api.post('/visitors/invite', payload), 'Invitation sent. Your guest can now enter.')
    if (res) {
      setInviteOpen(false)
      setForm(EMPTY_FORM)
      setPassFor(res.data.visitor)
    }
  }

  const toLocalInput = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  const openEdit = (v) => {
    setEditing(v)
    setFormError('')
    setForm({
      name: v.name || '',
      phone: v.phone || '',
      purpose: v.purpose || 'personal',
      numberOfVisitors: v.numberOfVisitors || 1,
      vehicleNumber: v.vehicleNumber || '',
      expectedArrival: toLocalInput(v.expectedArrival)
    })
    setInviteOpen(true)
  }

  const columns = [
    {
      key: 'name',
      header: 'Visitor',
      render: (v) => (
        <button className="flex items-center gap-3 text-left md:text-left" onClick={() => setViewing(v)} aria-label={`Details of ${v.name}`}>
          <Avatar name={v.name} size={36} />
          <span>
            <span className="block font-semibold">{v.name}</span>
            <span className="block text-xs text-muted">{v.phone}</span>
          </span>
        </button>
      )
    },
    ...(isResident
      ? []
      : [
          {
            key: 'host',
            header: 'Visiting',
            render: (v) => (
              <span className="md:text-left">
                <span className="block font-semibold">{flatText(v)}{floorOf(v.flatNo) ? <span className="font-normal text-muted"> · {floorOf(v.flatNo)}</span> : null}</span>
                {v.residentId?.name && <span className="block text-xs text-muted">{v.residentId.name}</span>}
              </span>
            )
          }
        ]),
    { key: 'purpose', header: 'Purpose', render: (v) => titleCase(v.purpose) },
    {
      key: 'when',
      header: 'When',
      render: (v) => (
        <span className="md:text-left">
          <span className="block">{formatDate(v.entryTime || v.expectedArrival || v.createdAt, true)}</span>
          {v.status === 'checked_in' && v.expectedExit && (
            <span className={`block text-xs ${isOverdue(v) ? 'font-semibold text-danger' : 'text-muted'}`}>
              {isOverdue(v) ? overText(minutesOver(v)) : `Out by ${clockWithDay(v.expectedExit)}`}
            </span>
          )}
          {v.status === 'checked_out' && v.exitTime && <span className="block text-xs text-muted">Left {clock(v.exitTime)}</span>}
        </span>
      )
    },
    { key: 'status', header: 'Status', render: (v) => <StatusTag status={v.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'md:text-right',
      render: (v) => {
        const isBusy = busy === v._id
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {isResident && v.status === 'pending' && (
              <>
                <button className="btn-ok btn-sm" disabled={isBusy} onClick={() => run(v._id, () => api.put(`/visitors/${v._id}/approve`), 'Visitor approved')}>
                  <FiCheck size={14} /> Approve
                </button>
                <button className="btn-secondary btn-sm" disabled={isBusy} onClick={() => setRejecting(v)}>
                  <FiX size={14} /> Reject
                </button>
              </>
            )}
            {!isResident && v.status === 'pending' && <span className="text-xs text-muted">Waiting for the resident</span>}
            {isResident && ['pending', 'approved'].includes(v.status) && (
              <>
                <button className="btn-secondary btn-sm" disabled={isBusy} onClick={() => openEdit(v)}>
                  <FiEdit2 size={14} /> Edit
                </button>
                {v.status === 'approved' && (
                  <button className="btn-secondary btn-sm" disabled={isBusy} onClick={() => setCancelling(v)}>
                    <FiX size={14} /> Cancel
                  </button>
                )}
              </>
            )}
            {isResident && v.requiresCode !== false && ['approved', 'checked_in'].includes(v.status) && (
              <button className="btn-secondary btn-sm" onClick={() => setPassFor(v)}>
                {v.status === 'checked_in' ? 'Show pass to leave' : 'Show pass'}
              </button>
            )}
            {/* Invited guests are let in and out at the gate with their code. Only walk-ins the guard logged are handled by hand. */}
            {(isSecurity || isAdmin) && v.requiresCode !== false && ['approved', 'checked_in'].includes(v.status) && (
              <Link to="/gate" className="btn-secondary btn-sm">{v.status === 'approved' ? 'Check in at the gate' : 'Check out at the gate'}</Link>
            )}
            {(isSecurity || isAdmin) && v.requiresCode === false && v.status === 'approved' && (
              <button className="btn-primary btn-sm" disabled={isBusy} onClick={() => setCheckingIn(v)}>
                <FiLogIn size={14} /> Check in
              </button>
            )}
            {(isSecurity || isAdmin) && v.requiresCode === false && v.status === 'checked_in' && (
              <button className="btn-secondary btn-sm" disabled={isBusy} onClick={() => run(v._id, () => api.put(`/visitors/${v._id}/check-out`), 'Checked out')}>
                <FiLogOut size={14} /> Check out
              </button>
            )}
          </div>
        )
      }
    }
  ]

  return (
    <>
      <PageHeader
        title="Visitors"
        subtitle={
          isResident
            ? 'Invite guests ahead of time. Anyone the guard logs at the gate waits here for your approval.'
            : 'Everyone who has been invited or logged at the gate.'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons filename="visitors" title="Visitors" rows={visitors} columns={EXPORT_COLUMNS} />
            {isResident && (
              <button className="btn-primary" onClick={() => { setEditing(null); setForm(EMPTY_FORM); setFormError(''); setInviteOpen(true) }}>
                <FiPlus size={16} /> Invite visitor
              </button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex gap-1 rounded-xl bg-sunken p-1" role="tablist" aria-label="Visitors sections">
        {[['visitors', 'Visitors'], ['help', 'Daily help']].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={section === key} onClick={() => setSection(key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${section === key ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {section === 'help' ? (
        isSecurity || isAdmin ? <HelperGate /> : (
          <div>
            <p className="mb-4 max-w-prose text-sm text-muted">Your maid, cook or driver shows a QR code (or says their code) when they arrive and when they leave. Nobody is checked in with a click.</p>
            {help.loading ? <div className="skeleton h-28" /> : help.error ? <p role="alert" className="text-sm text-danger">{help.error}</p> : !help.data?.length ? (
              <EmptyState icon={FiUsers} title="No daily help yet" text="Add your maid, cook or driver to get a pass for them." action={<Link to="/daily-help" className="btn-primary">Add daily help</Link>} />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {help.data.map((h) => (
                  <li key={h._id} className="panel flex items-center gap-3 p-4">
                    <Avatar name={h.name} src={h.photo} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{h.name}</p>
                      <p className="text-xs text-muted">
                        {h.today?.status === 'inside' ? `Inside since ${clock(h.today.checkIn)}` : h.today?.status === 'left' ? `Left at ${clock(h.today.checkOut)}` : 'Not arrived today'}
                      </p>
                    </div>
                    <button className="btn-secondary btn-sm" onClick={() => setHelperPass(h)}>{h.today?.status === 'inside' ? 'Show pass to leave' : 'Show pass'}</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm"><Link to="/daily-help" className="font-semibold text-brand hover:underline">Manage daily help and attendance</Link></p>
          </div>
        )
      ) : (
      <>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter visitors">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              filter === f.key ? 'bg-brand text-brand-ink' : 'bg-surface text-muted ring-1 ring-line hover:text-ink'
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-xs opacity-80">{counts[f.key] || 0}</span>
          </button>
        ))}
      </div>

      <DataList
        columns={columns}
        rows={visitors}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={
          <EmptyState
            icon={FiUsers}
            title={filter === 'all' ? 'No visitors yet' : 'Nothing in this view'}
            text={isResident ? 'Invite a guest and they will show up here with a pass for the gate.' : 'Visitors will appear here as they are invited or logged.'}
            action={
              isResident && filter === 'all' ? (
                <button className="btn-primary" onClick={() => setInviteOpen(true)}>
                  Invite visitor
                </button>
              ) : null
            }
          />
        }
      />

      </>
      )}

      <HelperPass helper={helperPass} onClose={() => setHelperPass(null)} />

      <Modal
        open={inviteOpen}
        onClose={() => { setInviteOpen(false); setEditing(null) }}
        title={editing ? 'Edit invitation' : 'Invite visitor'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setInviteOpen(false); setEditing(null) }}>
              Cancel
            </button>
            <button className="btn-primary" form="invite-form" type="submit" disabled={busy === 'invite'}>
              {busy === 'invite' && <Spinner className="h-4 w-4" />}
              {editing ? 'Save changes' : 'Send invitation'}
            </button>
          </>
        }
      >
        <form id="invite-form" onSubmit={submitInvite} className="space-y-4">
          <Field label="Visitor name" htmlFor="v-name">
            <input id="v-name" required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone number" htmlFor="v-phone">
              <input id="v-phone" required type="tel" inputMode="numeric" maxLength={10} className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Purpose" htmlFor="v-purpose">
              <select id="v-purpose" className="input" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}>
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {titleCase(p)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Number of people" htmlFor="v-count">
              <input id="v-count" type="number" min="1" max="50" className="input" value={form.numberOfVisitors} onChange={(e) => setForm({ ...form, numberOfVisitors: e.target.value })} />
            </Field>
            <Field label="Expected arrival" htmlFor="v-when" hint="Optional">
              <input id="v-when" type="datetime-local" className="input" value={form.expectedArrival} onChange={(e) => setForm({ ...form, expectedArrival: e.target.value })} />
            </Field>
          </div>
          <Field label="Vehicle number" htmlFor="v-vehicle" hint="Optional">
            <input id="v-vehicle" className="input uppercase" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} />
          </Field>
          {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!cancelling}
        title="Cancel this invitation?"
        text={`${cancelling?.name}'s pass will stop working at the gate.`}
        confirmLabel="Cancel invitation"
        danger
        busy={busy === cancelling?._id}
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          const ok = await run(cancelling._id, () => api.put(`/visitors/${cancelling._id}/reject`, { reason: 'Cancelled by resident' }), 'Invitation cancelled')
          if (ok) setCancelling(null)
        }}
      />

      <Modal open={!!passFor} onClose={() => setPassFor(null)} title="Gate pass" size="sm" footer={<button className="btn-primary" onClick={() => setPassFor(null)}>Done</button>}>
        {passFor && <GatePass visitor={passFor} host={user} />}
      </Modal>

      <CheckInSheet visitor={checkingIn} onClose={() => setCheckingIn(null)} onDone={async (v) => { setCheckingIn(null); toast.success(`${v.name} checked in`); await reload() }} />

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Visitor details" size="lg">
        {viewing && <VisitorCard visitor={viewing} />}
      </Modal>

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject visitor"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setRejecting(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              disabled={busy === rejecting?._id}
              onClick={async () => {
                const ok = await run(rejecting._id, () => api.put(`/visitors/${rejecting._id}/reject`, { reason: reason.trim() || undefined }), 'Visitor rejected')
                if (ok) {
                  setRejecting(null)
                  setReason('')
                }
              }}
            >
              Reject visitor
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">The guard will see that {rejecting?.name} was turned away.</p>
        <Field label="Reason" htmlFor="reason" hint="Optional">
          <input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}

export default Visitors
