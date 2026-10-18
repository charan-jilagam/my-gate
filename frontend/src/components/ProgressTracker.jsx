import { FiCheck, FiX } from 'react-icons/fi'
import { formatDate } from './ui'

// The happy path of a service job, in order. A cancelled or declined job stops where it was and ends in a red step.
const FLOW = [
  { status: 'requested', label: 'Requested' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'on_the_way', label: 'On the way' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'completed', label: 'Completed' }
]
const END_LABEL = { cancelled: 'Cancelled', declined: 'Declined' }

/**
 * A Flipkart-style tracker: dots joined by a line, ticks for what is done, a pulsing dot for where the job is now,
 * greyed dots for what is still to come, and a progress bar underneath.
 * `history` is the request's statusHistory: [{ status, at, note }].
 */
const ProgressTracker = ({ status, history = [] }) => {
  const when = {}
  history.forEach((h) => {
    when[h.status] = h.at // the latest time each status was reached
  })
  const ended = END_LABEL[status]

  let steps
  if (ended) {
    const reached = FLOW.filter((s) => when[s.status])
    steps = [...reached.map((s) => ({ ...s, state: 'done', at: when[s.status] })), { status, label: ended, state: 'bad', at: when[status] }]
  } else {
    const current = Math.max(0, FLOW.findIndex((s) => s.status === status))
    steps = FLOW.map((s, i) => ({ ...s, at: when[s.status], state: status === 'completed' || i < current ? 'done' : i === current ? 'now' : 'todo' }))
  }

  // The bar runs from the first dot to the last one shown and fills up to the dot where the job is now,
  // so a cancelled job's red bar ends exactly at the red Cancelled dot.
  const now = steps.findIndex((s) => s.state === 'now' || s.state === 'bad')
  const at = status === 'completed' ? steps.length - 1 : Math.max(0, now)
  const percent = steps.length > 1 ? Math.round((at / (steps.length - 1)) * 100) : 100
  const barTone = ended ? 'bg-danger' : 'bg-ok'
  const inset = `${50 / steps.length}%` // half a step on each side: the centres of the first and last dots

  return (
    <div>
      <ol className="flex">
        {steps.map((s, i) => {
          const last = i === steps.length - 1
          const joined = !last && (steps[i + 1].state !== 'todo') // the line is filled when the next step has been reached
          return (
            <li key={s.status} className="relative flex min-w-0 flex-1 flex-col items-center px-0.5 text-center" aria-current={s.state === 'now' ? 'step' : undefined}>
              {!last && <span className={`absolute left-1/2 top-[13px] h-0.5 w-full ${joined ? (steps[i + 1].state === 'bad' ? 'bg-danger' : 'bg-ok') : 'bg-line'}`} aria-hidden="true" />}
              <span className="relative z-10 grid h-7 w-7 place-items-center">
                {s.state === 'now' && <span className="absolute inline-flex h-7 w-7 animate-ping rounded-full bg-amber/40" aria-hidden="true" />}
                <span
                  className={`relative grid h-7 w-7 place-items-center rounded-full border-2 ${
                    s.state === 'done' ? 'border-ok bg-ok text-white' : s.state === 'bad' ? 'border-danger bg-danger text-white' : s.state === 'now' ? 'border-amber bg-amber' : 'border-line bg-surface'
                  }`}
                >
                  {s.state === 'done' && <FiCheck size={14} strokeWidth={3} />}
                  {s.state === 'bad' && <FiX size={14} strokeWidth={3} />}
                  {s.state === 'now' && <span className="h-2.5 w-2.5 rounded-full bg-[#1b1400]" />}
                </span>
              </span>
              <span className={`mt-2 text-[11px] font-semibold leading-tight sm:text-xs ${s.state === 'todo' ? 'text-muted' : s.state === 'bad' ? 'text-danger' : s.state === 'now' ? 'text-ink' : 'text-ink'}`}>{s.label}</span>
              {s.at && s.state !== 'todo' && <span className="mt-0.5 hidden text-[10px] leading-tight text-muted sm:block">{formatDate(s.at, true)}</span>}
            </li>
          )
        })}
      </ol>
      <div className="mt-5" style={{ marginLeft: inset, marginRight: inset }}>
        <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className={`h-full rounded-full ${barTone} transition-all duration-700 ease-out`} style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  )
}

export default ProgressTracker
