import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiCamera, FiLogIn, FiLogOut, FiSearch, FiUserPlus } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { readScan } from '../utils/pass'
import QrScanner from '../components/QrScanner'
import VisitorCard from '../components/VisitorCard'
import CheckInSheet from '../components/CheckInSheet'
import CodePrompt from '../components/CodePrompt'
import HelperGate from '../components/HelperGate'
import { clock, flatText, isOverdue, minutesOver, overText } from '../utils/gate'
import { EmptyState, ErrorState, Field, ListSkeleton, Modal, PageHeader, Spinner, StatusTag, errorMessage, formatDate, titleCase } from '../components/ui'

const PURPOSES = ['personal', 'business', 'delivery', 'service', 'other']
const EMPTY_WALK_IN = { name: '', phone: '', block: '', flatNo: '', purpose: 'personal', numberOfVisitors: 1, vehicleNumber: '' }
const TABS = [
  { key: 'visitors', label: 'Visitors' },
  { key: 'help', label: 'Daily help' },
  { key: 'deliveries', label: 'Deliveries' },
  { key: 'vehicles', label: 'Vehicles' }
]

const Row = ({ title, meta, status, children }) => (
  <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
    <div className="min-w-0 flex-1">
      <p className="truncate font-semibold">{title}</p>
      <p className="truncate text-xs text-muted">{meta}</p>
    </div>
    {status}
    <div className="flex gap-2">{children}</div>
  </li>
)

const Group = ({ title, hint, loading, error, onRetry, count, empty, children }) => (
  <section className="panel overflow-hidden">
    <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
      <h2 className="text-base font-bold">{title}</h2>
      <span className="text-xs text-muted">{hint}{typeof count === 'number' ? ` · ${count}` : ''}</span>
    </div>
    {loading ? <ListSkeleton rows={2} /> : error ? <ErrorState message={error} onRetry={onRetry} /> : count === 0 ? <p className="px-4 py-6 text-sm text-muted">{empty}</p> : <ul className="divide-y divide-line">{children}</ul>}
  </section>
)

const flatOf = flatText

