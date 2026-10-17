import { Link } from 'react-router-dom'
import { FiChevronRight, FiClock } from 'react-icons/fi'
import { StatusTag } from './ui'
import { STATUS_LABEL, categoryIcon, dayLabel, timeLabel } from '../utils/services'

/** One service request as a tappable row. `viewer` decides whose name to show underneath. */
const RequestCard = ({ request: r, children }) => {
  const Icon = categoryIcon(r.category)
  const who = r.viewerRole === 'resident' ? r.provider?.name : `${r.resident?.name || 'Resident'}${r.flat ? ` · ${r.flat}` : ''}`
  return (
    <li className="panel">
      <Link to={`/services/requests/${r._id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-sunken/60">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Icon size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold">{r.title}</span>
            {r.urgency === 'urgent' && <span className="tag-danger">Urgent</span>}
          </span>
          <span className="block truncate text-sm text-muted">
            {r.categoryLabel}
            {who ? ` · ${who}` : ''}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <FiClock size={12} /> {dayLabel(r.date)}, {timeLabel(r.startTime)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <StatusTag status={r.status} label={STATUS_LABEL[r.status]} />
          <FiChevronRight className="text-muted" aria-hidden="true" />
        </span>
      </Link>
      {children && <div className="border-t border-line px-4 py-3">{children}</div>}
    </li>
  )
}

export default RequestCard
