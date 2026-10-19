import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FiMapPin, FiPlus, FiTrash2, FiEdit2, FiCrosshair } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import MapView from '../components/MapView'
import { EmptyState, ErrorState, ListSkeleton, Modal, PageHeader, Field, ConfirmDialog, Spinner, errorMessage } from '../components/ui'
import { getPosition } from '../utils/location'
import { timeLabel } from '../utils/services'

export const POST_KINDS = { main_gate: 'Main gate', tower_gate: 'Tower gate', patrol: 'Patrol', control_room: 'Control room', housekeeping: 'Housekeeping', garden: 'Garden', maintenance: 'Maintenance', other: 'Other' }
const blankSlot = (start = '06:00', end = '14:00') => ({ label: '', start, end, guards: 1 })

// Pick a point on the map, or use the phone's current position.
const PlacePicker = ({ value, onChange, center }) => {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const here = async () => {
    setBusy(true)
    try { onChange(await getPosition({ timeout: 15000 })) } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-2">
      <button type="button" className="btn-secondary w-full" onClick={here} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <FiCrosshair />} {t('Use my current location')}</button>
      <MapView height={240} pick={value} center={value || center} onPick={(p) => onChange(p)} />
      <p className="text-xs text-muted">{value ? t('Pin placed. Tap the map to move it.') : t('Tap the map to place the pin.')}</p>
    </div>
  )
}

const SocietyLocation = ({ info, reload }) => {
  const { t } = useT()
  const [pick, setPick] = useState(info?.location ? { lat: info.location.lat, lng: info.location.lng } : null)
  const [radius, setRadius] = useState(info?.location?.radiusMeters || 300)
  const [label, setLabel] = useState(info?.location?.label || '')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(!info?.location)
  const save = async () => {
    if (!pick) return toast.error(t('Place the pin first.'))
    setBusy(true)
    try { await api.put('/guards/location', { ...pick, radiusMeters: Number(radius), label }); toast.success(t('Society location saved')); setOpen(false); reload() } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <section className="panel mb-5 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><FiMapPin /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">{t('Society location')}</h2>
          <p className="text-sm text-muted">{info?.location ? `${info.location.label || info.name || ''} · ${t('guards are counted at post within')} ${info.location.radiusMeters} m` : t('Set where your society is, so we can tell if a guard is at the gate when they clock in.')}</p>
        </div>
        {!open && <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}><FiEdit2 size={14} /> {t('Change')}</button>}
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          <PlacePicker value={pick} onChange={setPick} />
          <Field label="Name of the place (optional)"><input className="input" maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Sunrise Apartments, main gate" /></Field>
          <Field label="How far from here is still “at the society”? (metres)" hint="300 is right for most societies.">
            <input className="input" type="number" inputMode="numeric" min={50} max={5000} value={radius} onChange={(e) => setRadius(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy} onClick={save}>{busy && <Spinner className="h-4 w-4" />} {t('Save location')}</button>
            {info?.location && <button className="btn-ghost" onClick={() => setOpen(false)}>{t('Cancel')}</button>}
          </div>
        </div>
      )}
    </section>
  )
}