const GateConsole = () => {
  const { user } = useAuth()
  const [tab, setTab] = useState('visitors')

  const expected = useApi('/visitors', { params: { status: 'approved', limit: 100 }, select: (d) => d.visitors || [] })
  const inside = useApi('/visitors', { params: { status: 'checked_in', limit: 100 }, select: (d) => d.visitors || [] })
  const waiting = useApi('/visitors', { params: { status: 'pending', limit: 100 }, select: (d) => d.visitors || [] })
  const dApproved = useApi('/deliveries', { params: { status: 'approved', limit: 100 }, enabled: tab === 'deliveries', select: (d) => d.deliveries || [] })
  const dTransit = useApi('/deliveries', { params: { status: 'in_transit', limit: 100 }, enabled: tab === 'deliveries', select: (d) => d.deliveries || [] })

  const refreshAll = async () => {
    await Promise.all([expected.reload(), inside.reload(), waiting.reload(), tab === 'deliveries' && dApproved.reload(), tab === 'deliveries' && dTransit.reload()].filter(Boolean))
  }
  const { busy, run } = useAction(refreshAll)

  // Check-in is two steps: the pass code is proven first, then the guard notes how long the visitor will stay.
  const [checkingIn, setCheckingIn] = useState(null)
  const [checkCode, setCheckCode] = useState('')
  const [entering, setEntering] = useState(null) // { visitor, mode: 'in' | 'out' } while the guard enters a code
  const afterCheckIn = async (v) => {
    setCheckingIn(null)
    toast.success(`${v.name} checked in`)
    await refreshAll()
    if (lookup?._id === v._id) await refreshLookup()
  }

  // Pass-code lookup
  const [code, setCode] = useState('')
  const [lookup, setLookup] = useState(null)
  const [lookupError, setLookupError] = useState('')
  const [lookupCode, setLookupCode] = useState('')
  const [looking, setLooking] = useState(false)

  const [scanning, setScanning] = useState(false)
  const onScan = (text) => {
    setScanning(false)
    const read = readScan(text)
    if (read.kind === 'helper') {
      setTab('help')
      return toast('That is a daily help code. Use the Daily help tab.')
    }
    if (read.kind !== 'visitor') return setLookupError('That QR code is not a Nivora visitor pass.')
    setCode(read.code)
    findPass(null, read.code)
  }

  const findPass = async (e, override) => {
    e?.preventDefault()
    const query = (override ?? code).trim().slice(0, 8)
    setLookupError('')
    setLookup(null)
    setLooking(true)
    try {
      const { data } = await api.get(`/visitors/lookup/${encodeURIComponent(query)}`)
      setLookup(data.visitor)
      setLookupCode(query)
    } catch (err) {
      setLookupError(errorMessage(err, 'Could not look up that code.'))
    } finally {
      setLooking(false)
    }
  }

  const refreshLookup = async () => {
    try {
      const { data } = await api.get(`/visitors/lookup/${encodeURIComponent(lookupCode)}`)
      setLookup(data.visitor)
    } catch (e) {
      setLookup(null)
    }
  }

  const act = async (id, path, message, body) => {
    const ok = await run(id, () => api.put(path, body), message)
    if (ok && lookup?._id === id) await refreshLookup()
  }

  // The visitor's code is checked against the visitor the guard picked, so a code cannot be used for someone else.
  const confirmCode = async (value) => {
    const { visitor: v, mode } = entering
    try {
      const { data } = await api.get(`/visitors/lookup/${encodeURIComponent(value.slice(0, 8))}`)
      if (data.visitor._id !== v._id) return `That code belongs to ${data.visitor.name}, not ${v.name}.`
    } catch (err) {
      return errorMessage(err, 'That code is not valid.')
    }
    if (mode === 'in') {
      setEntering(null)
      setCheckCode(value.slice(0, 8))
      setCheckingIn(v)
      return ''
    }
    try {
      await api.put(`/visitors/${v._id}/check-out`, { code: value.slice(0, 8) })
      toast.success(`${v.name} checked out`)
      setEntering(null)
      await refreshAll()
      return ''
    } catch (err) {
      return errorMessage(err, 'Could not check this visitor out.')
    }
  }

  const startCheckIn = (v, known) => {
    if (v.requiresCode === false) { setCheckCode(''); return setCheckingIn(v) }
    if (known) { setCheckCode(known); return setCheckingIn(v) }
    return setEntering({ visitor: v, mode: 'in' })
  }
  const startCheckOut = (v, known) => {
    if (v.requiresCode === false) return act(v._id, `/visitors/${v._id}/check-out`, `${v.name} checked out`)
    if (known) return act(v._id, `/visitors/${v._id}/check-out`, `${v.name} checked out`, { code: known })
    return setEntering({ visitor: v, mode: 'out' })
  }

  // Walk-in
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkIn, setWalkIn] = useState(EMPTY_WALK_IN)
  const [walkInError, setWalkInError] = useState('')

  const submitWalkIn = async (e) => {
    e.preventDefault()
    setWalkInError('')
    if (!/^[0-9]{10}$/.test(walkIn.phone)) return setWalkInError('Enter the visitor\'s 10-digit phone number.')
    const payload = Object.fromEntries(Object.entries({ ...walkIn, numberOfVisitors: Number(walkIn.numberOfVisitors) || 1 }).filter(([, v]) => v !== ''))
    try {
      await api.post('/visitors/walk-in', payload)
      setWalkInOpen(false)
      setWalkIn(EMPTY_WALK_IN)
      await refreshAll()
      toast.success('The resident has been asked to approve.')
    } catch (err) {
      setWalkInError(errorMessage(err, 'Could not log this visitor.'))
    }
  }

  // Vehicle search
  const [plate, setPlate] = useState('')
  const [vehicle, setVehicle] = useState(null)
  const [vehicleError, setVehicleError] = useState('')
  const [searching, setSearching] = useState(false)

  const findVehicle = async (e) => {
    e.preventDefault()
    setVehicleError('')
    setVehicle(null)
    setSearching(true)
    try {
      const { data } = await api.get(`/vehicles/search/${encodeURIComponent(plate.trim().replace(/\s+/g, ''))}`)
      setVehicle(data.vehicle)
    } catch (err) {
      setVehicleError(err.response?.status === 404 ? 'No registered vehicle with that number.' : errorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  const logVehicle = async (kind) => {
    const body = kind === 'entry' ? { entryGate: 'Main gate' } : { exitGate: 'Main gate' }
    const ok = await run(vehicle._id, () => api.post(`/vehicles/${vehicle._id}/${kind}`, body), kind === 'entry' ? 'Entry logged' : 'Exit logged')
    if (ok) setVehicle({ ...vehicle, isInside: kind === 'entry' })
  }

  // `known` is the code the guard already used to find this visitor, so it is not asked for twice.
  const visitorButtons = (v, known) => (
    <>
      {v.status === 'approved' && (
        <button className="btn-primary btn-sm" disabled={busy === v._id} onClick={() => startCheckIn(v, known)}>
          <FiLogIn size={14} /> {v.requiresCode === false || known ? 'Check in' : 'Check in with code'}
        </button>
      )}
      {v.status === 'checked_in' && (
        <button className="btn-secondary btn-sm" disabled={busy === v._id} onClick={() => startCheckOut(v, known)}>
          <FiLogOut size={14} /> {v.requiresCode === false || known ? 'Check out' : 'Check out with code'}
        </button>
      )}
    </>
  )

  return (
    <>
      <PageHeader
        title="Gate console"
        subtitle={`Signed in as ${user?.name}. Everything here updates as residents respond.`}
        action={
          <button className="btn-primary" onClick={() => setWalkInOpen(true)}>
            <FiUserPlus size={16} /> Log walk-in
          </button>
        }
      />

      <div className="mb-5 flex gap-1 rounded-lg bg-sunken p-1" role="tablist" aria-label="Gate sections">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${tab === t.key ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <CheckInSheet visitor={checkingIn} code={checkCode} onClose={() => setCheckingIn(null)} onDone={afterCheckIn} />

      <CodePrompt
        open={!!entering}
        title={entering?.mode === 'out' ? `Check out ${entering?.visitor.name}` : `Let in ${entering?.visitor.name || ''}`}
        text={entering?.mode === 'out' ? 'To leave, the visitor shows their QR code or says their pass code.' : 'The visitor shows their QR code or says the pass code from their invitation.'}
        confirmLabel={entering?.mode === 'out' ? 'Check out' : 'Verify and continue'}
        onClose={() => setEntering(null)}
        onSubmit={confirmCode}
      />

      <Modal open={scanning} onClose={() => setScanning(false)} title="Scan visitor pass" size="sm">
        {scanning && <QrScanner onScan={onScan} />}
      </Modal>

      {tab === 'visitors' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Expected', expected.data?.length ?? 0, 'text-ink'],
              ['Inside now', inside.data?.length ?? 0, 'text-brand'],
              ['Past exit time', (inside.data || []).filter((v) => isOverdue(v)).length, (inside.data || []).some((v) => isOverdue(v)) ? 'text-danger' : 'text-muted']
            ].map(([label, n, tone]) => (
              <div key={label} className="panel px-4 py-3">
                <p className={`font-display text-3xl font-extrabold leading-none ${tone}`}>{n}</p>
                <p className="mt-1 text-xs font-semibold text-muted">{label}</p>
              </div>
            ))}
          </div>

          <form onSubmit={findPass} className="panel p-4">
            <label htmlFor="pass" className="label">Visitor's pass code</label>
            <div className="flex gap-2">
              <input id="pass" className="input font-mono uppercase tracking-widest" placeholder="A1B2C3D4" maxLength={8} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9a-fA-F]/g, ''))} />
              <button className="btn-primary" disabled={looking || code.trim().length < 8}>
                {looking ? <Spinner className="h-4 w-4" /> : <FiSearch size={16} />} Find
              </button>
              <button type="button" className="btn-secondary" onClick={() => setScanning(true)} aria-label="Scan QR code with camera">
                <FiCamera size={16} /> <span className="hidden sm:inline">Scan</span>
              </button>
            </div>
            {lookupError && <p role="alert" className="mt-2 text-sm font-medium text-danger">{lookupError}</p>}
          </form>

          {lookup && <VisitorCard visitor={lookup} actions={visitorButtons(lookup, lookupCode)} />}

          <Group title="Waiting for the resident" hint="Walk-ins you logged" loading={waiting.loading} error={waiting.error} onRetry={waiting.reload} count={waiting.data?.length} empty="No walk-ins are waiting.">
            {(waiting.data || []).map((v) => (
              <Row key={v._id} title={v.name} meta={`${flatOf(v)} · ${v.phone} · ${formatDate(v.createdAt, true)}`} status={<StatusTag status="pending" label="Asked resident" />} />
            ))}
          </Group>

          <Group title="Expected" hint="Approved, not yet in" loading={expected.loading} error={expected.error} onRetry={expected.reload} count={expected.data?.length} empty="No approved visitors are expected.">
            {(expected.data || []).map((v) => (
              <Row key={v._id} title={v.name} meta={`${flatOf(v)} · ${v.phone} · ${titleCase(v.purpose)}`} status={<span className="text-xs text-muted">{v.requiresCode === false ? 'Resident approved' : 'Needs pass code'}</span>}>
                {visitorButtons(v)}
              </Row>
            ))}
          </Group>

          <Group title="Inside now" hint="Checked in" loading={inside.loading} error={inside.error} onRetry={inside.reload} count={inside.data?.length} empty="Nobody is inside right now.">
            {[...(inside.data || [])].sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a))).map((v) => (
              <Row key={v._id} title={v.name} meta={`${flatOf(v)} · in at ${clock(v.entryTime)}${v.expectedExit ? ` · out by ${clock(v.expectedExit)}` : ''}`} status={isOverdue(v) && <span className="tag-danger">{overText(minutesOver(v))}</span>}>
                {visitorButtons(v)}
              </Row>
            ))}
          </Group>
        </div>
      )}

      {tab === 'help' && <HelperGate />}

      {tab === 'deliveries' && (
        <div className="space-y-5">
          <Group title="Approved deliveries" hint="Waiting at the gate" loading={dApproved.loading} error={dApproved.error} onRetry={dApproved.reload} count={dApproved.data?.length} empty="No deliveries are waiting.">
            {(dApproved.data || []).map((d) => (
              <Row key={d._id} title={`${d.deliveryPersonName}${d.company ? ` · ${d.company}` : ''}`} meta={`For ${flatOf(d)} · ${d.deliveryPersonPhone}`}>
                <button className="btn-primary btn-sm" disabled={busy === d._id} onClick={() => run(d._id, () => api.put(`/deliveries/${d._id}/check-in`), 'Courier checked in')}>
                  <FiLogIn size={14} /> Check in
                </button>
              </Row>
            ))}
          </Group>
          <Group title="Inside the society" hint="Courier checked in" loading={dTransit.loading} error={dTransit.error} onRetry={dTransit.reload} count={dTransit.data?.length} empty="No couriers are inside.">
            {(dTransit.data || []).map((d) => (
              <Row key={d._id} title={`${d.deliveryPersonName}${d.company ? ` · ${d.company}` : ''}`} meta={`For ${flatOf(d)}`}>
                <button className="btn-secondary btn-sm" disabled={busy === d._id} onClick={() => run(d._id, () => api.put(`/deliveries/${d._id}/deliver`), 'Marked as delivered')}>
                  Delivered
                </button>
              </Row>
            ))}
          </Group>
        </div>
      )}

      {tab === 'vehicles' && (
        <form onSubmit={findVehicle} className="panel p-4">
          <label htmlFor="plate" className="label">Vehicle number</label>
          <div className="flex gap-2">
            <input id="plate" className="input font-mono uppercase tracking-wide" placeholder="KA01AB1234" autoComplete="off" value={plate} onChange={(e) => setPlate(e.target.value)} />
            <button className="btn-primary" disabled={searching || !plate.trim()}>
              {searching ? <Spinner className="h-4 w-4" /> : <FiSearch size={16} />} Search
            </button>
          </div>
          {vehicleError && <p role="alert" className="mt-3 text-sm font-medium text-danger">{vehicleError}</p>}
          {vehicle && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-sunken/60 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-lg font-bold">{vehicle.vehicleNumber}</p>
                <p className="text-xs text-muted">{[titleCase(vehicle.vehicleType), vehicle.brand, vehicle.color].filter(Boolean).join(' · ')} · {vehicle.residentId?.name} ({vehicle.residentId?.flatNo})</p>
              </div>
              <span className={vehicle.isInside ? 'tag-ok' : 'tag-neutral'}>{vehicle.isInside ? 'Inside' : 'Outside'}</span>
              {vehicle.isInside ? (
                <button type="button" className="btn-secondary btn-sm" disabled={busy === vehicle._id} onClick={() => logVehicle('exit')}><FiLogOut size={14} /> Log exit</button>
              ) : (
                <button type="button" className="btn-primary btn-sm" disabled={busy === vehicle._id} onClick={() => logVehicle('entry')}><FiLogIn size={14} /> Log entry</button>
              )}
            </div>
          )}
          {!vehicle && !vehicleError && (
            <div className="mt-4"><EmptyState title="Search a registered vehicle" text="Type the number plate to see the owner and log the vehicle in or out." /></div>
          )}
        </form>
      )}

      <Modal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        title="Log a walk-in visitor"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setWalkInOpen(false)}>Cancel</button>
            <button className="btn-primary" form="walkin-form" type="submit">Ask resident to approve</button>
          </>
        }
      >
        <form id="walkin-form" onSubmit={submitWalkIn} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Visitor name" htmlFor="w-name"><input id="w-name" required className="input" value={walkIn.name} onChange={(e) => setWalkIn({ ...walkIn, name: e.target.value })} /></Field>
            <Field label="Phone number" htmlFor="w-phone"><input id="w-phone" required type="tel" inputMode="numeric" maxLength={10} className="input" value={walkIn.phone} onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Block or tower" htmlFor="w-block" hint="If your society has blocks"><input id="w-block" className="input" value={walkIn.block} onChange={(e) => setWalkIn({ ...walkIn, block: e.target.value })} /></Field>
            <Field label="Flat number" htmlFor="w-flat"><input id="w-flat" required className="input" value={walkIn.flatNo} onChange={(e) => setWalkIn({ ...walkIn, flatNo: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Purpose" htmlFor="w-purpose">
              <select id="w-purpose" className="input" value={walkIn.purpose} onChange={(e) => setWalkIn({ ...walkIn, purpose: e.target.value })}>
                {PURPOSES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
              </select>
            </Field>
            <Field label="People" htmlFor="w-count"><input id="w-count" type="number" min="1" max="50" className="input" value={walkIn.numberOfVisitors} onChange={(e) => setWalkIn({ ...walkIn, numberOfVisitors: e.target.value })} /></Field>
            <Field label="Vehicle" htmlFor="w-vehicle" hint="Optional"><input id="w-vehicle" className="input uppercase" value={walkIn.vehicleNumber} onChange={(e) => setWalkIn({ ...walkIn, vehicleNumber: e.target.value })} /></Field>
          </div>
          {walkInError && <p role="alert" className="text-sm font-medium text-danger">{walkInError}</p>}
        </form>
      </Modal>
    </>
  )
}

export default GateConsole
