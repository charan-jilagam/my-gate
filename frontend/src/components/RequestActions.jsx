import { useState } from 'react'
import { FiCheck, FiNavigation, FiPlay, FiRepeat, FiStar, FiX, FiCheckCircle, FiDollarSign } from 'react-icons/fi'
import api from '../services/api'
import useAction from '../hooks/useAction'
import { Field, Modal, Spinner, StarInput } from './ui'
import SlotPicker from './SlotPicker'
import { dayLabel, timeLabel } from '../utils/services'

const EMPTY_COMPLETE = { finalAmount: '', workSummary: '', paid: true, method: 'cash' }

/**
 * Every step a person can take on a service request, as buttons plus the dialogs they open.
 * What shows is decided by the server (request.actions), so the rules live in one place.
 */
const RequestActions = ({ request, onDone, size = 'md', className = '' }) => {
  const a = request.actions || {}
  const { busy, run } = useAction(onDone)
  const [dialog, setDialog] = useState(null)
  const [text, setText] = useState('')
  const [complete, setComplete] = useState(EMPTY_COMPLETE)
  const [rating, setRating] = useState(0)
  const [method, setMethod] = useState('cash')
  const [slot, setSlot] = useState({ date: '', startTime: '' })
  const [refresh, setRefresh] = useState(0)
  const [problem, setProblem] = useState('')

  const base = `/service-requests/${request._id}`
  const sm = size === 'sm' ? ' btn-sm' : ''
  const isResident = request.viewerRole === 'resident'

  const open = (name) => {
    setProblem('')
    setDialog(name)
  }
  const close = () => {
    setDialog(null)
    setText('')
    setComplete(EMPTY_COMPLETE)
    setRating(0)
    setSlot({ date: '', startTime: '' })
    setProblem('')
  }
  const submit = async (key, call, message) => {
    const ok = await run(key, call, message)
    if (ok) close()
    return ok
  }

  const anything = Object.values(a).some(Boolean)
  if (!anything) return null

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        {a.accept && (
          <button className={`btn-ok${sm}`} disabled={!!busy} onClick={() => run('accept', () => api.put(`${base}/accept`), 'Confirmed. The resident has been told.')}>
            {busy === 'accept' ? <Spinner className="h-4 w-4" /> : <FiCheck size={15} />} Accept
          </button>
        )}
        {a.decline && (
          <button className={`btn-secondary${sm}`} disabled={!!busy} onClick={() => open('decline')}>
            <FiX size={15} /> Decline
          </button>
        )}
        {a.onTheWay && (
          <button className={`btn-secondary${sm}`} disabled={!!busy} onClick={() => run('way', () => api.put(`${base}/on-the-way`), 'The resident knows you are on the way.')}>
            {busy === 'way' ? <Spinner className="h-4 w-4" /> : <FiNavigation size={15} />} I am on my way
          </button>
        )}
        {a.start && (
          <button className={`btn-primary${sm}`} disabled={!!busy} onClick={() => open('start')}>
            <FiPlay size={15} /> Start job
          </button>
        )}
        {a.complete && (
          <button className={`btn-primary${sm}`} disabled={!!busy} onClick={() => open('complete')}>
            <FiCheckCircle size={15} /> Complete job
          </button>
        )}
        {a.markPaid && (
          <button className={`btn-secondary${sm}`} disabled={!!busy} onClick={() => open('pay')}>
            <FiDollarSign size={15} /> Mark as paid
          </button>
        )}
        {a.review && (
          <button className={`btn-primary${sm}`} disabled={!!busy} onClick={() => open('review')}>
            <FiStar size={15} /> Rate this job
          </button>
        )}
        {a.reschedule && (
          <button className={`btn-secondary${sm}`} disabled={!!busy} onClick={() => open('reschedule')}>
            <FiRepeat size={15} /> Change time
          </button>
        )}
        {a.cancel && (
          <button className={`btn-ghost${sm}`} disabled={!!busy} onClick={() => open('cancel')}>
            Cancel {isResident ? 'booking' : 'job'}
          </button>
        )}
      </div>

      {/* Decline */}
      <Modal
        open={dialog === 'decline'}
        onClose={close}
        title="Decline this job"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={close}>Back</button>
            <button className="btn-danger" disabled={busy === 'decline'} onClick={() => submit('decline', () => api.put(`${base}/decline`, { reason: text.trim() || undefined }), 'Declined')}>
              {busy === 'decline' && <Spinner className="h-4 w-4" />} Decline job
            </button>
          </>
        }
      >
        <Field label="Reason for the resident" htmlFor="ra-decline" hint="Optional, but it helps them choose another time.">
          <input id="ra-decline" className="input" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: I am away that day" />
        </Field>
      </Modal>

      {/* Cancel */}
      <Modal
        open={dialog === 'cancel'}
        onClose={close}
        title={isResident ? 'Cancel this booking?' : 'Cancel this job'}
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={close}>Keep it</button>
            <button
              className="btn-danger"
              disabled={busy === 'cancel'}
              onClick={() => {
                if (!isResident && text.trim().length < 3) return setProblem('Please give a short reason so the resident understands.')
                return submit('cancel', () => api.put(`${base}/cancel`, { reason: text.trim() || undefined }), 'Cancelled')
              }}
            >
              {busy === 'cancel' && <Spinner className="h-4 w-4" />} Yes, cancel
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          {isResident ? 'The slot is released for others and the vendor is told.' : 'The resident is told straight away, so give them a clear reason.'}
        </p>
        <Field label={isResident ? 'Reason (optional)' : 'Reason'} htmlFor="ra-cancel" error={problem}>
          <input id="ra-cancel" className="input" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </Modal>

      {/* Start, with the resident's code */}
      <Modal
        open={dialog === 'start'}
        onClose={close}
        title="Start the job"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={close}>Back</button>
            <button className="btn-primary" disabled={busy === 'start' || text.length !== 4} onClick={() => submit('start', () => api.put(`${base}/start`, { otp: text }), 'Job started')}>
              {busy === 'start' && <Spinner className="h-4 w-4" />} Start
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">Ask the resident for the 4-digit start code shown in their app. It confirms you are at the right door.</p>
        <Field label="Start code" htmlFor="ra-otp">
          <input
            id="ra-otp"
            className="input text-center font-display text-2xl font-bold tracking-[0.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={text}
            onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="0000"
          />
        </Field>
      </Modal>

      {/* Complete */}
      <Modal
        open={dialog === 'complete'}
        onClose={close}
        title="Complete the job"
        footer={
          <>
            <button className="btn-secondary" onClick={close}>Back</button>
            <button
              className="btn-primary"
              disabled={busy === 'complete'}
              onClick={() => {
                if (complete.finalAmount === '' || Number(complete.finalAmount) < 0) return setProblem('Enter the amount for this job (0 if there is no charge).')
                const body = { finalAmount: Number(complete.finalAmount), workSummary: complete.workSummary.trim() || undefined, paymentStatus: complete.paid ? 'paid' : 'unpaid' }
                if (complete.paid) body.paymentMethod = complete.method
                return submit('complete', () => api.put(`${base}/complete`, body), 'Job completed')
              }}
            >
              {busy === 'complete' && <Spinner className="h-4 w-4" />} Mark complete
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Amount for this job (₹)" htmlFor="ra-amount" hint={request.visitCharge ? `Your visit charge was ₹${request.visitCharge}. Include parts and labour.` : 'Include parts and labour.'}>
            <input id="ra-amount" type="number" min="0" inputMode="decimal" className="input" value={complete.finalAmount} onChange={(e) => setComplete({ ...complete, finalAmount: e.target.value })} />
          </Field>
          <Field label="What was done" htmlFor="ra-summary" hint="Optional. The resident sees this.">
            <textarea id="ra-summary" rows={2} maxLength={500} className="input" value={complete.workSummary} onChange={(e) => setComplete({ ...complete, workSummary: e.target.value })} />
          </Field>
          <fieldset>
            <legend className="label">Payment</legend>
            <div className="flex flex-wrap gap-2">
              {[
                [true, 'Paid now'],
                [false, 'To be paid later']
              ].map(([v, label]) => (
                <label key={label} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${complete.paid === v ? 'border-brand bg-brand-soft' : 'border-line'}`}>
                  <input type="radio" name="paid" checked={complete.paid === v} onChange={() => setComplete({ ...complete, paid: v })} /> {label}
                </label>
              ))}
            </div>
            {complete.paid && (
              <select aria-label="Payment method" className="input mt-3" value={complete.method} onChange={(e) => setComplete({ ...complete, method: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="other">Other</option>
              </select>
            )}
          </fieldset>
          {problem && <p role="alert" className="text-sm font-medium text-danger">{problem}</p>}
        </div>
      </Modal>

      {/* Mark paid later */}
      <Modal
        open={dialog === 'pay'}
        onClose={close}
        title="Mark as paid"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={close}>Back</button>
            <button className="btn-primary" disabled={busy === 'pay'} onClick={() => submit('pay', () => api.put(`${base}/payment`, { paymentMethod: method }), 'Marked as paid')}>
              {busy === 'pay' && <Spinner className="h-4 w-4" />} Mark paid
            </button>
          </>
        }
      >
        <Field label="How were you paid?" htmlFor="ra-method">
          <select id="ra-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </Modal>

      {/* Reschedule */}
      <Modal
        open={dialog === 'reschedule'}
        onClose={close}
        title="Change the time"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={close}>Back</button>
            <button
              className="btn-primary"
              disabled={!slot.startTime || busy === 'move'}
              onClick={async () => {
                const ok = await run('move', () => api.put(`${base}/reschedule`, { date: slot.date, startTime: slot.startTime }), 'Time changed')
                if (ok) close()
                else setRefresh((n) => n + 1) // the slot may have just been taken
              }}
            >
              {busy === 'move' && <Spinner className="h-4 w-4" />} {slot.startTime ? `Move to ${dayLabel(slot.date)}, ${timeLabel(slot.startTime)}` : 'Pick a new time'}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Currently {dayLabel(request.date)}, {timeLabel(request.startTime)}.
          {request.status === 'confirmed' ? ' The vendor may need to confirm the new time.' : ''}
        </p>
        {dialog === 'reschedule' && <SlotPicker providerId={request.provider.profileId} value={slot} onChange={setSlot} refreshKey={refresh} />}
      </Modal>

      {/* Review */}
      <Modal
        open={dialog === 'review'}
        onClose={close}
        title="How was the service?"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={close}>Later</button>
            <button className="btn-primary" disabled={!rating || busy === 'review'} onClick={() => submit('review', () => api.put(`${base}/review`, { rating, review: text.trim() || undefined }), 'Thanks for rating')}>
              {busy === 'review' && <Spinner className="h-4 w-4" />} Submit
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex justify-center py-1">
            <StarInput value={rating} onChange={setRating} />
          </div>
          <Field label="Comments" htmlFor="ra-review" hint="Optional. Other residents will see your first name and flat.">
            <textarea id="ra-review" rows={3} maxLength={500} className="input" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  )
}

export default RequestActions
