import { FiAlertTriangle, FiCheckCircle, FiClock, FiHome, FiPhone, FiShield, FiTruck, FiUsers } from 'react-icons/fi'
import { Avatar, StatusTag, formatDate, titleCase } from './ui'
import { passCode } from '../utils/pass'
import { ROLE_NAME, clock, clockWithDay, flatText, floorOf, isOverdue, minutesOver, overText } from '../utils/gate'

const Fact = ({ icon: Icon, label, children }) => (
  <div className="flex gap-3">
    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon size={15} /></span>
    <div className="min-w-0">
      <p className="caption">{label}</p>
      <div className="text-sm font-semibold">{children}</div>
    </div>
  </div>
)

/**
 * Everything the guard needs after a scan: who the visitor is, which flat and floor, who let them in,
 * and (once they are inside) when they should be out.
 */
const VisitorCard = ({ visitor: v, actions }) => {
  const floor = v.floor || floorOf(v.flatNo)
  const host = v.residentId
  const approver = v.approvedBy
  const over = isOverdue(v)
  const approverIsHost = approver && host && String(approver._id || approver) === String(host._id || host)

  return (
    <div className="fade-in overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-3 bg-brand-soft/60 px-5 py-4">
        <Avatar name={v.name} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-extrabold">{v.name}</p>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
            <span className="inline-flex items-center gap-1"><FiPhone size={12} /> {v.phone}</span>
            {passCode(v) && <span className="font-mono text-xs tracking-widest">{passCode(v)}</span>}
          </p>
        </div>
        <StatusTag status={v.status} />
      </div>

      {over && (
        <p role="alert" className="flex items-center gap-2 bg-danger-soft px-5 py-2.5 text-sm font-semibold text-danger">
          <FiAlertTriangle size={15} /> {`Past exit time · ${overText(minutesOver(v))} · Expected out by ${clock(v.expectedExit)}`}
        </p>
      )}

      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <Fact icon={FiHome} label="Going to">
          {`Flat ${flatText(v)}`}
          <span className="block font-normal text-muted">{floor ? `${floor} · by flat number` : 'Floor not known'}</span>
        </Fact>
        <Fact icon={FiUsers} label="Resident">
          {host?.name || 'Not known'}
          {host?.phone && <span className="block font-normal text-muted">{host.phone}</span>}
        </Fact>
        <Fact icon={FiShield} label="Approved by">
          {v.approved ? (approverIsHost ? `${approver?.name || host?.name} · Resident` : [approver?.name || 'Society office', approver?.role && (ROLE_NAME[approver.role] || titleCase(approver.role))].filter(Boolean).join(' · ')) : 'Not approved yet'}
          {v.approvedAt && <span className="block font-normal text-muted">{formatDate(v.approvedAt, true)}</span>}
        </Fact>
        <Fact icon={FiCheckCircle} label="Purpose">
          {titleCase(v.purpose)}
          <span className="block font-normal text-muted">{`${v.numberOfVisitors || 1} ${(v.numberOfVisitors || 1) === 1 ? 'person' : 'people'}`}{v.purposeDescription ? ` · ${v.purposeDescription}` : ''}</span>
        </Fact>
        {v.vehicleNumber && (
          <Fact icon={FiTruck} label="Vehicle"><span className="font-mono">{v.vehicleNumber}</span></Fact>
        )}
        {v.expectedArrival && v.status === 'approved' && (
          <Fact icon={FiClock} label="Expected at">{clockWithDay(v.expectedArrival)}</Fact>
        )}
        {v.entryTime && (
          <Fact icon={FiClock} label="Timing">
            {`In at ${clock(v.entryTime)}`}
            {v.checkInMethod && <span className="block font-normal text-muted">{v.checkInMethod === 'code' ? 'Let in with pass code' : 'Let in by the guard'}</span>}
            {v.exitTime ? <span className="block font-normal text-muted">{`Left at ${clock(v.exitTime)}${v.checkOutMethod === 'code' ? ' with pass code' : ''}`}</span> : v.expectedExit ? <span className={`block font-normal ${over ? 'text-danger' : 'text-muted'}`}>{`Expected out by ${clockWithDay(v.expectedExit)}`}</span> : null}
          </Fact>
        )}
      </div>

      {actions && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-sunken/50 px-5 py-3">{actions}</div>}
    </div>
  )
}

export default VisitorCard
