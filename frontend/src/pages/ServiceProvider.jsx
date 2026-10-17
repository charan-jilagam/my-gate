import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FiArrowLeft, FiCheckCircle, FiClock, FiShield } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useCategories from '../hooks/useCategories'
import SlotPicker from '../components/SlotPicker'
import ImageUpload from '../components/ImageUpload'
import { Avatar, ErrorState, Field, ListSkeleton, Spinner, Stars, errorMessage, formatDate } from '../components/ui'
import { dayLabel, rupees, slotLabel, timeLabel } from '../utils/services'

const EMPTY_FORM = { title: '', description: '', urgency: 'normal', images: [] }

const ServiceProvider = () => {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { isResident } = useAuth()
  const { labelOf } = useCategories()
  const { data, loading, error, reload } = useApi(`/services/providers/${id}`, { live: false })

  const [category, setCategory] = useState(params.get('category') || '')
  const [slot, setSlot] = useState({ date: '', startTime: '' })
  const [form, setForm] = useState(EMPTY_FORM)
  const [refresh, setRefresh] = useState(0)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')

  const provider = data?.provider
  // Default to the trade the resident browsed from, or the vendor's first.
  useEffect(() => {
    if (provider && !provider.categories.includes(category)) setCategory(provider.categories[0])
  }, [provider]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="panel"><ListSkeleton rows={5} /></div>
  if (error || !provider) return <div className="panel"><ErrorState message={error || 'This vendor is not available.'} onRetry={reload} /></div>

  const chosen = slot.startTime && slot.slot
  const ready = isResident && provider.acceptingJobs

  const submit = async (e) => {
    e.preventDefault()
    setProblem('')
    if (!slot.date || !slot.startTime) return setProblem('Pick a day and a time first.')
    if (form.title.trim().length < 3) return setProblem('Say briefly what needs doing, for example "Leaking kitchen tap".')

    setSaving(true)
    try {
      const { data: res } = await api.post('/service-requests', {
        providerId: provider._id,
        category,
        date: slot.date,
        startTime: slot.startTime,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        urgency: form.urgency,
        images: form.images
      })
      toast.success(res.message || 'Booked')
      navigate(`/services/requests/${res.request._id}`, { replace: true })
    } catch (err) {
      const message = errorMessage(err)
      setProblem(message)
      toast.error(message)
      // The slot may have just been taken: refresh what is free and ask for a new choice.
      setSlot((s) => ({ ...s, startTime: '' }))
      setRefresh((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Link to={`/services${category ? `?category=${category}` : ''}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <FiArrowLeft size={15} /> All vendors
      </Link>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        {/* Who they are */}
        <div className="space-y-6">
          <section className="panel p-5">
            <div className="flex gap-4">
              <Avatar name={provider.name} src={provider.photo} size={64} />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold">{provider.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <Stars value={provider.rating.avg} count={provider.rating.count} />
                  {provider.jobsCompleted > 0 && <span>{provider.jobsCompleted} jobs done</span>}
                </div>
                {provider.isVerified && (
                  <span className="tag-ok mt-2">
                    <FiShield size={12} /> Verified by your society office
                  </span>
                )}
              </div>
            </div>
            {provider.bio && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{provider.bio}</p>}
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              <div>
                <dt className="text-xs text-muted">Visit charge</dt>
                <dd className="font-semibold">{provider.visitCharge ? rupees(provider.visitCharge) : 'None'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Experience</dt>
                <dd className="font-semibold">{provider.experienceYears ? `${provider.experienceYears} years` : 'Not stated'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted">Does</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {provider.categories.map((c) => <span key={c} className="tag-neutral">{labelOf(c)}</span>)}
                </dd>
              </div>
            </dl>
            {provider.priceNote && <p className="mt-3 rounded-md bg-sunken px-3 py-2 text-xs text-muted">{provider.priceNote}</p>}
          </section>

          <section className="panel" aria-labelledby="rev-h">
            <h2 id="rev-h" className="border-b border-line px-5 py-3.5 text-base font-bold">Reviews from neighbours</h2>
            {data.reviews.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No reviews yet. Be the first after your visit.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.reviews.map((r, i) => (
                  <li key={i} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <Stars value={r.rating} />
                      <span className="text-xs text-muted">{formatDate(r.reviewedAt)}</span>
                    </div>
                    {r.review && <p className="mt-1 text-sm">{r.review}</p>}
                    <p className="mt-1 text-xs text-muted">{r.by} · {r.categoryLabel}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Book */}
        <form onSubmit={submit} className="space-y-5 self-start">
          <section className="panel p-5">
            <h2 className="mb-1 text-base font-bold">1. Choose a time</h2>
            {!provider.acceptingJobs ? (
              <p className="rounded-md bg-sunken px-3 py-3 text-sm text-muted">{provider.name.split(' ')[0]} is not taking bookings right now. Please check again later or pick another vendor.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">
                  Slots are {provider.slotMinutes} minutes. {provider.autoAccept ? 'Bookings are confirmed instantly.' : 'The vendor confirms each booking, usually within a few hours.'}
                </p>
                <SlotPicker providerId={provider._id} value={slot} onChange={setSlot} refreshKey={refresh} />
              </>
            )}
          </section>

          {ready && (
            <section className="panel space-y-4 p-5">
              <h2 className="text-base font-bold">2. Tell {provider.name.split(' ')[0]} what is wrong</h2>

              {provider.categories.length > 1 && (
                <Field label="Service" htmlFor="bk-cat">
                  <select id="bk-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {provider.categories.map((c) => <option key={c} value={c}>{labelOf(c)}</option>)}
                  </select>
                </Field>
              )}
              <Field label="What needs doing?" htmlFor="bk-title">
                <input id="bk-title" className="input" maxLength={100} placeholder="For example: Kitchen tap is leaking" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label="More details" htmlFor="bk-desc" hint="Optional. Anything that helps them bring the right parts.">
                <textarea id="bk-desc" rows={3} maxLength={1000} className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <Field label="Photos" hint="Optional. A picture of the problem saves a trip.">
                <ImageUpload value={form.images} onChange={(images) => setForm({ ...form, images })} max={4} />
              </Field>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3">
                <input type="checkbox" className="mt-1" checked={form.urgency === 'urgent'} onChange={(e) => setForm({ ...form, urgency: e.target.checked ? 'urgent' : 'normal' })} />
                <span>
                  <span className="block text-sm font-semibold">This is urgent</span>
                  <span className="block text-xs text-muted">Flags the request and sends the vendor a text message. Use it for leaks, sparks and lockouts.</span>
                </span>
              </label>
            </section>
          )}

          {ready && (
            <div className="panel sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-between gap-3 p-4 lg:bottom-4">
              <div className="min-w-0 text-sm">
                {chosen ? (
                  <>
                    <p className="flex items-center gap-1.5 font-semibold">
                      <FiClock size={15} /> {dayLabel(slot.date)}, {slotLabel(slot.slot.start, slot.slot.end)}
                    </p>
                    <p className="text-xs text-muted">{provider.visitCharge ? `${rupees(provider.visitCharge)} visit charge, paid to the vendor` : 'No visit charge'}</p>
                  </>
                ) : (
                  <p className="text-muted">Pick a day and time to continue.</p>
                )}
                {problem && <p role="alert" className="mt-1 text-sm font-medium text-danger">{problem}</p>}
              </div>
              <button type="submit" className="btn-primary" disabled={saving || !chosen}>
                {saving ? <Spinner className="h-4 w-4" /> : <FiCheckCircle size={16} />}
                {provider.autoAccept ? 'Book now' : 'Send request'}
              </button>
            </div>
          )}

          {!isResident && <p className="rounded-md bg-sunken px-3 py-3 text-sm text-muted">Only residents can book. You are viewing this profile as an admin.</p>}
        </form>
      </div>
    </>
  )
}

export default ServiceProvider