const PostForm = ({ open, post, onClose, onSaved, center }) => {
  const { t } = useT()
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setF(post ? { name: post.name, kind: post.kind, slots: (post.slots || []).map((s) => ({ label: s.label || '', start: s.start, end: s.end, guards: s.guards })), pick: post.lat != null ? { lat: post.lat, lng: post.lng } : null, radiusMeters: post.radiusMeters || '', isActive: post.isActive !== false } : { name: '', kind: 'main_gate', slots: [blankSlot('06:00', '14:00'), blankSlot('14:00', '22:00'), blankSlot('22:00', '06:00')], pick: null, radiusMeters: '', isActive: true })
  }, [open, post])
  if (!f) return null
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const setSlot = (i, k, v) => set('slots', f.slots.map((s, j) => (j === i ? { ...s, [k]: v } : s)))
  const save = async () => {
    setBusy(true)
    const body = { name: f.name.trim(), kind: f.kind, slots: f.slots.map((s) => ({ ...s, guards: Number(s.guards) || 1 })), isActive: f.isActive, lat: f.pick ? f.pick.lat : null, lng: f.pick ? f.pick.lng : null, radiusMeters: f.radiusMeters ? Number(f.radiusMeters) : null }
    try {
      if (post) await api.put(`/guards/posts/${post._id}`, body)
      else await api.post('/guards/posts', body)
      toast.success(t('Post saved'))
      onSaved()
    } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={post ? 'Edit guard post' : 'Add a guard post'} size="lg"
      footer={<><button className="btn-ghost" onClick={onClose}>{t('Cancel')}</button><button className="btn-primary" disabled={busy || f.name.trim().length < 2} onClick={save}>{busy && <Spinner className="h-4 w-4" />} {t('Save post')}</button></>}>
      <div className="space-y-4">
        <Field label="Name of the place"><input className="input" value={f.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder="Main gate" /></Field>
        <Field label="Kind of place">
          <select className="input" value={f.kind} onChange={(e) => set('kind', e.target.value)}>{Object.entries(POST_KINDS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
        </Field>
        <div>
          <p className="label">{t('When are guards needed here?')}</p>
          <div className="space-y-3">
            {f.slots.map((s, i) => (
              <div key={i} className="rounded-lg bg-canvas p-3 ring-1 ring-edge">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="From"><input className="input" type="time" value={s.start} onChange={(e) => setSlot(i, 'start', e.target.value)} /></Field>
                  <Field label="To"><input className="input" type="time" value={s.end} onChange={(e) => setSlot(i, 'end', e.target.value)} /></Field>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <Field label="How many guards" className="w-28"><input className="input" type="number" inputMode="numeric" min={1} max={20} value={s.guards} onChange={(e) => setSlot(i, 'guards', e.target.value)} /></Field>
                  <Field label="Name (optional)" className="min-w-0 flex-1"><input className="input" value={s.label} maxLength={30} onChange={(e) => setSlot(i, 'label', e.target.value)} placeholder="Morning" /></Field>
                  <button className="btn-ghost text-danger" aria-label={t('Remove this time')} onClick={() => set('slots', f.slots.filter((_, j) => j !== i))}><FiTrash2 /></button>
                </div>
              </div>
            ))}
          </div>
          {f.slots.length < 6 && <button className="btn-secondary mt-3" onClick={() => set('slots', [...f.slots, blankSlot()])}><FiPlus /> {t('Add another time')}</button>}
          <p className="mt-2 text-xs text-muted">{t('A time that ends earlier than it starts (like 10 PM to 6 AM) means overnight.')}</p>
        </div>
        <details className="rounded-lg ring-1 ring-edge">
          <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">{t('Exact spot on the map (optional)')}</summary>
          <div className="space-y-3 p-3">
            <p className="text-xs text-muted">{t('If you skip this, the society location is used to check that guards are at work.')}</p>
            <PlacePicker value={f.pick} onChange={(p) => set('pick', p)} center={center} />
            <Field label="Allowed distance from this spot (metres)"><input className="input" type="number" inputMode="numeric" min={20} max={2000} value={f.radiusMeters} onChange={(e) => set('radiusMeters', e.target.value)} placeholder="100" /></Field>
          </div>
        </details>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} /> {t('Needs guards right now (untick to pause)')}</label>
      </div>
    </Modal>
  )
}

const GuardPosts = () => {
  const { t } = useT()
  const loc = useApi('/guards/location')
  const posts = useApi('/guards/posts')
  const [editing, setEditing] = useState(undefined) // undefined closed, null new, post edit
  const [removing, setRemoving] = useState(null)
  const list = posts.data?.posts || []
  const refresh = () => { loc.reload(); posts.reload() }
  const remove = async () => {
    try { await api.delete(`/guards/posts/${removing._id}`); toast.success(t('Post removed')); setRemoving(null); refresh() } catch (e) { toast.error(errorMessage(e)); setRemoving(null) }
  }
  return (
    <>
      <PageHeader title="Guard posts" subtitle="Tell us where guards are needed and when. The roster can then be planned automatically." action={<button className="btn-primary" onClick={() => setEditing(null)}><FiPlus /> {t('Add post')}</button>} />
      {loc.loading ? <div className="panel mb-5"><ListSkeleton rows={2} /></div> : loc.error ? <div className="panel mb-5"><ErrorState message={loc.error} onRetry={loc.reload} /></div> : <SocietyLocation key={loc.data?.location ? 'set' : 'unset'} info={loc.data} reload={refresh} />}
      {posts.loading ? <div className="panel"><ListSkeleton rows={3} /></div> : posts.error ? <div className="panel"><ErrorState message={posts.error} onRetry={posts.reload} /></div> : !list.length ? (
        <div className="panel"><EmptyState icon={FiMapPin} title="No guard posts yet" text="Add your main gate, towers and patrol rounds, with the hours guards are needed." action={<button className="btn-primary" onClick={() => setEditing(null)}><FiPlus /> {t('Add post')}</button>} /></div>
      ) : (
        <ul className="space-y-3">
          {list.map((p) => (
            <li key={p._id} className={`panel p-4 ${p.isActive === false ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name} {p.isActive === false && <span className="tag-neutral ml-1">{t('Paused')}</span>}</p>
                  <p className="text-xs text-muted">{t(POST_KINDS[p.kind] || 'Other')}{p.lat != null ? ` · ${t('pin set')}` : ''}</p>
                </div>
                <button className="btn-ghost btn-sm" aria-label={t('Edit')} onClick={() => setEditing(p)}><FiEdit2 /></button>
                <button className="btn-ghost btn-sm text-danger" aria-label={t('Remove')} onClick={() => setRemoving(p)}><FiTrash2 /></button>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {(p.slots || []).map((s, i) => <li key={i}>{timeLabel(s.start)} to {timeLabel(s.end)} · <b>{s.guards}</b> {s.guards === 1 ? t('guard') : t('guards')}{s.label ? ` · ${s.label}` : ''}</li>)}
                {!(p.slots || []).length && <li className="text-muted">{t('No times added yet.')}</li>}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <PostForm open={editing !== undefined} post={editing || null} center={loc.data?.location} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); refresh() }} />
      <ConfirmDialog open={!!removing} title="Remove this post?" text="Shifts already planned stay as they are." confirmLabel="Remove" danger onConfirm={remove} onClose={() => setRemoving(null)} />
    </>
  )
}

export default GuardPosts
