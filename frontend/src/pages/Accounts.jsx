import { useState } from 'react'
import { FiPlus, FiTrash2 } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, Modal, PageHeader, Spinner, Stat, formatINR } from '../components/ui'
import { dayLabel } from '../utils/services'

const CATS = [['security', 'Security'], ['housekeeping', 'Housekeeping'], ['electricity', 'Electricity'], ['water', 'Water'], ['repairs', 'Repairs'], ['lift', 'Lifts'], ['garden', 'Garden'], ['salaries', 'Staff salaries'], ['events', 'Events'], ['insurance', 'Insurance'], ['other', 'Other']]
const catLabel = (k) => CATS.find((c) => c[0] === k)?.[1] || k
const monthNow = () => new Date().toISOString().slice(0, 7)
const todayStr = () => new Date().toISOString().slice(0, 10)
const EMPTY = { title: '', amount: '', date: todayStr(), category: 'other', vendor: '', note: '' }

const Accounts = () => {
  const { isAdmin } = useAuth()
  const [month, setMonth] = useState(monthNow())
  const summary = useApi('/expenses/summary', { params: { month } })
  const list = useApi('/expenses', { params: { month }, enabled: isAdmin, select: (d) => d.expenses || [] })
  const { busy, run } = useAction(() => { summary.reload(); list.reload() })
  const [form, setForm] = useState(null)
  const [removing, setRemoving] = useState(null)

  const s = summary.data
  const top = s?.byCategory?.[0]?.amount || 1

  const save = async (e) => {
    e.preventDefault()
    const body = { title: form.title.trim(), amount: Number(form.amount), date: form.date, category: form.category, vendor: form.vendor.trim() || undefined, note: form.note.trim() || undefined }
    const ok = await run('save', () => (form._id ? api.put(`/expenses/${form._id}`, body) : api.post('/expenses', body)), 'Expense saved')
    if (ok) setForm(null)
  }

  return (
    <>
      <PageHeader
        title="Society accounts"
        subtitle={isAdmin ? 'Record what the society spends. Residents see the totals.' : 'How maintenance money is collected and spent.'}
        action={isAdmin && <button className="btn-primary" onClick={() => setForm({ ...EMPTY, date: month === monthNow() ? todayStr() : `${month}-01` })}><FiPlus size={16} /> Add expense</button>}
      />

      <div className="mb-4"><input type="month" className="input w-auto" aria-label="Month" value={month} max={monthNow()} onChange={(e) => e.target.value && setMonth(e.target.value)} /></div>

      {summary.loading ? <div className="panel"><ListSkeleton rows={3} /></div> : summary.error ? <div className="panel"><ErrorState message={summary.error} onRetry={summary.reload} /></div> : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Collected" value={formatINR(s.collected)} hint="maintenance and dues paid" />
            <Stat label="Spent" value={formatINR(s.spent)} />
            <Stat label="Balance" value={formatINR(s.balance)} tone={s.balance < 0 ? 'warn' : undefined} hint="collected minus spent" />
            <Stat label="Still unpaid" value={formatINR(s.pendingDues)} hint={`${s.pendingCount} pending ${s.pendingCount === 1 ? 'payment' : 'payments'}`} />
          </div>

          <section className="panel mb-6 p-5" aria-labelledby="bc-h">
            <h2 id="bc-h" className="mb-3 text-base font-bold">Where the money went</h2>
            {!s.byCategory.length ? <p className="text-sm text-muted">No expenses recorded for this month.</p> : (
              <ul className="space-y-3">
                {s.byCategory.map((c) => (
                  <li key={c.category}>
                    <div className="flex justify-between text-sm"><span className="font-semibold">{catLabel(c.category)}</span><span>{formatINR(c.amount)} <span className="text-muted">({Math.round((c.amount / (s.spent || 1)) * 100)}%)</span></span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken" role="presentation"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(3, (c.amount / top) * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {isAdmin && (
        <section aria-labelledby="ex-h">
          <h2 id="ex-h" className="mb-2 text-base font-bold">Expenses</h2>
          {list.loading ? <div className="panel"><ListSkeleton rows={3} /></div> : list.error ? <div className="panel"><ErrorState message={list.error} onRetry={list.reload} /></div> : !list.data.length ? (
            <div className="panel"><EmptyState title="Nothing recorded" text="Add bills for security, lifts, electricity and other costs." /></div>
          ) : (
            <ul className="panel divide-y divide-line">
              {list.data.map((x) => (
                <li key={x._id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{x.title}</p>
                    <p className="text-xs text-muted">{dayLabel(x.date)} · {catLabel(x.category)}{x.vendor ? ` · ${x.vendor}` : ''}</p>
                  </div>
                  <p className="font-display font-extrabold">{formatINR(x.amount)}</p>
                  <button className="btn-ghost btn-sm" onClick={() => setForm({ ...x, amount: String(x.amount), vendor: x.vendor || '', note: x.note || '' })}>Edit</button>
                  <button className="btn-ghost btn-sm text-danger" aria-label={`Delete ${x.title}`} onClick={() => setRemoving(x)}><FiTrash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?._id ? 'Edit expense' : 'Add expense'}
        footer={<>
          <button className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
          <button className="btn-primary" form="exp-form" type="submit" disabled={busy === 'save'}>{busy === 'save' && <Spinner className="h-4 w-4" />} Save</button>
        </>}>
        {form && (
          <form id="exp-form" onSubmit={save} className="space-y-4">
            <Field label="What was it for?" htmlFor="x-title"><input id="x-title" required className="input" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount (rupees)" htmlFor="x-amt"><input id="x-amt" required type="number" min="1" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
              <Field label="Date" htmlFor="x-date"><input id="x-date" required type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="Category" htmlFor="x-cat"><select id="x-cat" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Paid to" htmlFor="x-vendor" hint="Optional"><input id="x-vendor" className="input" maxLength={80} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></Field>
            </div>
            <Field label="Note" htmlFor="x-note" hint="Optional"><input id="x-note" className="input" maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          </form>
        )}
      </Modal>
      <ConfirmDialog open={!!removing} danger title="Delete this expense?" text={removing ? `${removing.title}, ${formatINR(removing.amount)}` : ''} confirmLabel="Delete" busy={busy === 'rm'} onClose={() => setRemoving(null)}
        onConfirm={async () => { const ok = await run('rm', () => api.delete(`/expenses/${removing._id}`), 'Expense deleted'); if (ok) setRemoving(null) }} />
    </>
  )
}

export default Accounts
