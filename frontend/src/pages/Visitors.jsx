import { useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { FiCheck, FiLogIn, FiLogOut, FiPlus, FiUsers, FiX } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { passCode } from '../utils/pass'
import { DataList, EmptyState, Field, Modal, PageHeader, Spinner, StatusTag, formatDate, titleCase } from '../components/ui'

const PURPOSES = ['personal', 'business', 'delivery', 'service', 'other']
const EMPTY_FORM = { name: '', phone: '', purpose: 'personal', numberOfVisitors: 1, vehicleNumber: '', expectedArrival: '' }

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Needs approval' },
  { key: 'approved', label: 'Expected' },
  { key: 'checked_in', label: 'Inside' },
  { key: 'checked_out', label: 'Left' }
]

const Visitors = () => {
  const { isResident, isSecurity, isAdmin } = useAuth()
  const [filter, setFilter] = useState('all')
  const { data, loading, error, reload } = useApi('/visitors', { params: { limit: 100 }, select: (d) => d.visitors || [] })
  const { busy, run } = useAction(reload)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [passFor, setPassFor] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')

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

    const res = await run('invite', () => api.post('/visitors/invite', payload), 'Invitation sent. Your guest can now enter.')
    if (res) {
      setInviteOpen(false)
      setForm(EMPTY_FORM)
      setPassFor(res.data.visitor)
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Visitor',
      render: (v) => (
        <div className="md:text-left">
          <p className="font-semibold">{v.name}</p>
          <p className="text-xs text-muted">{v.phone}</p>
        </div>
      )
    },
    ...(isResident
      ? []
      : [
          {
            key: 'host',
            header: 'Visiting',
            render: (v) => `${v.block ? `${v.block}-` : ''}${v.flatNo || '-'}${v.residentId?.name ? ` (${v.residentId.name})` : ''}`
          }
        ]),
    { key: 'purpose', header: 'Purpose', render: (v) => titleCase(v.purpose) },
    { key: 'when', header: 'When', render: (v) => formatDate(v.entryTime || v.expectedArrival || v.createdAt, true) },
    { key: 'status', header: 'Status', render: (v) => <StatusTag status={v.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'md:text-right',
      render: (v) => {
        const isBusy = busy === v._id
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {(isResident || isAdmin) && v.status === 'pending' && (
              <>
                <button className="btn-ok btn-sm" disabled={isBusy} onClick={() => run(v._id, () => api.put(`/visitors/${v._id}/approve`), 'Visitor approved')}>
                  <FiCheck size={14} /> Approve
                </button>
                <button className="btn-secondary btn-sm" disabled={isBusy} onClick={() => setRejecting(v)}>
                  <FiX size={14} /> Reject
                </button>
              </>
            )}
            {isResident && ['approved', 'checked_in'].includes(v.status) && (
              <button className="btn-secondary btn-sm" onClick={() => setPassFor(v)}>
                Show pass
              </button>
            )}
            {(isSecurity || isAdmin) && v.status === 'approved' && (
              <button className="btn-primary btn-sm" disabled={isBusy} onClick={() => run(v._id, () => api.put(`/visitors/${v._id}/check-in`), 'Checked in')}>
                <FiLogIn size={14} /> Check in
              </button>
            )}
            {(isSecurity || isAdmin) && v.status === 'checked_in' && (
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
          isResident && (
            <button className="btn-primary" onClick={() => setInviteOpen(true)}>
              <FiPlus size={16} /> Invite visitor
            </button>
          )
        }
      />

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

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite visitor"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="invite-form" type="submit" disabled={busy === 'invite'}>
              {busy === 'invite' && <Spinner className="h-4 w-4" />}
              Send invitation
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

      <Modal open={!!passFor} onClose={() => setPassFor(null)} title="Gate pass" size="sm" footer={<button className="btn-primary" onClick={() => setPassFor(null)}>Done</button>}>
        {passFor && (
          <div className="text-center">
            <div className="mx-auto inline-block rounded-lg bg-white p-3 ring-1 ring-line">
              <QRCodeSVG value={passFor.qrCode} size={176} />
            </div>
            <p className="mt-3 font-display text-lg font-bold">{passFor.name}</p>
            <p className="mt-3 text-xs text-muted">Pass code for the guard</p>
            <p className="font-mono text-2xl font-bold tracking-widest">{passCode(passFor) || '-'}</p>
            <p className="mt-3 text-sm text-muted">Share this with your guest. The guard can scan the code or type the pass code.</p>
          </div>
        )}
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
