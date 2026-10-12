import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { FiAlertTriangle, FiCheckCircle, FiCreditCard, FiFileText, FiPlus } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import ExportButtons from '../components/ExportButtons'
import { downloadReceiptPdf } from '../utils/receipt'
import { openCheckout } from '../utils/razorpay'
import { DataList, EmptyState, Field, Modal, PageHeader, Spinner, StatusTag, errorMessage, formatDate, formatINR, titleCase } from '../components/ui'

const TYPES = ['maintenance', 'fine', 'amenity_booking', 'other']
const thisMonth = () => new Date().toISOString().slice(0, 7)
const EMPTY_FORM = { amount: '', type: 'maintenance', month: thisMonth(), description: '' }

const EXPORT_COLUMNS = [
  { header: 'Date', value: (p) => formatDate(p.paidAt || p.createdAt) },
  { header: 'Resident', value: (p) => p.residentId?.name || '' },
  { header: 'Flat', value: (p) => `${p.block ? `${p.block}-` : ''}${p.flatNo || ''}` },
  { header: 'Type', value: (p) => titleCase(p.type) },
  { header: 'Month', value: (p) => p.month || '' },
  { header: 'Amount (Rs.)', value: (p) => p.amount },
  { header: 'Method', value: (p) => (p.status === 'completed' ? titleCase(p.paymentMethod || 'online') : '') },
  { header: 'Reference', value: (p) => p.transactionId || p.razorpayPaymentId || '' },
  { header: 'Status', value: (p) => titleCase(p.status) }
]

