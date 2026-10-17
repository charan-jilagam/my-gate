import { Link, useParams } from 'react-router-dom'
import { FiArrowLeft, FiCheck, FiClock, FiMapPin, FiPhone, FiShield } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import useApi from '../hooks/useApi'
import RequestActions from '../components/RequestActions'
import { Avatar, ErrorState, ListSkeleton, StatusTag, Stars, formatDate } from '../components/ui'
import { STATUS_LABEL, categoryIcon, dayLabel, rupees, slotLabel } from '../utils/services'
import { imgSrc } from '../utils/media'

const Person = ({ label, person, extra }) => (
  <div className="flex items-center gap-3">
    <Avatar name={person?.name || '?'} src={person?.photo} size={44} />
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted">{label}</p>
      <p className="truncate font-semibold">{person?.name || '-'}</p>
      {extra && <p className="truncate text-xs text-muted">{extra}</p>}
    </div>
    {person?.phone && (
      <a href={`tel:${person.phone}`} className="btn-secondary btn-sm shrink-0" aria-label={`Call ${person.name}`}>
        <FiPhone size={14} /> Call
      </a>
    )}
  </div>
)

const ServiceRequestDetail = () => {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: r, loading, error, reload } = useApi(`/service-requests/${id}`, { select: (d) => d.request })

  const backTo = user?.role === 'vendor' ? '/work' : ['society_admin', 'super_admin'].includes(user?.role) ? '/admin/services' : '/services/requests'

  if (loading) return <div className="panel"><ListSkeleton rows={5} /></div>
  if (error || !r) return <div className="panel"><ErrorState message={error || 'We could not find this request.'} onRetry={reload} /></div>

  const Icon = categoryIcon(r.category)
  const isResident = r.viewerRole === 'resident'
  const isVendor = r.viewerRole === 'provider'

  return (
    <>
      <Link to={backTo} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <FiArrowLeft size={15} /> Back
      </Link>

      <div className="mb-5 flex flex-wrap items-start gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Icon size={30} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag status={r.status} label={STATUS_LABEL[r.status]} />
            {r.urgency === 'urgent' && <span className="tag-danger">Urgent</span>}
            <span className="tag-neutral">{r.categoryLabel}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{r.title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <FiClock size={14} /> {dayLabel(r.date)}, {slotLabel(r.startTime, r.endTime)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          {/* Start code: the resident reads it out when the vendor arrives */}
          {isResident && r.startOtp && (
            <section className="panel border-2 border-brand bg-brand-soft p-5 text-center" aria-labelledby="otp-h">
              <p id="otp-h" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-brand">
                <FiShield size={15} /> Your start code
              </p>
              <p className="my-2 font-display text-5xl font-extrabold tracking-[0.35em] text-ink" aria-label={`Start code ${r.startOtp.split('').join(' ')}`}>
                {r.startOtp}
              </p>
              <p className="text-sm text-muted">Tell this to {r.provider.name?.split(' ')[0] || 'the vendor'} when they arrive. Do not share it before then.</p>
            </section>
          )}

          <section className="panel" aria-labelledby="job-h">
            <h2 id="job-h" className="border-b border-line px-5 py-3.5 text-base font-bold">The job</h2>
            <div className="space-y-4 px-5 py-4 text-sm">
              {r.description ? <p className="whitespace-pre-line leading-relaxed">{r.description}</p> : <p className="text-muted">No extra details were added.</p>}
              {r.images?.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {r.images.map((img) => (
                    <li key={img.url}>
                      <a href={imgSrc(img.url)} target="_blank" rel="noreferrer">
                        <img src={imgSrc(img.url)} alt={img.name || 'Photo of the problem'} className="h-24 w-24 rounded-md object-cover ring-1 ring-line" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <p className="flex items-center gap-1.5 text-muted">
                <FiMapPin size={14} /> Flat {r.flat}
              </p>
            </div>
          </section>

          {r.status === 'completed' && (
            <section className="panel" aria-labelledby="done-h">
              <h2 id="done-h" className="border-b border-line px-5 py-3.5 text-base font-bold">Completed</h2>
              <dl className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">Amount</dt>
                  <dd className="font-display text-xl font-extrabold">{rupees(r.finalAmount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Payment</dt>
                  <dd className="font-semibold">
                    {r.paymentStatus === 'paid' ? `Paid by ${r.paymentMethod}${r.paidAt ? ` on ${formatDate(r.paidAt)}` : ''}` : 'To be paid to the vendor'}
                  </dd>
                </div>
                {r.workSummary && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted">Work done</dt>
                    <dd>{r.workSummary}</dd>
                  </div>
                )}
                {r.rating && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted">Rating</dt>
                    <dd>
                      <Stars value={r.rating} />
                      {r.review && <p className="mt-1">{r.review}</p>}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {['cancelled', 'declined'].includes(r.status) && (
            <section className="panel border-danger/40 bg-danger-soft p-5 text-sm">
              <p className="font-semibold text-danger">{r.status === 'declined' ? 'The vendor could not take this job' : `Cancelled by ${r.cancelledBy === 'provider' ? 'the vendor' : r.cancelledBy === 'admin' ? 'the society office' : 'the resident'}`}</p>
              {(r.declineReason || r.cancelReason) && <p className="mt-1">{r.declineReason || r.cancelReason}</p>}
            </section>
          )}

          <section className="panel" aria-labelledby="tl-h">
            <h2 id="tl-h" className="border-b border-line px-5 py-3.5 text-base font-bold">Progress</h2>
            <ol className="px-5 py-4">
              {r.statusHistory.map((h, i) => (
                <li key={`${h.status}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < r.statusHistory.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-line" aria-hidden="true" />}
                  <span className="relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
                    <FiCheck size={13} />
                  </span>
                  <div className="text-sm">
                    <p className="font-semibold">{STATUS_LABEL[h.status] || h.status}</p>
                    {h.note && <p className="text-muted">{h.note}</p>}
                    <p className="text-xs text-muted">{formatDate(h.at, true)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-6 self-start">
          <section className="panel space-y-4 p-5" aria-label="People">
            {isVendor ? (
              <Person label="Resident" person={r.resident} extra={`Flat ${r.flat}`} />
            ) : (
              <>
                <Person label="Vendor" person={r.provider} />
                {r.viewerRole === 'admin' && <Person label="Resident" person={r.resident} extra={`Flat ${r.flat}`} />}
              </>
            )}
            {isVendor && !r.resident.phone && <p className="rounded-md bg-sunken px-3 py-2 text-xs text-muted">The resident's number appears once you accept the job.</p>}
            {isResident && !r.provider.phone && <p className="rounded-md bg-sunken px-3 py-2 text-xs text-muted">The vendor's number appears once they confirm.</p>}
            {r.provider.profileId && !isVendor && (
              <Link to={`/services/providers/${r.provider.profileId}`} className="text-sm font-semibold text-brand hover:underline">
                View vendor profile
              </Link>
            )}
          </section>

          <section className="panel p-5" aria-label="Actions">
            <h2 className="mb-3 text-base font-bold">{r.status === 'requested' && isResident ? 'Waiting for the vendor' : 'What next?'}</h2>
            {r.status === 'requested' && isResident && <p className="mb-3 text-sm text-muted">You will be notified as soon as they confirm. You can change the time or cancel until then.</p>}
            {r.status === 'in_progress' && isResident && <p className="mb-3 text-sm text-muted">Work is under way. The vendor will mark it complete and enter the amount.</p>}
            <RequestActions request={r} onDone={reload} />
            {!Object.values(r.actions || {}).some(Boolean) && <p className="text-sm text-muted">Nothing needs doing right now.</p>}
          </section>

          {r.visitCharge > 0 && r.status !== 'completed' && (
            <p className="rounded-md bg-sunken px-3 py-2 text-xs text-muted">Visit charge {rupees(r.visitCharge)}. Parts and extra work are agreed with the vendor and paid to them directly.</p>
          )}
        </div>
      </div>
    </>
  )
}

export default ServiceRequestDetail
