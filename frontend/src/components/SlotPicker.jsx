import { useEffect, useRef } from 'react'
import { FiCalendar } from 'react-icons/fi'
import useApi from '../hooks/useApi'
import { ErrorState } from './ui'
import { CLOSED_REASON, dayLabel, dayParts, timeLabel } from '../utils/services'

/**
 * Pick a day, then a free time slot, for one vendor.
 *   value:    { date, startTime }
 *   onChange: ({ date, startTime, slot }) => void   (startTime is '' until a slot is chosen)
 *   refreshKey: change it to reload slots (for example after "that slot was just taken")
 */
const SlotPicker = ({ providerId, value, onChange, refreshKey = 0 }) => {
  const days = useApi(`/services/providers/${providerId}/availability`, { params: { days: 14, k: refreshKey }, live: false, select: (d) => d.days || [] })
  const strip = useRef(null)

  // Land on the first day that has a free slot, unless the caller already chose one.
  useEffect(() => {
    if (!days.data || value.date) return
    const first = days.data.find((d) => !d.closed && d.free > 0)
    if (first) onChange({ date: first.date, startTime: '' })
  }, [days.data, value.date]) // eslint-disable-line react-hooks/exhaustive-deps

  const day = useApi(`/services/providers/${providerId}/slots`, { params: { date: value.date, k: refreshKey }, enabled: !!value.date, live: false })

  useEffect(() => {
    strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [value.date, days.data])

  if (days.error) return <ErrorState message={days.error} onRetry={days.reload} />

  const slots = day.data?.slots || []
  const anyOpen = (days.data || []).some((d) => !d.closed && d.free > 0)

  return (
    <div>
      <div ref={strip} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="group" aria-label="Choose a day">
        {days.loading
          ? Array.from({ length: 7 }).map((_, i) => <div key={i} className="skeleton h-[72px] w-16 shrink-0" />)
          : (days.data || []).map((d) => {
              const p = dayParts(d.date)
              const off = d.closed || d.free === 0
              const selected = value.date === d.date
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={off}
                  aria-pressed={selected}
                  onClick={() => onChange({ date: d.date, startTime: '' })}
                  className={`flex w-16 shrink-0 flex-col items-center rounded-lg border px-2 py-2 text-center transition-colors ${
                    selected ? 'border-brand bg-brand text-brand-ink' : off ? 'border-line bg-sunken text-muted opacity-60' : 'border-line bg-surface hover:border-brand'
                  }`}
                >
                  <span className="text-[11px] font-semibold uppercase">{p.weekday}</span>
                  <span className="font-display text-xl font-extrabold leading-tight">{p.day}</span>
                  <span className={`text-[10px] font-semibold ${selected ? 'text-brand-ink/90' : off ? '' : 'text-ok'}`}>{off ? (d.closed ? 'Off' : 'Full') : `${d.free} free`}</span>
                </button>
              )
            })}
      </div>

      {!days.loading && !anyOpen && (
        <p className="mt-2 rounded-md bg-sunken px-3 py-3 text-sm text-muted">This vendor has no free slots in the next two weeks. Check back soon or try another vendor.</p>
      )}

      {value.date && (
        <div className="mt-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <FiCalendar size={15} className="text-muted" /> {dayLabel(value.date)}
          </p>
          {day.loading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-10" />)}
            </div>
          ) : day.error ? (
            <ErrorState message={day.error} onRetry={day.reload} />
          ) : day.data?.closed ? (
            <p className="rounded-md bg-sunken px-3 py-3 text-sm text-muted">
              {CLOSED_REASON[day.data.reason] || 'Not available'}
              {day.data.note ? `: ${day.data.note}` : ''}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Choose a time">
              {slots.map((s) => {
                const selected = value.startTime === s.start
                return (
                  <button
                    key={s.start}
                    type="button"
                    disabled={!s.available}
                    aria-pressed={selected}
                    title={s.available ? undefined : s.reason === 'booked' ? 'Already booked' : 'Too soon to book'}
                    onClick={() => onChange({ date: value.date, startTime: s.start, slot: s })}
                    className={`min-h-[40px] rounded-md border px-2 text-sm font-semibold transition-colors ${
                      selected
                        ? 'border-brand bg-brand text-brand-ink'
                        : s.available
                          ? 'border-line bg-surface hover:border-brand'
                          : 'cursor-not-allowed border-line bg-sunken text-muted line-through opacity-60'
                    }`}
                  >
                    {timeLabel(s.start)}
                  </button>
                )
              })}
            </div>
          )}
          {!day.loading && !day.data?.closed && slots.some((s) => !s.available) && (
            <p className="mt-2 text-xs text-muted">Crossed-out times are already booked or too soon.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default SlotPicker
