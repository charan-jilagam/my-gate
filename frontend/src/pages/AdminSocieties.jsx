import { useState } from 'react'
import { FiHome, FiPlus, FiTrash2, FiUserPlus } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { DataList, EmptyState, Field, Modal, PageHeader, Spinner } from '../components/ui'

const EMPTY_SOCIETY = { name: '', street: '', city: '', state: '', pincode: '', totalFlats: '', contactNumber: '', email: '', blocks: '' }
const EMPTY_ADMIN = { name: '', email: '', phone: '', password: '' }

// "A:40, B:36" becomes [{ name: 'A', totalFlats: 40 }, { name: 'B', totalFlats: 36 }]
const parseBlocks = (text) => {
  const blocks = []
  for (const part of text.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [name, flats] = part.split(':').map((s) => s.trim())
    const totalFlats = parseInt(flats, 10)
    if (!name || !totalFlats) return null
    blocks.push({ name, totalFlats })
  }
  return blocks
}

const AdminSocieties = () => {
  const { isSuperAdmin } = useAuth()
  const { data, loading, error, reload } = useApi('/societies', { live: false, select: (d) => d.societies || [] })
  const { busy, run } = useAction(reload)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_SOCIETY)
  const [formError, setFormError] = useState('')

  const [adminFor, setAdminFor] = useState(null)
  const [admin, setAdmin] = useState(EMPTY_ADMIN)
  const [adminError, setAdminError] = useState('')

  const [amenityFor, setAmenityFor] = useState(null)
  const [amenities, setAmenities] = useState([])

  const createSociety = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!/^[0-9]{6}$/.test(form.pincode)) return setFormError('Enter a 6-digit pincode.')
    if (!/^[0-9]{10}$/.test(form.contactNumber)) return setFormError('Enter a 10-digit contact number.')
    const blocks = parseBlocks(form.blocks)
    if (blocks === null) return setFormError('Write blocks like A:40, B:36 (block name, then number of flats).')

    const payload = {
      name: form.name.trim(),
      address: { street: form.street.trim(), city: form.city.trim(), state: form.state.trim(), pincode: form.pincode },
      totalFlats: parseInt(form.totalFlats, 10),
      contactNumber: form.contactNumber,
      email: form.email.trim() || undefined,
      blocks
    }
    const ok = await run('create', () => api.post('/societies', payload), 'Society created')
    if (ok) {
      setCreateOpen(false)
      setForm(EMPTY_SOCIETY)
    }
  }

  const createAdmin = async (e) => {
    e.preventDefault()
    setAdminError('')
    if (!/^[0-9]{10}$/.test(admin.phone)) return setAdminError('Enter a 10-digit phone number.')
    const ok = await run('admin', () => api.post('/auth/create-admin', { ...admin, role: 'society_admin', societyId: adminFor._id }), `Admin added for ${adminFor.name}`)
    if (ok) {
      setAdminFor(null)
      setAdmin(EMPTY_ADMIN)
    }
  }

  const saveAmenities = async () => {
    const cleaned = amenities
      .filter((a) => a.name.trim())
      .map((a) => ({
        ...(a._id ? { _id: a._id } : {}), // keep the id so existing bookings still point at this amenity
        name: a.name.trim(),
        capacity: a.capacity === '' || a.capacity == null ? undefined : Number(a.capacity),
        hourlyRate: a.hourlyRate === '' || a.hourlyRate == null ? undefined : Number(a.hourlyRate),
        bookingRequired: !!a.bookingRequired,
        isActive: a.isActive !== false,
        openTime: a.openTime || '06:00',
        closeTime: a.closeTime || '22:00',
        slotMinutes: Number(a.slotMinutes) || 60,
        maxSlotsPerBooking: Number(a.maxSlotsPerBooking) || 3,
        maxAdvanceDays: Number(a.maxAdvanceDays) || 30,
        requiresApproval: a.requiresApproval !== false
      }))
    const ok = await run('amenities', () => api.put(`/societies/${amenityFor._id}`, { amenities: cleaned }), 'Amenities saved')
    if (ok) setAmenityFor(null)
  }

  const columns = [
    {
      key: 'name',
      header: 'Society',
      render: (s) => (
        <div className="md:text-left">
          <p className="font-semibold">{s.name}</p>
          <p className="text-xs text-muted">{[s.address?.city, s.address?.state].filter(Boolean).join(', ')}</p>
        </div>
      )
    },
    { key: 'flats', header: 'Flats', render: (s) => s.totalFlats },
    { key: 'contact', header: 'Contact', render: (s) => s.contactNumber },
    { key: 'admins', header: 'Admins', render: (s) => (s.admins?.length ? s.admins.map((a) => a.name).join(', ') : <span className="text-muted">None yet</span>) },
    { key: 'amenities', header: 'Amenities', render: (s) => s.amenities?.length || 0 },
    {
      key: 'actions',
      header: '',
      className: 'md:text-right',
      render: (s) => (
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-secondary btn-sm" onClick={() => { setAmenityFor(s); setAmenities((s.amenities || []).map((a) => ({ ...a }))) }}>
            Amenities
          </button>
          {isSuperAdmin && (
            <button className="btn-secondary btn-sm" onClick={() => setAdminFor(s)}>
              <FiUserPlus size={14} /> Add admin
            </button>
          )}
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title={isSuperAdmin ? 'Societies' : 'Your society'}
        subtitle={isSuperAdmin ? 'Create societies and appoint their admins.' : 'Manage the amenities residents can book.'}
        action={
          isSuperAdmin && (
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <FiPlus size={16} /> New society
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
            icon={FiHome}
            title="No societies yet"
            text="Create the first society, then add an admin who can approve residents."
            action={isSuperAdmin ? <button className="btn-primary" onClick={() => setCreateOpen(true)}>New society</button> : null}
          />
        }
      />

      {/* Create society */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New society"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" form="society-form" type="submit" disabled={busy === 'create'}>
              {busy === 'create' && <Spinner className="h-4 w-4" />}
              Create society
            </button>
          </>
        }
      >
        <form id="society-form" onSubmit={createSociety} className="space-y-4">
          <Field label="Society name" htmlFor="s-name"><input id="s-name" required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Street address" htmlFor="s-street"><input id="s-street" required className="input" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" htmlFor="s-city"><input id="s-city" required className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="State" htmlFor="s-state"><input id="s-state" required className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
            <Field label="Pincode" htmlFor="s-pin"><input id="s-pin" required inputMode="numeric" maxLength={6} className="input" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Total flats" htmlFor="s-flats"><input id="s-flats" required type="number" min="1" className="input" value={form.totalFlats} onChange={(e) => setForm({ ...form, totalFlats: e.target.value })} /></Field>
            <Field label="Contact number" htmlFor="s-contact"><input id="s-contact" required type="tel" inputMode="numeric" maxLength={10} className="input" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} /></Field>
            <Field label="Email" htmlFor="s-email" hint="Optional"><input id="s-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
          <Field label="Blocks" htmlFor="s-blocks" hint="Optional. Block name and flats, like A:40, B:36"><input id="s-blocks" className="input" value={form.blocks} onChange={(e) => setForm({ ...form, blocks: e.target.value })} /></Field>
          {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
        </form>
      </Modal>

      {/* Add admin */}
      <Modal
        open={!!adminFor}
        onClose={() => setAdminFor(null)}
        title={`Add admin for ${adminFor?.name || ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAdminFor(null)}>Cancel</button>
            <button className="btn-primary" form="admin-form" type="submit" disabled={busy === 'admin'}>
              {busy === 'admin' && <Spinner className="h-4 w-4" />}
              Add admin
            </button>
          </>
        }
      >
        <form id="admin-form" onSubmit={createAdmin} className="space-y-4">
          <Field label="Full name" htmlFor="a-name"><input id="a-name" required className="input" value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="a-email"><input id="a-email" required type="email" className="input" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} /></Field>
            <Field label="Phone" htmlFor="a-phone"><input id="a-phone" required type="tel" inputMode="numeric" maxLength={10} className="input" value={admin.phone} onChange={(e) => setAdmin({ ...admin, phone: e.target.value })} /></Field>
          </div>
          <Field label="Temporary password" htmlFor="a-pass" hint="At least 8 characters with a letter and a number. They can change it after signing in."><input id="a-pass" required type="password" minLength={8} autoComplete="new-password" className="input" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} /></Field>
          {adminError && <p role="alert" className="text-sm font-medium text-danger">{adminError}</p>}
        </form>
      </Modal>

      {/* Amenities */}
      <Modal
        open={!!amenityFor}
        onClose={() => setAmenityFor(null)}
        title={`Amenities${amenityFor ? ` at ${amenityFor.name}` : ''}`}
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAmenityFor(null)}>Cancel</button>
            <button className="btn-primary" onClick={saveAmenities} disabled={busy === 'amenities'}>
              {busy === 'amenities' && <Spinner className="h-4 w-4" />}
              Save amenities
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {amenities.length === 0 && <p className="text-sm text-muted">No amenities yet. Add the spaces residents can book, like a clubhouse or tennis court.</p>}
          {amenities.map((a, i) => {
            const set = (patch) => setAmenities(amenities.map((x, j) => (j === i ? { ...x, ...patch } : x)))
            return (
              <div key={a._id || i} className="space-y-3 rounded-md border border-edge p-3">
                <div className="grid items-end gap-3 sm:grid-cols-[1fr_100px_110px_auto]">
                  <Field label="Name" htmlFor={`am-name-${i}`}><input id={`am-name-${i}`} className="input" value={a.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                  <Field label="Capacity" htmlFor={`am-cap-${i}`}><input id={`am-cap-${i}`} type="number" min="1" className="input" value={a.capacity ?? ''} onChange={(e) => set({ capacity: e.target.value })} /></Field>
                  <Field label="₹ per hour" htmlFor={`am-rate-${i}`}><input id={`am-rate-${i}`} type="number" min="0" className="input" value={a.hourlyRate ?? ''} onChange={(e) => set({ hourlyRate: e.target.value })} /></Field>
                  <button className="btn-ghost btn-sm" onClick={() => setAmenities(amenities.filter((_, j) => j !== i))} aria-label={`Remove ${a.name || 'amenity'}`}><FiTrash2 size={15} /></button>
                </div>
                <div className="grid items-end gap-3 sm:grid-cols-5">
                  <Field label="Opens" htmlFor={`am-open-${i}`}><input id={`am-open-${i}`} type="time" className="input" value={a.openTime || '06:00'} onChange={(e) => set({ openTime: e.target.value })} /></Field>
                  <Field label="Closes" htmlFor={`am-close-${i}`}><input id={`am-close-${i}`} type="time" className="input" value={a.closeTime || '22:00'} onChange={(e) => set({ closeTime: e.target.value })} /></Field>
                  <Field label="Slot length" htmlFor={`am-slot-${i}`}>
                    <select id={`am-slot-${i}`} className="input" value={a.slotMinutes || 60} onChange={(e) => set({ slotMinutes: Number(e.target.value) })}>
                      {[30, 60, 90, 120].map((n) => <option key={n} value={n}>{n} min</option>)}
                    </select>
                  </Field>
                  <Field label="Max slots in a row" htmlFor={`am-max-${i}`}><input id={`am-max-${i}`} type="number" min="1" max="12" className="input" value={a.maxSlotsPerBooking || 3} onChange={(e) => set({ maxSlotsPerBooking: e.target.value })} /></Field>
                  <Field label="Book ahead (days)" htmlFor={`am-adv-${i}`}><input id={`am-adv-${i}`} type="number" min="1" max="90" className="input" value={a.maxAdvanceDays || 30} onChange={(e) => set({ maxAdvanceDays: e.target.value })} /></Field>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={a.requiresApproval !== false} onChange={(e) => set({ requiresApproval: e.target.checked })} /> Office approves each booking</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={a.isActive !== false} onChange={(e) => set({ isActive: e.target.checked })} /> Open for booking</label>
                </div>
              </div>
            )
          })}
          <button className="btn-secondary btn-sm" onClick={() => setAmenities([...amenities, { name: '', capacity: '', hourlyRate: '', bookingRequired: true, isActive: true, openTime: '06:00', closeTime: '22:00', slotMinutes: 60, maxSlotsPerBooking: 3, maxAdvanceDays: 30, requiresApproval: true }])}>
            <FiPlus size={14} /> Add amenity
          </button>
        </div>
      </Modal>
    </>
  )
}

export default AdminSocieties
