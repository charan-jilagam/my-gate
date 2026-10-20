import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiArrowLeft, FiCalendar, FiCheck, FiEdit2, FiHome, FiMapPin, FiTrash2, FiUser, FiUsers } from 'react-icons/fi'
import api from '../services/api'
import useApi from '../hooks/useApi'
import OccasionCover from '../components/OccasionCover'
import OccasionForm from '../components/OccasionForm'
import PhotoViewer from '../components/PhotoViewer'
import { ConfirmDialog, ErrorState, ListSkeleton, errorMessage } from '../components/ui'
import { imgSrc } from '../utils/media'
import { dateText, kindIcon, kindLabel } from '../utils/occasions'

const Fact = ({ icon: Icon, label, children }) => (
  <div className="flex items-start gap-3">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon size={16} /></span>
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm font-semibold">{children}</p>
    </div>
  </div>
)

const OccasionDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi(`/occasions/${id}`)
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)

  const o = data?.occasion
  const Icon = kindIcon(o?.kind)

  const remove = async () => {
    setBusy(true)
    try {
      await api.delete(`/occasions/${id}`)
      toast.success('Occasion removed')
      navigate('/occasions', { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
      setBusy(false)
    }
  }

  const back = (
    <Link to="/occasions" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
      <FiArrowLeft size={15} /> All occasions
    </Link>
  )

  if (loading) return <>{back}<div className="panel"><ListSkeleton rows={4} /></div></>
  if (error || !o) return <>{back}<div className="panel"><ErrorState message={error || 'This occasion could not be found.'} onRetry={reload} /></div></>

  const photos = o.photos || []
  // The cover is shown big at the top, so the gallery below starts after it.
  const gallery = photos.slice(1)

  return (
    <>
      {back}

      <header className="mb-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <button
          type="button"
          onClick={() => photos.length && setViewing(0)}
          disabled={!photos.length}
          aria-label={photos.length ? `Open photos of ${o.title}` : undefined}
          className="relative block aspect-[16/9] w-full overflow-hidden bg-sunken sm:aspect-[21/9]"
        >
          <OccasionCover src={o.cover} kind={o.kind} alt={o.title} eager className="absolute inset-0 h-full w-full" iconSize={64} />
        </button>
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand"><Icon size={12} /> {kindLabel(o.kind)}</p>
              <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">{o.title}</h1>
            </div>
            {data.canChange && (
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}><FiEdit2 size={14} /> Edit</button>
                <button className="btn-ghost btn-sm text-danger" onClick={() => setRemoving(true)}><FiTrash2 size={14} /> Remove</button>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact icon={FiCalendar} label={o.endDate && o.endDate !== o.date ? 'Dates' : 'Date'}>{dateText(o.date, o.endDate)}</Fact>
            {o.venue && <Fact icon={FiMapPin} label="Venue">{o.venue}</Fact>}
            {o.hostedBy && <Fact icon={FiHome} label="Organised by">{o.hostedBy}</Fact>}
            {o.attendees ? <Fact icon={FiUsers} label="People who came">{o.attendees}</Fact> : null}
          </div>

          {o.description && <p className="mt-6 max-w-prose whitespace-pre-line text-[15px] leading-relaxed">{o.description}</p>}

          {o.highlights?.length > 0 && (
            <section className="mt-6" aria-labelledby="hl-h">
              <h2 id="hl-h" className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Highlights</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {o.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2.5 rounded-lg bg-sunken/70 px-3.5 py-2.5 text-sm">
                    <FiCheck size={16} className="mt-0.5 shrink-0 text-brand" /> <span>{h}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {o.createdBy?.name && (
            <p className="mt-6 flex items-center gap-1.5 text-xs text-muted"><FiUser size={12} /> {`Added by ${o.createdBy.name}`}</p>
          )}
        </div>
      </header>

      {gallery.length > 0 && (
        <section aria-labelledby="ph-h">
          <h2 id="ph-h" className="mb-3 font-display text-xl font-bold">{`Photos (${photos.length})`}</h2>
          <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>li]:mb-3">
            {gallery.map((p, i) => (
              <li key={p.url} className="break-inside-avoid">
                <button type="button" onClick={() => setViewing(i + 1)} className="group block w-full overflow-hidden rounded-lg bg-sunken text-left" aria-label={p.caption ? `Open photo: ${p.caption}` : `Open photo ${i + 2}`}>
                  <img src={imgSrc(p.url)} alt={p.caption || `Photo ${i + 2}`} loading="lazy" decoding="async" className="w-full transition-transform duration-500 group-hover:scale-[1.03]" />
                </button>
                {p.caption && <p className="mt-1.5 px-0.5 text-xs text-muted">{p.caption}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PhotoViewer photos={photos} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />

      {editing && <OccasionForm open occasion={o} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload() }} />}

      <ConfirmDialog open={removing} danger title="Remove this occasion?" text={`${o.title} and its ${photos.length} photo${photos.length === 1 ? '' : 's'} will be removed for everyone.`} confirmLabel="Remove" busy={busy} onClose={() => setRemoving(false)} onConfirm={remove} />
    </>
  )
}

export default OccasionDetail
