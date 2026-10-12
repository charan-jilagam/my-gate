import { useState } from 'react'
import { FiCheck, FiLogIn, FiPackage, FiPlus } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { DataList, EmptyState, Field, Modal, PageHeader, Spinner, StatusTag, formatDate } from '../components/ui'

const EMPTY_FORM = { deliveryPersonName: '', deliveryPersonPhone: '', company: '', trackingNumber: '', items: '', notes: '' }

const Deliveries = () => {
  const { isResident, isSecurity, isAdmin } = useAuth()
  const { data, loading, error, reload } = useApi('/deliveries', { params: { limit: 100 }, select: (d) => d.deliveries || [] })
  const { busy, run } = useAction(reload)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!/^[0-9]{10}$/.test(form.deliveryPersonPhone)) return setFormError('Enter the courier\'s 10-digit phone number.')
    const payload = {
      deliveryPersonName: form.deliveryPersonName.trim(),
      deliveryPersonPhone: form.deliveryPersonPhone,
      company: form.company.trim() || undefined,
      trackingNumber: form.trackingNumber.trim() || undefined,
      items: [{ description: form.items.trim() || 'Package', quantity: 1 }],
      notes: form.notes.trim() || undefined
    }
    const ok = await run('create', () => api.post('/deliveries/invite', payload), 'Delivery added. The guard will let the courier in.')
    if (ok) {
      setOpen(false)
      setForm(EMPTY_FORM)
    }
  }

  const columns = [
    {
      key: 'who',
      header: 'Courier',
      render: (d) => (
        <div className="md:text-left">
          <p className="font-semibold">{d.deliveryPersonName}</p>
          <p className="text-xs text-muted">{d.company || d.deliveryPersonPhone}</p>
        </div>
      )
    },
    ...(isResident
      ? []
      : [{ key: 'flat', header: 'For', render: (d) => `${d.block ? `${d.block}-` : ''}${d.flatNo || '-'}` }]),
    { key: 'tracking', header: 'Tracking', render: (d) => d.trackingNumber || '-' },
    { key: 'when', header: 'Added', render: (d) => formatDate(d.createdAt, true) },
    { key: 'status', header: 'Status', render: (d) => <StatusTag status={d.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'md:text-right',
      render: (d) => {
        const isBusy = busy === d._id
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {(isResident || isAdmin) && d.status === 'pending' && (
              <button className="btn-ok btn-sm" disabled={isBusy} onClick={() => run(d._id, () => api.put(`/deliveries/${d._id}/approve`), 'Delivery approved')}>
                <FiCheck size={14} /> Approve
              </button>
            )}
            {(isSecurity || isAdmin) && d.status === 'approved' && (
              <button className="btn-primary btn-sm" disabled={isBusy} onClick={() => run(d._id, () => api.put(`/deliveries/${d._id}/check-in`), 'Courier checked in')}>
                <FiLogIn size={14} /> Check in
              </button>
            )}
            {(isResident || isSecurity || isAdmin) && ['approved', 'in_transit'].includes(d.status) && (
              <button className="btn-secondary btn-sm" disabled={isBusy} onClick={() => run(d._id, () => api.put(`/deliveries/${d._id}/deliver`), 'Marked as delivered')}>
                {isResident ? 'Received' : 'Delivered'}
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
        title="Deliveries"
        subtitle={isResident ? 'Tell the gate what you are expecting so couriers are not held up.' : 'Parcels and food orders expected across the society.'}
        action={
          isResident && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <FiPlus size={16} /> Expect delivery
            </button>
          )
        }
      />

      <DataList
        columns={columns}
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={
          <EmptyState
            icon={FiPackage}
            title="No deliveries yet"
            text={isResident ? 'Add a delivery you are expecting and the guard will see it.' : 'Deliveries will show up here when residents add them.'}
            action={isResident ? <button className="btn-primary" onClick={() => setOpen(true)}>Expect delivery</button> : null}
          />
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Expect a delivery"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="delivery-form" type="submit" disabled={busy === 'create'}>
              {busy === 'create' && <Spinner className="h-4 w-4" />}
              Add delivery
            </button>
          </>
        }
      >
        <form id="delivery-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Courier name" htmlFor="d-name">
              <input id="d-name" required className="input" value={form.deliveryPersonName} onChange={(e) => setForm({ ...form, deliveryPersonName: e.target.value })} />
            </Field>
            <Field label="Courier phone" htmlFor="d-phone">
              <input id="d-phone" required type="tel" inputMode="numeric" maxLength={10} className="input" value={form.deliveryPersonPhone} onChange={(e) => setForm({ ...form, deliveryPersonPhone: e.target.value })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" htmlFor="d-company" hint="Amazon, Swiggy, and so on">
              <input id="d-company" className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </Field>
            <Field label="Tracking number" htmlFor="d-track" hint="Optional">
              <input id="d-track" className="input" value={form.trackingNumber} onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })} />
            </Field>
          </div>
          <Field label="What is arriving" htmlFor="d-items">
            <input id="d-items" className="input" placeholder="2 parcels" value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} />
          </Field>
          <Field label="Note for the guard" htmlFor="d-notes" hint="Optional">
            <textarea id="d-notes" rows={2} className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
        </form>
      </Modal>
    </>
  )
}

export default Deliveries
