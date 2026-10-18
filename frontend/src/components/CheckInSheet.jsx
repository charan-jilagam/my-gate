import { useEffect, useState } from 'react'
import { FiClock, FiLogIn } from 'react-icons/fi'
import api from '../services/api'
import { Modal, Spinner, errorMessage } from './ui'
import { clockWithDay, flatText, floorOf } from '../utils/gate'

const STAYS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 480, label: '8 hours' }
]

const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

/** The guard lets someone in (after their code was checked) and notes when they are expected to leave. */
const CheckInSheet = ({ visitor, code, onClose, onDone }) => {
  const [stay, setStay] = useState(60)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (visitor) {
      setStay(60)
      setCustom('')
      setError('')
    }
  }, [visitor])

  if (!visitor) return null
  const leaveAt = stay === 'custom' ? (custom ? new Date(custom) : null) : new Date(Date.now() + stay * 60000)

  const confirm = async () => {
    setError('')
    if (!leaveAt || Number.isNaN(leaveAt.getTime())) return setError('Pick the time they are expected to leave.')
    if (leaveAt.getTime() <= Date.now()) return setError('That time has already passed.')
    setBusy(true)
    try {
      await api.put(`/visitors/${visitor._id}/check-in`, { ...(code ? { code } : {}), ...(stay === 'custom' ? { expectedExit: leaveAt.toISOString() } : { stayMinutes: stay }) })
      onDone?.(visitor)
    } catch (err) {
      setError(errorMessage(err, 'Could not check this visitor in.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Check in"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={confirm} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <FiLogIn size={15} />} Let them in
          </button>
        </>
      }
    >
      <div className="rounded-xl bg-sunken px-4 py-3">
        <p className="font-display text-lg font-bold">{visitor.name}</p>
        <p className="text-sm text-muted">{[`Going to ${flatText(visitor)}`, floorOf(visitor.flatNo), visitor.residentId?.name].filter(Boolean).join(' · ')}</p>
      </div>

      <p className="mb-2 mt-5 text-sm font-semibold">How long will they stay?</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Stay length">
        {[...STAYS, { minutes: 'custom', label: 'Pick a time' }].map((s) => {
          const on = stay === s.minutes
          return (
            <button key={s.minutes} type="button" role="radio" aria-checked={on} onClick={() => { setStay(s.minutes); if (s.minutes === 'custom' && !custom) setCustom(toLocalInput(new Date(Date.now() + 3600000))) }}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${on ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface hover:border-brand'}`}>
              {s.label}
            </button>
          )
        })}
      </div>
      {stay === 'custom' && (
        <input type="datetime-local" aria-label="Expected exit time" className="input mt-3" value={custom} onChange={(e) => setCustom(e.target.value)} />
      )}

      <p className="mt-4 flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2.5 text-sm font-semibold" role="status">
        <FiClock size={16} className="shrink-0 text-brand" />
        {leaveAt && !Number.isNaN(leaveAt.getTime()) ? `Expected out by ${clockWithDay(leaveAt)}` : 'Pick when they are expected to leave'}
      </p>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
    </Modal>
  )
}

export default CheckInSheet
