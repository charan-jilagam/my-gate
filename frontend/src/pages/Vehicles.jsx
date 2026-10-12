import { useMemo, useState } from 'react'
import { FiLogIn, FiLogOut, FiPlus, FiSearch, FiTruck } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { DataList, EmptyState, Field, Modal, PageHeader, Spinner, titleCase } from '../components/ui'

const TYPES = ['car', 'bike', 'scooter', 'bicycle', 'other']
const EMPTY_FORM = { vehicleNumber: '', vehicleType: 'car', brand: '', model: '', color: '' }

const Vehicles = () => {
  const { isResident, isSecurity, isAdmin } = useAuth()
  const { data, loading, error, reload } = useApi('/vehicles', { select: (d) => d.vehicles || [] })
  const { busy, run } = useAction(reload)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return data || []
    return (data || []).filter((v) => v.vehicleNumber?.toLowerCase().includes(q))
  }, [data, query])

  const submit = async (e) => {
    e.preventDefault()
    const payload = Object.fromEntries(Object.entries({ ...form, vehicleNumber: form.vehicleNumber.trim().toUpperCase() }).filter(([, v]) => v !== ''))
    const ok = await run('create', () => api.post('/vehicles/register', payload), 'Vehicle registered')
    if (ok) {
      setOpen(false)
      setForm(EMPTY_FORM)
    }
  }

  const canLog = isSecurity || isAdmin

  const columns = [
    {
      key: 'number',
      header: 'Vehicle',
      render: (v) => (
        <div className="md:text-left">
          <p className="font-mono font-bold tracking-wide">{v.vehicleNumber}</p>
          <p className="text-xs text-muted">{[v.brand, v.model, v.color].filter(Boolean).join(' · ') || titleCase(v.vehicleType)}</p>
        </div>
      )
    },
    ...(isResident ? [] : [{ key: 'owner', header: 'Owner', render: (v) => `${v.residentId?.name || '-'}${v.residentId?.flatNo ? ` (${v.residentId.flatNo})` : ''}` }]),
    { key: 'type', header: 'Type', render: (v) => titleCase(v.vehicleType) },
    { key: 'status', header: 'Status', render: (v) => <span className={v.isInside ? 'tag-ok' : 'tag-neutral'}>{v.isInside ? 'Inside' : 'Outside'}</span> },
    ...(canLog
      ? [
          {
            key: 'actions',
            header: 'Gate',
            className: 'md:text-right',
            render: (v) => (
              <div className="flex justify-end">
                {v.isInside ? (
                  <button className="btn-secondary btn-sm" disabled={busy === v._id} onClick={() => run(v._id, () => api.post(`/vehicles/${v._id}/exit`, { exitGate: 'Main gate' }), 'Exit logged')}>
                    <FiLogOut size={14} /> Log exit
                  </button>
                ) : (
                  <button className="btn-primary btn-sm" disabled={busy === v._id} onClick={() => run(v._id, () => api.post(`/vehicles/${v._id}/entry`, { entryGate: 'Main gate' }), 'Entry logged')}>
                    <FiLogIn size={14} /> Log entry
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
        title="Vehicles"
        subtitle={isResident ? 'Register your vehicles so the gate recognises them.' : 'Registered vehicles and who is parked inside right now.'}
        action={
          isResident && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <FiPlus size={16} /> Register vehicle
            </button>
          )
        }
      />

      {!isResident && (
        <div className="relative mb-4 max-w-sm">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search by vehicle number" aria-label="Search by vehicle number" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      <DataList
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={
          <EmptyState
            icon={FiTruck}
            title={query ? 'No vehicle matches that number' : 'No vehicles registered'}
            text={isResident && !query ? 'Add your car or bike to get faster entry at the gate.' : undefined}
            action={isResident && !query ? <button className="btn-primary" onClick={() => setOpen(true)}>Register vehicle</button> : null}
          />
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Register vehicle"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="vehicle-form" type="submit" disabled={busy === 'create'}>
              {busy === 'create' && <Spinner className="h-4 w-4" />}
              Register
            </button>
          </>
        }
      >
        <form id="vehicle-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vehicle number" htmlFor="vh-number">
              <input id="vh-number" required className="input uppercase" placeholder="KA01AB1234" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} />
            </Field>
            <Field label="Type" htmlFor="vh-type">
              <select id="vh-type" className="input" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Brand" htmlFor="vh-brand"><input id="vh-brand" className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
            <Field label="Model" htmlFor="vh-model"><input id="vh-model" className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label="Colour" htmlFor="vh-color"><input id="vh-color" className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
          </div>
        </form>
      </Modal>
    </>
  )
}

export default Vehicles
