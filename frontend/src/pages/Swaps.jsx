import { useState } from 'react'
import { FiRepeat, FiCheck, FiX, FiArrowRight } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { EmptyState, ErrorState, ListSkeleton, Modal, PageHeader, StatusTag, Tabs, Field } from '../components/ui'
import { dayLabel, timeLabel } from '../utils/services'
import { useHighlight } from '../hooks/useHighlight'

const STATUS = {
  pending: ['on_the_way', 'Waiting for answer'],
  accepted: ['approved', 'Swapped'],
  declined: ['rejected', 'Declined'],
  cancelled: ['cancelled', 'Cancelled'],
  expired: ['expired', 'Too late']
}

const ShiftChip = ({ label, s }) => (
  <div className="min-w-0 flex-1 rounded-lg bg-canvas px-3 py-2 ring-1 ring-edge">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
    {s ? (
      <>
        <p className="font-semibold">{dayLabel(s.date)}</p>
        <p className="text-sm">{timeLabel(s.startTime)} to {timeLabel(s.endTime)}</p>
        {(s.postName || s.post) && <p className="truncate text-xs text-muted">{s.postName || String(s.post).replace(/_/g, ' ')}</p>}
      </>
    ) : (
      <p className="text-sm text-muted">Shift removed</p>
    )}
  </div>
)

const SwapCard = ({ s, me, busy, run, reload, isOffice }) => {
  const { t } = useT()
  const mine = s.requester.id === me
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState('')
  const headline = isOffice && s.requester.id !== me && s.target.id !== me
    ? `${s.requester.name} and ${s.target.name}`
    : mine
      ? `You asked ${s.target.name}`
      : `${s.requester.name} asks you`
  return (
    <li data-item-id={s._id} className="panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{headline}</p>
        <StatusTag status={STATUS[s.status]?.[0] || 'neutral'} label={STATUS[s.status]?.[1] || s.status} />
      </div>
      <div className="mt-3 flex items-stretch gap-2">
        <ShiftChip label={mine ? 'Your shift' : `${s.requester.name}'s shift`} s={s.requesterShift} />
        <span className="grid place-items-center text-muted"><FiRepeat /></span>
        <ShiftChip label={mine ? `${s.target.name}'s shift` : 'Your shift'} s={s.targetShift} />
      </div>
      {s.reason && <p className="mt-2 text-sm text-muted">“{s.reason}”</p>}
      {s.declineNote && <p className="mt-2 text-sm text-muted">{t('Reason for declining')}: {s.declineNote}</p>}
      {s.canAccept && !declining && (
        <div className="mt-3 flex gap-2">
          <button className="btn-ok flex-1" disabled={!!busy} onClick={() => run(s._id, () => api.put(`/guards/swaps/${s._id}/accept`), 'Swapped. Your roster is updated.')}><FiCheck /> {t('Accept')}</button>
          <button className="btn-secondary flex-1" disabled={!!busy} onClick={() => setDeclining(true)}><FiX /> {t('Decline')}</button>
        </div>
      )}
      {declining && (
        <div className="mt-3 space-y-2">
          <input className="input" placeholder={t('Reason (optional)')} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-danger flex-1" disabled={!!busy} onClick={async () => { const ok = await run(s._id, () => api.put(`/guards/swaps/${s._id}/decline`, { note }), 'Declined.'); if (ok) setDeclining(false) }}>{t('Decline request')}</button>
            <button className="btn-ghost" onClick={() => setDeclining(false)}>{t('Back')}</button>
          </div>
        </div>
      )}
      {s.canCancel && (
        <button className="btn-secondary mt-3 w-full" disabled={!!busy} onClick={() => run(s._id, () => api.put(`/guards/swaps/${s._id}/cancel`), 'Request cancelled.')}>{t('Cancel my request')}</button>
      )}
    </li>
  )
}

