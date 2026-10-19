import { useMemo, useState } from 'react'
import { FiAward, FiCheck, FiSearch, FiSlash, FiUserCheck, FiUsers, FiX } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import ExportButtons from '../components/ExportButtons'
import { ConfirmDialog, DataList, EmptyState, Field, Modal, PageHeader, StatusTag, formatDate, titleCase } from '../components/ui'

const ROLE_LABEL = { resident: 'Resident', security: 'Guard', guard_admin: 'Guard head', staff: 'Staff', vendor: 'Vendor' }

// One word for where a person stands: waiting, rejected, active or deactivated.
const stateOf = (u) => (!u.isApproved ? (u.rejectedAt ? 'rejected' : 'pending') : u.isActive === false ? 'deactivated' : 'active')

const flatOf = (u) => `${u.block ? `${u.block}-` : ''}${u.flatNo || '-'}`

const AdminResidents = () => {
  const { user, isSuperAdmin } = useAuth()
  const [tab, setTab] = useState('pending')
  const [query, setQuery] = useState('')
  const [societyId, setSocietyId] = useState('')

  const { data: societies } = useApi('/societies', { enabled: isSuperAdmin, live: false, select: (d) => d.societies || [] })
  const activeSociety = isSuperAdmin ? societyId || societies?.[0]?._id : user?.societyId?._id || user?.societyId

  const pending = useApi('/users/pending-approvals', { select: (d) => d.users || [] })
  const all = useApi(`/societies/${activeSociety}/residents`, { enabled: tab === 'all' && !!activeSociety, select: (d) => d.residents || [] })
  const { busy, run } = useAction(async () => {
    await Promise.all([pending.reload(), tab === 'all' && all.reload()].filter(Boolean))
  })

  const list = tab === 'pending' ? pending : all
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const source = list.data || []
    if (!q) return source
    return source.filter((u) => [u.name, u.email, u.phone, u.flatNo, u.block].some((f) => f?.toLowerCase().includes(q)))
  }, [list.data, query])

  const approve = (u) => run(u._id, () => api.put(`/users/approve/${u._id}`), `${u.name} approved`)

  const [deactivating, setDeactivating] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')

  const columns = [
    {
      key: 'name',
      header: 'Resident',
      render: (u) => (
        <div className="md:text-left">
          <p className="font-semibold">{u.name}</p>
          <p className="text-xs text-muted">{u.email}</p>
        </div>
      )
    },
    { key: 'role', header: tab === 'pending' ? 'Signed up as' : 'Role', render: (u) => ROLE_LABEL[u.role] || titleCase(u.role) },
    { key: 'flat', header: 'Flat', render: (u) => (u.flatNo ? flatOf(u) : '-') },
    { key: 'phone', header: 'Phone', render: (u) => u.phone },
    { key: 'joined', header: 'Registered', render: (u) => formatDate(u.createdAt) },
    ...(tab === 'all' ? [{ key: 'status', header: 'Status', render: (u) => <StatusTag status={stateOf(u)} /> }] : []),
    {
      key: 'actions',
      header: '',
      className: 'md:text-right',
      render: (u) => {
        const state = stateOf(u)
        if (state === 'pending')
          return (
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn-ok btn-sm" disabled={busy === u._id} onClick={() => approve(u)}>
                <FiCheck size={14} /> Approve
              </button>
              <button className="btn-secondary btn-sm" disabled={busy === u._id} onClick={() => setRejecting(u)}>
                <FiX size={14} /> Reject
              </button>
            </div>
          )
        if (state === 'rejected')
          return (
            <div className="flex justify-end">
              <button className="btn-ok btn-sm" disabled={busy === u._id} onClick={() => approve(u)}>
                <FiCheck size={14} /> Approve instead
              </button>
            </div>
          )
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {state === 'active' && ['security', 'guard_admin'].includes(u.role) && (
              <button className="btn-secondary btn-sm" disabled={busy === u._id} onClick={() => run(u._id, () => api.put(`/users/${u._id}/guard-head`, { isHead: u.role !== 'guard_admin' }), u.role === 'guard_admin' ? `${u.name} is a guard again` : `${u.name} is now the guard head`)}>
                <FiAward size={14} /> {u.role === 'guard_admin' ? 'Remove as guard head' : 'Make guard head'}
              </button>
            )}
            {state === 'active' ? (
              <button className="btn-secondary btn-sm" disabled={busy === u._id} onClick={() => setDeactivating(u)}>
                <FiSlash size={14} /> Deactivate
              </button>
            ) : (
              <button className="btn-secondary btn-sm" disabled={busy === u._id} onClick={() => run(u._id, () => api.put(`/users/${u._id}/active`, { active: true }), `${u.name} can sign in again`)}>
                <FiUserCheck size={14} /> Reactivate
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
        title="People"
        subtitle="Approve or reject new sign-ups, and see who lives in your society."
        action={
          <ExportButtons
            filename="people"
            title="People"
            rows={rows}
            columns={[
              { header: 'Name', value: (u) => u.name },
              { header: 'Role', value: (u) => ROLE_LABEL[u.role] || titleCase(u.role) },
              { header: 'Email', value: (u) => u.email },
              { header: 'Phone', value: (u) => u.phone },
              { header: 'Flat', value: (u) => (u.flatNo ? flatOf(u) : '') },
              { header: 'Registered', value: (u) => formatDate(u.createdAt) },
              { header: 'Status', value: (u) => titleCase(stateOf(u)) }
            ]}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-sunken p-1" role="tablist" aria-label="Resident lists">
          {[
            { key: 'pending', label: `Waiting for approval${pending.data?.length ? ` (${pending.data.length})` : ''}` },
            { key: 'all', label: 'Everyone' }
          ].map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${tab === t.key ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {isSuperAdmin && tab === 'all' && (
          <Field className="min-w-[200px]">
            <select aria-label="Society" className="input" value={activeSociety || ''} onChange={(e) => setSocietyId(e.target.value)}>
              {(societies || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <div className="relative ml-auto w-full sm:w-64">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search name, flat or phone" aria-label="Search residents" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataList
        columns={columns}
        rows={rows}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        empty={
          <EmptyState
            icon={FiUsers}
            title={query ? 'No one matches that search' : tab === 'pending' ? 'No one is waiting for approval' : 'No residents yet'}
            text={tab === 'pending' && !query ? 'Residents, guards and staff who sign up will appear here for you to approve.' : undefined}
          />
        }
      />

      <ConfirmDialog
        open={!!deactivating}
        title="Deactivate this account?"
        text={`${deactivating?.name} will be signed out and cannot sign in until you reactivate them. Their records are kept.`}
        confirmLabel="Deactivate"
        danger
        busy={busy === deactivating?._id}
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          const ok = await run(deactivating._id, () => api.put(`/users/${deactivating._id}/active`, { active: false }), `${deactivating.name} deactivated`)
          if (ok) setDeactivating(null)
        }}
      />

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject this sign-up?"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setRejecting(null)}>Cancel</button>
            <button
              className="btn-danger"
              disabled={busy === rejecting?._id}
              onClick={async () => {
                const ok = await run(rejecting._id, () => api.put(`/users/reject/${rejecting._id}`, { reason: reason.trim() || undefined }), `${rejecting.name} rejected`)
                if (ok) {
                  setRejecting(null)
                  setReason('')
                }
              }}
            >
              Reject sign-up
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          {rejecting?.name} will not be able to sign in. They will see your reason the next time they try.
        </p>
        <Field label="Reason" htmlFor="reject-reason" hint="Optional. For example: flat number not found.">
          <input id="reject-reason" maxLength={200} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}

export default AdminResidents
