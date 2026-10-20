import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiImage, FiPlus, FiStar, FiTrash2, FiX } from 'react-icons/fi'
import api from '../services/api'
import { imgSrc } from '../utils/media'
import { KINDS } from '../utils/occasions'
import { uploadImage } from './ImageUpload'
import { Field, Modal, Spinner, errorMessage } from './ui'

const MAX_PHOTOS = 24
const MAX_HIGHLIGHTS = 8
const today = () => new Date().toISOString().slice(0, 10)

const blank = () => ({ title: '', kind: 'celebration', date: today(), endDate: '', venue: '', hostedBy: '', attendees: '', description: '', highlights: [''], photos: [], notify: true })
const fromOccasion = (o) => ({
  title: o.title || '',
  kind: o.kind || 'celebration',
  date: o.date || today(),
  endDate: o.endDate || '',
  venue: o.venue || '',
  hostedBy: o.hostedBy || '',
  attendees: o.attendees ?? '',
  description: o.description || '',
  highlights: o.highlights?.length ? o.highlights : [''],
  photos: (o.photos || []).map((p) => ({ url: p.url, caption: p.caption || '' })),
  notify: false
})

/**
 * Add or edit an occasion: its details, a few highlights and up to 24 photos.
 * The first photo is the cover. Pass `occasion` to edit, `societyParams` for a platform admin choosing a society.
 */