// Three small steps: pick your shift, pick a colleague's shift, add a note.
const NewSwap = ({ open, onClose, onSent }) => {
  const { t } = useT()
  const { data, loading, error, reload } = useApi('/guards/swaps/options', { enabled: open })
  const [mine, setMine] = useState(null)
  const [person, setPerson] = useState(null)
  const [theirs, setTheirs] = useState(null)
  const [reason, setReason] = useState('')
  const { busy, run } = useAction()
  const step = !mine ? 1 : !theirs ? 2 : 3
  const reset = () => { setMine(null); setPerson(null); setTheirs(null); setReason('') }
  const close = () => { reset(); onClose() }
  const send = async () => {
    const ok = await run('send', () => api.post('/guards/swaps', { myShiftId: mine._id, theirShiftId: theirs._id, reason: reason.trim() || undefined }), 'Request sent.')
    if (ok) { reset(); onSent() }
  }
  const row = (s, selected, onPick) => (
    <button key={s._id} onClick={onPick} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ring-1 ${selected ? 'bg-brand text-brand-ink ring-brand' : 'bg-surface ring-edge'}`}>
      <span className="font-semibold">{dayLabel(s.date)}</span> · {timeLabel(s.startTime)} to {timeLabel(s.endTime)}
      {(s.postName || s.post) && <span className="block text-xs opacity-80">{s.postName || String(s.post).replace(/_/g, ' ')}</span>}
    </button>
  )
  return (
    <Modal open={open} onClose={close} title="Ask to swap a shift"
      footer={step === 3 ? (
        <>
          <button className="btn-ghost" onClick={() => setTheirs(null)}>{t('Back')}</button>
          <button className="btn-primary" disabled={!!busy} onClick={send}>{t('Send request')}</button>
        </>
      ) : null}>
      {loading ? <ListSkeleton rows={3} /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <div className="space-y-3">
          <p className="text-sm text-muted">{t('Step')} {step} {t('of')} 3</p>
          {step === 1 && (
            <>
              <p className="font-semibold">{t('Which of your shifts do you want to give away?')}</p>
              {!data?.mine?.length ? <p className="text-sm text-muted">{t('You have no upcoming shifts that can be swapped.')}</p> : data.mine.map((s) => row(s, false, () => setMine(s)))}
            </>
          )}
          {step === 2 && (
            <>
              <p className="font-semibold">{t('Whose shift do you want in return?')}</p>
              <p className="text-sm text-muted">{t('You give')}: {dayLabel(mine.date)} {timeLabel(mine.startTime)} to {timeLabel(mine.endTime)} <button className="ml-1 font-semibold text-brand underline" onClick={() => { setMine(null); setPerson(null) }}>{t('Change')}</button></p>
              {!data?.others?.length ? <p className="text-sm text-muted">{t('No colleague has a shift you can ask for right now.')}</p> : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {data.others.map((o) => (
                      <button key={o.userId} onClick={() => setPerson(o)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${person?.userId === o.userId ? 'bg-brand text-brand-ink ring-brand' : 'bg-surface ring-edge'}`}>{o.name}</button>
                    ))}
                  </div>
                  {person && <div className="space-y-2">{person.shifts.map((s) => row(s, false, () => setTheirs(s)))}</div>}
                </>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <ShiftChip label="You give" s={mine} /><FiArrowRight className="shrink-0 text-muted" /><ShiftChip label={`${person?.name || ''} gives`} s={theirs} />
              </div>
              <Field label="A short note (optional)" hint="For example: I have a family function that day.">
                <input className="input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <p className="text-xs text-muted">{t('Nothing changes until they accept. The office will be told once it is done.')}</p>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

const Swaps = () => {
  const { t } = useT()
  const { user, isOffice } = useAuth()
  const canAsk = ['security', 'guard_admin', 'staff'].includes(user.role)
  const [box, setBox] = useState('todo')
  const [asking, setAsking] = useState(false)
  const { data, loading, error, reload } = useApi('/guards/swaps')
  const { busy, run } = useAction(reload)
  const swaps = data?.swaps || []
  const me = String(user._id || user.id)
  const todo = swaps.filter((s) => s.canAccept)
  const sent = swaps.filter((s) => s.requester.id === me && !s.canAccept)
  const rest = swaps.filter((s) => !s.canAccept && s.requester.id !== me)
  const shown = box === 'todo' ? todo : box === 'sent' ? sent : isOffice ? swaps : rest
  useHighlight(!loading)

  const tabs = [
    { key: 'todo', label: 'Asked of me', count: todo.length },
    { key: 'sent', label: 'My requests' },
    ...(isOffice ? [{ key: 'all', label: 'Everyone' }] : [{ key: 'past', label: 'Other' }])
  ]

  return (
    <>
      <PageHeader title="Shift swaps" subtitle="Swap a shift with a colleague. They must accept, and the office is told." action={canAsk && <button className="btn-primary" onClick={() => setAsking(true)}><FiRepeat /> {t('Ask to swap')}</button>} />
      <Tabs items={tabs} value={box} onChange={setBox} />
      {loading ? <div className="panel"><ListSkeleton rows={3} /></div> : error ? <div className="panel"><ErrorState message={error} onRetry={reload} /></div> : !shown.length ? (
        <div className="panel"><EmptyState icon={FiRepeat} title="Nothing here" text={box === 'todo' ? 'No one has asked you to swap right now.' : 'No swap requests yet.'} /></div>
      ) : (
        <ul className="space-y-3">{shown.map((s) => <SwapCard key={s._id} s={s} me={me} busy={busy} run={run} reload={reload} isOffice={isOffice} />)}</ul>
      )}
      {canAsk && <NewSwap open={asking} onClose={() => setAsking(false)} onSent={() => { setAsking(false); setBox('sent'); reload() }} />}
    </>
  )
}

export default Swaps