const Payments = () => {
  const { user, isResident } = useAuth()
  const isSocAdmin = user?.role === 'society_admin' || user?.role === 'super_admin'
  const isSuper = user?.role === 'super_admin'
  const { data: societies } = useApi('/societies', { enabled: isSuper, live: false, select: (d) => d.societies || [] })
  const [month, setMonth] = useState('')
  const { data, loading, error, reload } = useApi('/payments', {
    params: { limit: 500, ...(!isResident && month ? { month } : {}) },
    select: (d) => d.payments || []
  })
  const summary = useApi('/payments/admin/summary', {
    enabled: !isResident,
    params: month ? { month } : {},
    select: (d) => d.summary
  })
  const { data: config } = useApi('/payments/config', { live: false })
  const online = config?.enabled !== false

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const totals = useMemo(() => {
    if (!isResident && summary.data) return { paid: summary.data.collected, pending: summary.data.pending }
    const sum = (status) => (data || []).filter((p) => p.status === status).reduce((n, p) => n + (p.amount || 0), 0)
    return { paid: sum('completed'), pending: sum('pending') }
  }, [data, isResident, summary.data])

  // Admin: create dues for every approved resident
  const [duesOpen, setDuesOpen] = useState(false)
  const [dues, setDues] = useState({ societyId: '', type: 'maintenance', amount: '', month: thisMonth(), dueDate: '', description: '' })
  const [duesError, setDuesError] = useState('')
  const createDues = async (e) => {
    e.preventDefault()
    setDuesError('')
    const amount = parseFloat(dues.amount)
    if (!amount || amount < 1) return setDuesError('Enter an amount of at least ₹1.')
    setBusy('dues')
    try {
      const { data: res } = await api.post('/payments/generate', {
        societyId: isSuper ? dues.societyId || societies?.[0]?._id : undefined,
        type: dues.type,
        amount,
        month: dues.type === 'maintenance' ? dues.month : undefined,
        dueDate: dues.dueDate || undefined,
        description: dues.description.trim() || undefined
      })
      toast.success(res.message)
      setDuesOpen(false)
      reload()
      summary.reload()
    } catch (err) {
      setDuesError(errorMessage(err, 'Could not create the dues.'))
    } finally {
      setBusy(null)
    }
  }

  // Admin: record cash / cheque / UPI received outside the app
  const [recording, setRecording] = useState(null)
  const [rec, setRec] = useState({ paymentMethod: 'cash', reference: '' })
  const [recError, setRecError] = useState('')
  const recordPayment = async (e) => {
    e.preventDefault()
    setRecError('')
    setBusy('rec')
    try {
      await api.put(`/payments/${recording._id}/mark-paid`, {
        paymentMethod: rec.paymentMethod,
        reference: rec.reference.trim() || undefined
      })
      toast.success('Payment recorded')
      setRecording(null)
      setRec({ paymentMethod: 'cash', reference: '' })
      reload()
      summary.reload()
    } catch (err) {
      setRecError(errorMessage(err, 'Could not record the payment.'))
    } finally {
      setBusy(null)
    }
  }

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
    setBusy(p._id)
    try {
      const { data: res } = await api.post(`/payments/${p._id}/order`)
      await pay(p, { ...res.order, keyId: res.keyId })
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start the payment.'))
      reload()
    } finally {
      setBusy(null)
    }
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
    ...(!isResident && isSocAdmin
      ? [
          {
            key: 'actions',
            header: '',
            className: 'md:text-right',
            render: (p) =>
              p.status === 'pending' ? (
                <div className="flex justify-end">
                  <button className="btn-secondary btn-sm" onClick={() => setRecording(p)}>
                    <FiCheckCircle size={14} /> Record payment
                  </button>
                </div>
              ) : null
          }
        ]
      : []),
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
        subtitle={isResident ? 'Pay maintenance and other dues online. Every payment is kept on record.' : 'Create dues, record cash or cheque payments and see what has been collected.'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons filename="payments" title="Payments" rows={data} columns={EXPORT_COLUMNS} />
            {isResident ? (
              <button className="btn-primary" disabled={!online} onClick={() => setOpen(true)}>
                <FiPlus size={16} /> Make payment
              </button>
            ) : isSocAdmin ? (
              <button className="btn-primary" onClick={() => setDuesOpen(true)}>
                <FiPlus size={16} /> Create dues
              </button>
            ) : null}
          </div>
        }
      />

      {isResident && config && !online && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-md bg-amber-soft px-3 py-2.5 text-sm">
          <FiAlertTriangle className="mt-0.5 shrink-0" size={16} />
          Online payments are not set up for this society yet. Ask your society admin to connect a payment gateway.
        </p>
      )}

      {!isResident && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Month" htmlFor="pay-filter-month" className="w-44">
            <input id="pay-filter-month" type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          {month && <button className="btn-secondary btn-sm mb-1" onClick={() => setMonth('')}>All months</button>}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="panel px-4 py-3">
          <p className="text-xs text-muted">{isResident ? 'Paid' : 'Collected'}</p>
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
        open={duesOpen}
        onClose={() => setDuesOpen(false)}
        title="Create dues"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDuesOpen(false)}>Cancel</button>
            <button className="btn-primary" form="dues-form" type="submit" disabled={busy === 'dues'}>
              {busy === 'dues' && <Spinner className="h-4 w-4" />}
              Bill all residents
            </button>
          </>
        }
      >
        <form id="dues-form" onSubmit={createDues} className="space-y-4">
          {isSuper && (
            <Field label="Society" htmlFor="dues-society">
              <select id="dues-society" className="input" value={dues.societyId || societies?.[0]?._id || ''} onChange={(e) => setDues({ ...dues, societyId: e.target.value })}>
                {(societies || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <p className="text-sm text-muted">Every approved resident gets this due and a notification. Flats already billed for the same month are skipped.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount per flat (₹)" htmlFor="dues-amount">
              <input id="dues-amount" type="number" min="1" step="0.01" required className="input" value={dues.amount} onChange={(e) => setDues({ ...dues, amount: e.target.value })} />
            </Field>
            <Field label="Type" htmlFor="dues-type">
              <select id="dues-type" className="input" value={dues.type} onChange={(e) => setDues({ ...dues, type: e.target.value })}>
                {['maintenance', 'fine', 'other'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {dues.type === 'maintenance' && (
              <Field label="For month" htmlFor="dues-month">
                <input id="dues-month" type="month" required className="input" value={dues.month} onChange={(e) => setDues({ ...dues, month: e.target.value })} />
              </Field>
            )}
            <Field label="Due date" htmlFor="dues-date" hint="Optional">
              <input id="dues-date" type="date" className="input" value={dues.dueDate} onChange={(e) => setDues({ ...dues, dueDate: e.target.value })} />
            </Field>
          </div>
          <Field label="Note" htmlFor="dues-desc" hint="Optional">
            <input id="dues-desc" maxLength={200} className="input" value={dues.description} onChange={(e) => setDues({ ...dues, description: e.target.value })} />
          </Field>
          {duesError && <p role="alert" className="text-sm font-medium text-danger">{duesError}</p>}
        </form>
      </Modal>

      <Modal
        open={!!recording}
        onClose={() => setRecording(null)}
        title="Record a payment"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setRecording(null)}>Cancel</button>
            <button className="btn-ok" form="record-form" type="submit" disabled={busy === 'rec'}>
              {busy === 'rec' && <Spinner className="h-4 w-4" />}
              Mark as paid
            </button>
          </>
        }
      >
        {recording && (
          <form id="record-form" onSubmit={recordPayment} className="space-y-4">
            <p className="text-sm text-muted">
              {formatINR(recording.amount)} from {recording.residentId?.name || 'resident'} ({recording.flatNo}) for {titleCase(recording.type)}{recording.month ? ` · ${recording.month}` : ''}.
            </p>
            <Field label="Received by" htmlFor="rec-method">
              <select id="rec-method" className="input" value={rec.paymentMethod} onChange={(e) => setRec({ ...rec, paymentMethod: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="upi">UPI (outside the app)</option>
                <option value="card">Card</option>
              </select>
            </Field>
            <Field label="Reference" htmlFor="rec-ref" hint="Optional. Cheque number or UPI transaction ID.">
              <input id="rec-ref" maxLength={80} className="input" value={rec.reference} onChange={(e) => setRec({ ...rec, reference: e.target.value })} />
            </Field>
            {recError && <p role="alert" className="text-sm font-medium text-danger">{recError}</p>}
          </form>
        )}
      </Modal>

      <Modal
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title="Payment receipt"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setReceipt(null)}>Close</button>
            <button className="btn-primary" onClick={() => downloadReceiptPdf(receipt, user?.name).catch(() => toast.error('Could not create the PDF.'))}>Download PDF</button>
          </>
        }
      >
        {receipt && (
          <dl className="space-y-2 text-sm">
            {[
              ['Amount', formatINR(receipt.amount)],
              ['For', `${titleCase(receipt.type)}${receipt.month ? ` · ${receipt.month}` : ''}`],
              ['Paid on', formatDate(receipt.paidAt, true)],
              ['Method', titleCase(receipt.paymentMethod || 'online')],
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