const OccasionForm = ({ open, occasion, societyParams = {}, onClose, onSaved }) => {
  const [f, setF] = useState(() => (occasion ? fromOccasion(occasion) : blank()))
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(null) // { done, total }
  const [error, setError] = useState('')
  const input = useRef(null)
  const editing = !!occasion

  if (!open) return null
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }))

  const pick = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS - f.photos.length)
    e.target.value = ''
    if (!files.length) return
    const added = []
    setUploading({ done: 0, total: files.length })
    for (const file of files) {
      try {
        const { url } = await uploadImage(file)
        added.push({ url, caption: '' })
      } catch (err) {
        toast.error(errorMessage(err, 'Could not upload one of the photos.'))
      }
      setUploading((u) => (u ? { ...u, done: u.done + 1 } : u))
    }
    setUploading(null)
    if (added.length) setF((cur) => ({ ...cur, photos: [...cur.photos, ...added].slice(0, MAX_PHOTOS) }))
  }

  const setCaption = (i, caption) => set({ photos: f.photos.map((p, j) => (j === i ? { ...p, caption } : p)) })
  const makeCover = (i) => set({ photos: [f.photos[i], ...f.photos.filter((_, j) => j !== i)] })
  const removePhoto = (i) => set({ photos: f.photos.filter((_, j) => j !== i) })
  const setHighlight = (i, v) => set({ highlights: f.highlights.map((h, j) => (j === i ? v : h)) })

  const save = async (e) => {
    e.preventDefault()
    setError('')
    if (f.title.trim().length < 2) return setError('Give the occasion a name.')
    if (!f.date) return setError('Choose the date of the occasion.')
    if (f.endDate && f.endDate < f.date) return setError('The last day cannot be before the first day.')
    if (uploading) return setError('Wait for the photos to finish uploading.')
    const payload = {
      title: f.title.trim(),
      kind: f.kind,
      date: f.date,
      endDate: f.endDate || null,
      venue: f.venue.trim(),
      hostedBy: f.hostedBy.trim(),
      attendees: f.attendees === '' ? null : Number(f.attendees),
      description: f.description.trim(),
      highlights: f.highlights.map((h) => h.trim()).filter(Boolean),
      photos: f.photos.map((p) => ({ url: p.url, caption: p.caption.trim() }))
    }
    setBusy(true)
    try {
      const res = editing
        ? await api.put(`/occasions/${occasion._id}`, payload)
        : await api.post('/occasions', { ...payload, notify: f.notify }, { params: societyParams })
      toast.success(editing ? 'Occasion saved' : 'Occasion added')
      onSaved?.(res.data.occasion)
    } catch (err) {
      setError(errorMessage(err, 'Could not save the occasion.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit occasion' : 'Add an occasion'}
      size="xl"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="occasion-form" className="btn-primary" disabled={busy || !!uploading}>
            {busy && <Spinner className="h-4 w-4" />} {editing ? 'Save changes' : 'Publish'}
          </button>
        </>
      }
    >
      <form id="occasion-form" onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field label="Name of the occasion" htmlFor="oc-title">
            <input id="oc-title" className="input" maxLength={120} placeholder="Diwali night on the clubhouse lawn" value={f.title} onChange={(e) => set({ title: e.target.value })} required />
          </Field>
          <Field label="Type" htmlFor="oc-kind">
            <select id="oc-kind" className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
              {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="oc-date">
            <input id="oc-date" type="date" className="input" value={f.date} onChange={(e) => set({ date: e.target.value })} required />
          </Field>
          <Field label="Last day" htmlFor="oc-end" hint="Only for events over several days">
            <input id="oc-end" type="date" className="input" min={f.date} value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Venue" htmlFor="oc-venue">
            <input id="oc-venue" className="input" maxLength={120} placeholder="Clubhouse lawn" value={f.venue} onChange={(e) => set({ venue: e.target.value })} />
          </Field>
          <Field label="Organised by" htmlFor="oc-host">
            <input id="oc-host" className="input" maxLength={120} placeholder="Cultural committee" value={f.hostedBy} onChange={(e) => set({ hostedBy: e.target.value })} />
          </Field>
          <Field label="People who came" htmlFor="oc-att" hint="Roughly is fine">
            <input id="oc-att" type="number" inputMode="numeric" min="0" max="100000" className="input" value={f.attendees} onChange={(e) => set({ attendees: e.target.value })} />
          </Field>
        </div>

        <Field label="About it" htmlFor="oc-desc" hint="What happened, who took part, what people enjoyed">
          <textarea id="oc-desc" rows={4} maxLength={2000} className="input" value={f.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>

        <div>
          <p className="label">Highlights</p>
          <div className="space-y-2">
            {f.highlights.map((h, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" maxLength={140} aria-label={`Highlight ${i + 1}`} placeholder={i === 0 ? 'Rangoli contest won by Block B' : ''} value={h} onChange={(e) => setHighlight(i, e.target.value)} />
                {f.highlights.length > 1 && (
                  <button type="button" className="btn-ghost px-2" aria-label={`Remove highlight ${i + 1}`} onClick={() => set({ highlights: f.highlights.filter((_, j) => j !== i) })}>
                    <FiX size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {f.highlights.length < MAX_HIGHLIGHTS && (
            <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => set({ highlights: [...f.highlights, ''] })}>
              <FiPlus size={14} /> Add a highlight
            </button>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="label mb-0">Photos</p>
            <span className="text-xs text-muted">{`${f.photos.length} of ${MAX_PHOTOS}. The first photo is the cover.`}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {f.photos.map((p, i) => (
              <figure key={p.url} className="overflow-hidden rounded-lg border border-line bg-surface">
                <div className="relative aspect-[4/3] bg-sunken">
                  <img src={imgSrc(p.url)} alt={p.caption || `Photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                  {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-ink">Cover</span>}
                  <div className="absolute right-1.5 top-1.5 flex gap-1">
                    {i !== 0 && (
                      <button type="button" aria-label="Make this the cover" title="Make cover" onClick={() => makeCover(i)} className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
                        <FiStar size={13} />
                      </button>
                    )}
                    <button type="button" aria-label="Remove photo" onClick={() => removePhoto(i)} className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                </div>
                <input className="w-full border-0 border-t border-line bg-transparent px-2.5 py-2 text-xs outline-none focus:bg-sunken/50" maxLength={140} placeholder="Add a caption" aria-label={`Caption for photo ${i + 1}`} value={p.caption} onChange={(e) => setCaption(i, e.target.value)} />
              </figure>
            ))}
            {f.photos.length < MAX_PHOTOS && (
              <button type="button" onClick={() => input.current?.click()} disabled={!!uploading} className="grid aspect-[4/3] place-items-center rounded-lg border-2 border-dashed border-edge text-sm font-semibold text-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-60">
                <span className="flex flex-col items-center gap-1.5">
                  {uploading ? <Spinner className="h-5 w-5" /> : <FiImage size={22} />}
                  {uploading ? `Uploading ${Math.min(uploading.done + 1, uploading.total)} of ${uploading.total}` : 'Add photos'}
                </span>
              </button>
            )}
          </div>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={pick} />
        </div>

        {!editing && (
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" checked={f.notify} onChange={(e) => set({ notify: e.target.checked })} />
            <span>Tell residents and staff about it</span>
          </label>
        )}

        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      </form>
    </Modal>
  )
}

export default OccasionForm
