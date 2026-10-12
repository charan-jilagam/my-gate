import { useMemo, useState } from 'react'
import { FiFileText, FiPlus } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { DataList, EmptyState, Field, Modal, PageHeader, Spinner, StatusTag, formatDate, titleCase } from '../components/ui'

const CATEGORIES = ['maintenance', 'security', 'cleaning', 'amenities', 'billing', 'noise', 'parking', 'other']
const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'rejected']
const EMPTY_FORM = { title: '', description: '', category: 'maintenance', priority: 'medium', location: '' }
const FILTERS = [{ key: 'all', label: 'All' }, ...['open', 'in_progress', 'resolved'].map((s) => ({ key: s, label: titleCase(s) }))]

const Complaints = () => {
  const { user, isResident, isAdmin } = useAuth()
  const canManage = isAdmin || user?.role === 'staff'
  const { data, loading, error, reload } = useApi('/complaints', { select: (d) => d.complaints || [] })
  const { busy, run } = useAction(reload)
  const [filter, setFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const [detailId, setDetailId] = useState(null)
  const {
    data: detail,
    loading: detailLoading,
    reload: reloadDetail
  } = useApi(`/complaints/${detailId}`, { enabled: !!detailId, live: false, select: (d) => d.complaint })
  const { busy: detailBusy, run: runDetail } = useAction(async () => {
    await reloadDetail()
    await reload()
  })
  const [comment, setComment] = useState('')
  const [statusForm, setStatusForm] = useState({ status: 'in_progress', resolution: '' })

  const societyId = detail?.societyId?._id || detail?.societyId || user?.societyId?._id || user?.societyId
  const { data: staff } = useApi(`/societies/${societyId}/staff`, {
    enabled: !!detailId && isAdmin && !!societyId,
    live: false,
    select: (d) => d.staff || []
  })

  const rows = useMemo(() => (filter === 'all' ? data || [] : (data || []).filter((c) => c.status === filter)), [data, filter])

  const submit = async (e) => {
    e.preventDefault()
    const payload = { ...form, title: form.title.trim(), description: form.description.trim() }
    if (!payload.location.trim()) delete payload.location
    const ok = await run('create', () => api.post('/complaints', payload), 'Complaint submitted')
    if (ok) {
      setCreateOpen(false)
      setForm(EMPTY_FORM)
    }
  }

  const columns = [
    {
      key: 'title',
      header: 'Complaint',
      render: (c) => (
        <button className="text-left md:max-w-xs" onClick={() => { setDetailId(c._id); setStatusForm({ status: c.status === 'open' ? 'in_progress' : c.status, resolution: '' }) }}>
          <p className="font-semibold text-brand hover:underline">{c.title}</p>
          <p className="line-clamp-1 text-xs text-muted">{c.description}</p>
        </button>
      )
    },
    ...(isResident ? [] : [{ key: 'flat', header: 'Flat', render: (c) => `${c.block ? `${c.block}-` : ''}${c.flatNo || '-'}` }]),
    { key: 'category', header: 'Category', render: (c) => titleCase(c.category) },
    { key: 'priority', header: 'Priority', render: (c) => <StatusTag status={c.priority} /> },
    { key: 'status', header: 'Status', render: (c) => <StatusTag status={c.status} /> },
    { key: 'date', header: 'Raised', render: (c) => formatDate(c.createdAt) }
  ]

  return (
    <>
      <PageHeader
        title="Complaints"
        subtitle={isResident ? 'Raise an issue and follow it until it is fixed.' : 'Issues raised by residents.'}
        action={
          isResident && (
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <FiPlus size={16} /> Raise complaint
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter complaints">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${filter === f.key ? 'bg-brand text-brand-ink' : 'bg-surface text-muted ring-1 ring-line hover:text-ink'}`}
          >
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
            icon={FiFileText}
            title={filter === 'all' ? 'No complaints' : 'Nothing in this view'}
            text={isResident && filter === 'all' ? 'If something needs fixing, raise it here and the society team will pick it up.' : undefined}
            action={isResident && filter === 'all' ? <button className="btn-primary" onClick={() => setCreateOpen(true)}>Raise complaint</button> : null}
          />
        }
      />

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Raise a complaint"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" form="complaint-form" type="submit" disabled={busy === 'create'}>
              {busy === 'create' && <Spinner className="h-4 w-4" />}
              Submit complaint
            </button>
          </>
        }
      >
        <form id="complaint-form" onSubmit={submit} className="space-y-4">
          <Field label="Title" htmlFor="c-title">
            <input id="c-title" required className="input" placeholder="Water leak in the corridor" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="What is wrong" htmlFor="c-desc">
            <textarea id="c-desc" required rows={4} className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="c-cat">
              <select id="c-cat" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
              </select>
            </Field>
            <Field label="Priority" htmlFor="c-pri">
              <select id="c-pri" className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Where in the society" htmlFor="c-loc" hint="Optional">
            <input id="c-loc" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
        </form>
      </Modal>

      {/* Detail */}
      <Modal open={!!detailId} onClose={() => { setDetailId(null); setComment('') }} title="Complaint" size="lg">
        {detailLoading && !detail ? (
          <div className="grid place-items-center py-10 text-brand"><Spinner className="h-6 w-6" /></div>
        ) : detail ? (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusTag status={detail.status} />
                <StatusTag status={detail.priority} label={`${titleCase(detail.priority)} priority`} />
                <span className="text-xs text-muted">{titleCase(detail.category)} · {formatDate(detail.createdAt, true)}</span>
              </div>
              <h3 className="mt-2 text-xl font-bold">{detail.title}</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-ink/90">{detail.description}</p>
              <p className="mt-2 text-xs text-muted">
                Raised by {detail.residentId?.name || 'resident'} · Flat {detail.block ? `${detail.block}-` : ''}{detail.flatNo}
                {detail.assignedTo?.name ? ` · Assigned to ${detail.assignedTo.name}` : ''}
              </p>
              {detail.resolution && <p className="mt-3 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok"><strong>Resolution:</strong> {detail.resolution}</p>}
            </div>

            {isAdmin && (
              <Field label="Assign to" htmlFor="c-assign">
                <select
                  id="c-assign"
                  className="input"
                  value={detail.assignedTo?._id || ''}
                  disabled={detailBusy === 'assign'}
                  onChange={(e) => e.target.value && runDetail('assign', () => api.put(`/complaints/${detail._id}/assign`, { assignedTo: e.target.value }), 'Complaint assigned')}
                >
                  <option value="">Not assigned</option>
                  {(staff || []).map((s) => <option key={s._id} value={s._id}>{s.name} ({titleCase(s.role)})</option>)}
                </select>
              </Field>
            )}

            {canManage && (
              <div className="rounded-md border border-line p-3">
                <p className="mb-2 text-sm font-semibold">Update status</p>
                <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
                  <select aria-label="Status" className="input" value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                  </select>
                  <input aria-label="Resolution note" className="input" placeholder="Resolution note (optional)" value={statusForm.resolution} onChange={(e) => setStatusForm({ ...statusForm, resolution: e.target.value })} />
                  <button className="btn-primary" disabled={detailBusy === 'status'} onClick={() => runDetail('status', () => api.put(`/complaints/${detail._id}/status`, { status: statusForm.status, resolution: statusForm.resolution.trim() || undefined }), 'Status updated')}>
                    Save
                  </button>
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold">Updates</p>
              {detail.updates?.length ? (
                <ol className="space-y-3 border-l-2 border-line pl-4">
                  {detail.updates.map((u, i) => (
                    <li key={u._id || i}>
                      <p className="text-sm">{u.message}</p>
                      <p className="text-xs text-muted">{u.updatedBy?.name || 'Someone'} · {formatDate(u.updatedAt, true)}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">No updates yet.</p>
              )}
              <form
                className="mt-3 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!comment.trim()) return
                  const ok = await runDetail('comment', () => api.post(`/complaints/${detail._id}/update`, { message: comment.trim() }), 'Update added')
                  if (ok) setComment('')
                }}
              >
                <input aria-label="Add an update" className="input" placeholder="Add an update" value={comment} onChange={(e) => setComment(e.target.value)} />
                <button className="btn-secondary" type="submit" disabled={detailBusy === 'comment' || !comment.trim()}>Post</button>
              </form>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted">This complaint could not be loaded.</p>
        )}
      </Modal>
    </>
  )
}

export default Complaints
