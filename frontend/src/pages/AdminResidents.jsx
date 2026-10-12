import { useMemo, useState } from 'react'
import { FiCheck, FiSearch, FiUsers } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { DataList, EmptyState, Field, PageHeader, StatusTag, formatDate } from '../components/ui'

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
    { key: 'flat', header: 'Flat', render: flatOf },
    { key: 'phone', header: 'Phone', render: (u) => u.phone },
    { key: 'joined', header: 'Registered', render: (u) => formatDate(u.createdAt) },
    ...(tab === 'all' ? [{ key: 'status', header: 'Status', render: (u) => <StatusTag status={u.isApproved ? 'approved' : 'pending'} /> }] : []),
    {
      key: 'actions',
      header: '',
      className: 'md:text-right',
      render: (u) =>
        tab === 'pending' || !u.isApproved ? (
          <button className="btn-ok btn-sm" disabled={busy === u._id} onClick={() => approve(u)}>
            <FiCheck size={14} /> Approve
          </button>
        ) : null
    }
  ]

  return (
    <>
      <PageHeader title="Residents" subtitle="Approve new residents and see who lives in your society." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-sunken p-1" role="tablist" aria-label="Resident lists">
          {[
            { key: 'pending', label: `Waiting for approval${pending.data?.length ? ` (${pending.data.length})` : ''}` },
            { key: 'all', label: 'All residents' }
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
            title={query ? 'No residents match that search' : tab === 'pending' ? 'No one is waiting for approval' : 'No residents yet'}
            text={tab === 'pending' && !query ? 'New sign-ups from residents will appear here for you to approve.' : undefined}
          />
        }
      />
    </>
  )
}

export default AdminResidents
