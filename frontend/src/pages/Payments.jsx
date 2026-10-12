import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { FiAlertTriangle, FiCreditCard, FiFileText, FiPlus } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import { openCheckout } from '../utils/razorpay'
import { DataList, EmptyState, Field, Modal, PageHeader, Spinner, StatusTag, errorMessage, formatDate, formatINR, titleCase } from '../components/ui'

const TYPES = ['maintenance', 'fine', 'amenity_booking', 'other']
const thisMonth = () => new Date().toISOString().slice(0, 7)
const EMPTY_FORM = { amount: '', type: 'maintenance', month: thisMonth(), description: '' }

const Payments = () => {
  const { user, isResident } = useAuth()
  const { data, loading, error, reload } = useApi('/payments', { params: { limit: 100 }, select: (d) => d.payments || [] })
  const { data: config } = useApi('/payments/config', { live: false })
  const online = config?.enabled !== false

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const totals = useMemo(() => {
    const sum = (status) => (data || []).filter((p) => p.status === status).reduce((n, p) => n + (p.amount || 0), 0)
    return { paid: sum('completed'), pending: sum('pending') }
  }, [data])

  // Opens the Razorpay window for an order, then confirms the signed result with the server.
  const pay = async (payment, order) => {
    try {
      const response = await openCheckout({
        keyId: order.keyId || config?.keyId,
        order,
        name: 'MyGate',
        description: `${titleCase(payment.type)}${payment.month ? ` · ${payment.month}` : ''}`,
        prefill: { name: user?.name, email: user?.email, contact: user?.phone }
      })
      await api.post('/payments/verify', {
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
        paymentId: payment._id || payment.paymentId
      })
      toast.success('Payment received. Thank you.')
      return true
    } catch (err) {
      if (!err?.dismissed) toast.error(err?.response ? errorMessage(err) : err?.message || 'The payment could not be completed.')
      else toast('Payment cancelled. You can finish it later from the list.', { icon: 'ℹ️' })
      return false
    } finally {
      reload()
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setFormError('')
    const amount = parseFloat(form.amount)
    if (!amount || amount < 1) return setFormError('Enter an amount of at least ₹1.')

    setBusy('create')
    try {
      const { data: res } = await api.post('/payments/create-order', {
        amount,
        type: form.type,
        month: form.type === 'maintenance' ? form.month : undefined,
        description: form.description.trim() || undefined
      })
      setOpen(false)
      setForm(EMPTY_FORM)
      await pay({ paymentId: res.paymentId, type: form.type, month: form.month }, { ...res.order, keyId: res.keyId })
    } catch (err) {
      setFormError(errorMessage(err, 'Could not start the payment. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  const payPending = async (p) => {
    if (!p.razorpayOrderId) return toast.error('This payment has no open order. Start a new payment instead.')
    setBusy(p._id)
    await pay(p, { id: p.razorpayOrderId, amount: Math.round(p.amount * 100), currency: 'INR' })
    setBusy(null)
  }

  const columns = [
    {
      key: 'what',
      header: 'Payment',
      render: (p) => (
        <div className="md:text-left">
          <p className="font-semibold">{titleCase(p.type)}{p.month ? ` · ${p.month}` : ''}</p>
          {p.description && <p className="text-xs text-muted">{p.description}</p>}
        </div>
      )
    },
    ...(isResident ? [] : [{ key: 'who', header: 'Resident', render: (p) => `${p.residentId?.name || '-'}${p.flatNo ? ` (${p.flatNo})` : ''}` }]),
    { key: 'amount', header: 'Amount', className: 'md:text-right font-semibold', render: (p) => formatINR(p.amount) },
    { key: 'date', header: 'Date', render: (p) => formatDate(p.paidAt || p.createdAt) },
    { key: 'status', header: 'Status', render: (p) => <StatusTag status={p.status} /> },
    ...(isResident
      ? [
          {
            key: 'actions',
            header: 'Actions',
            className: 'md:text-right',
            render: (p) => (
              <div className="flex justify-end gap-2">
                {p.status === 'pending' && (
                  <button className="btn-primary btn-sm" disabled={!online || busy === p._id} onClick={() => payPending(p)}>
                    {busy === p._id && <Spinner className="h-3.5 w-3.5" />}
                    Pay now
                  </button>
                )}
                {p.status === 'completed' && (
                  <button className="btn-secondary btn-sm" onClick={() => setReceipt(p)}>
                    <FiFileText size={14} /> Receipt
                  </button>
                )}
              </div>
            )
          }
        ]
      : [])
  ]

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle={isResident ? 'Pay maintenance and other dues online. Every payment is kept on record.' : 'Payments made by residents.'}
        action={
          isResident && (
            <button className="btn-primary" disabled={!online} onClick={() => setOpen(true)}>
              <FiPlus size={16} /> Make payment
            </button>
          )
        }
      />

      {isResident && config && !online && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-md bg-amber-soft px-3 py-2.5 text-sm">
          <FiAlertTriangle className="mt-0.5 shrink-0" size={16} />
          Online payments are not set up for this society yet. Ask your society admin to connect a payment gateway.
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="panel px-4 py-3">
          <p className="text-xs text-muted">Paid</p>
          <p className="font-display text-xl font-bold text-ok">{formatINR(totals.paid)}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-xs text-muted">Pending</p>
          <p className="font-display text-xl font-bold">{formatINR(totals.pending)}</p>
        </div>
      </div>

      <DataList
        columns={columns}
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={<EmptyState icon={FiCreditCard} title="No payments yet" text={isResident ? 'Your payments and receipts will be listed here.' : 'Payments will appear as residents pay.'} />}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Make a payment"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="payment-form" type="submit" disabled={busy === 'create'}>
              {busy === 'create' && <Spinner className="h-4 w-4" />}
              Continue to payment
            </button>
          </>
        }
      >
        <form id="payment-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (₹)" htmlFor="pay-amount">
              <input id="pay-amount" type="number" min="1" step="0.01" required className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Type" htmlFor="pay-type">
              <select id="pay-type" className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </Field>
          </div>
          {form.type === 'maintenance' && (
            <Field label="For month" htmlFor="pay-month">
              <input id="pay-month" type="month" className="input" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
            </Field>
          )}
          <Field label="Note" htmlFor="pay-desc" hint="Optional">
            <input id="pay-desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
        </form>
      </Modal>

      <Modal
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title="Payment receipt"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setReceipt(null)}>Close</button>
            <button className="btn-primary" onClick={() => window.print()}>Print</button>
          </>
        }
      >
        {receipt && (
          <dl className="space-y-2 text-sm">
            {[
              ['Amount', formatINR(receipt.amount)],
              ['For', `${titleCase(receipt.type)}${receipt.month ? ` · ${receipt.month}` : ''}`],
              ['Paid on', formatDate(receipt.paidAt, true)],
              ['Flat', `${receipt.block ? `${receipt.block}-` : ''}${receipt.flatNo || '-'}`],
              ['Transaction', receipt.transactionId || receipt.razorpayPaymentId || '-']
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
                <dt className="text-muted">{k}</dt>
                <dd className="break-all text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>
    </>
  )
}

export default Payments
