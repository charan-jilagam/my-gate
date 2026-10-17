import { useState } from 'react'
import { FiCheck, FiHelpCircle, FiX } from 'react-icons/fi'
import api from '../services/api'
import useAction from '../hooks/useAction'

/** "Are you coming?" for an event notice. `notice.rsvp` holds the counts and the viewer's own answer. */
const Rsvp = ({ notice, canReply, onDone }) => {
  const { busy, run } = useAction(onDone)
  const r = notice.rsvp || { going: 0, people: 0, maybe: 0, no: 0, mine: null }
  const [guests, setGuests] = useState(r.mine?.guests || 0)
  const over = notice.eventDate && new Date(notice.eventDate) < new Date()

  const reply = (status) => run(status, () => api.post(`/notices/${notice._id}/rsvp`, { status, guests: status === 'no' ? 0 : guests }), status === 'going' ? 'See you there!' : 'Reply saved')

  const Btn = ({ status, icon: Icon, label }) => (
    <button type="button" aria-pressed={r.mine?.status === status} disabled={!!busy} onClick={() => reply(status)}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ring-1 ${r.mine?.status === status ? 'bg-brand text-brand-ink ring-brand' : 'bg-surface ring-line hover:bg-sunken'}`}>
      <Icon size={14} /> {label}
    </button>
  )

  return (
    <div className="mt-3 rounded-md bg-sunken p-3">
      <p className="text-sm"><strong>{r.people}</strong> {r.people === 1 ? 'person' : 'people'} coming{r.maybe ? `, ${r.maybe} maybe` : ''}</p>
      {canReply && !over && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Btn status="going" icon={FiCheck} label="Going" />
          <Btn status="maybe" icon={FiHelpCircle} label="Maybe" />
          <Btn status="no" icon={FiX} label="Can't come" />
          <label className="ml-1 inline-flex items-center gap-1.5 text-sm">
            Extra guests
            <select className="input w-auto py-1" value={guests} onChange={(e) => setGuests(Number(e.target.value))} aria-label="Extra guests">
              {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
        </div>
      )}
      {canReply && over && <p className="mt-1 text-xs text-muted">This event has finished.</p>}
    </div>
  )
}

export default Rsvp
