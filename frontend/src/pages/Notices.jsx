import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FiBell, FiCalendar, FiMapPin, FiPlus, FiTrash2 } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, Modal, PageHeader, Spinner, formatDate, titleCase } from '../components/ui'
import Rsvp from '../components/Rsvp'

const TYPES = ['notice', 'announcement', 'poll', 'event', 'maintenance']
const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const CATEGORIES = ['general', 'maintenance', 'security', 'amenities', 'billing', 'other']
const EMPTY_FORM = {
  title: '',
  content: '',
  type: 'notice',
  priority: 'medium',
  category: 'general',
  pollOptions: '',
  eventDate: '',
  eventLocation: '',
  expiresAt: '',
  societyId: '',
  audience: 'all',
  targets: ''
}

const PRIORITY_TAG = { urgent: 'tag-danger', high: 'tag-warn', medium: 'tag-neutral', low: 'tag-neutral' }

const Poll = ({ notice, userId, canVote, onVote, busy }) => {
  const total = notice.pollOptions.reduce((n, o) => n + o.votes.length, 0)
  const voted = notice.pollOptions.some((o) => o.votes.some((v) => String(v?._id || v) === String(userId)))
  const ended = notice.pollEndDate && new Date(notice.pollEndDate) < new Date()
  const showResults = voted || ended || !canVote

  return (
    <div className="mt-4 space-y-2">
      {notice.pollOptions.map((o, i) => {
        const pct = total ? Math.round((o.votes.length / total) * 100) : 0
        return showResults ? (
          <div key={o._id || i} className="relative overflow-hidden rounded-md border border-edge px-3 py-2 text-sm">
            <span className="absolute inset-y-0 left-0 bg-brand-soft" style={{ width: `${pct}%` }} aria-hidden="true" />
            <span className="relative flex justify-between gap-3">
              <span className="font-medium">{o.option}</span>
              <span className="text-muted">{o.votes.length} {o.votes.length === 1 ? 'vote' : 'votes'} · {pct}%</span>
            </span>
          </div>
        ) : (
          <button key={o._id || i} disabled={busy} onClick={() => onVote(i)} className="btn-secondary w-full justify-start">
            {o.option}
          </button>
        )
      })}
      <p className="text-xs text-muted">
        {total} {total === 1 ? 'vote' : 'votes'}
        {ended ? ' · Poll closed' : voted ? ' · You voted' : ''}
      </p>
    </div>
  )
}

const Notices = () => {
  const { user, isAdmin, isResident, isSuperAdmin } = useAuth()
  const { data, loading, error, reload } = useApi('/notices', { select: (d) => d.notices || [] })
  const { data: societies } = useApi('/societies', { enabled: isSuperAdmin, live: false, select: (d) => d.societies || [] })
  const { busy, run } = useAction(reload)
  // A link from a notification (/notices/<id>) opens the list with that notice at the top and highlighted.
  // If it is not in the recent list (older, or expired), it is fetched by itself so the link still works.
  const { id: linkedId } = useParams()
  const inList = !!linkedId && (data || []).some((n) => n._id === linkedId)
  const single = useApi(`/notices/${linkedId}`, { enabled: !!linkedId && !loading && !inList, live: false, select: (d) => d.notice })
  const list = linkedId
    ? [...(inList ? data.filter((n) => n._id === linkedId) : single.data ? [single.data] : []), ...(data || []).filter((n) => n._id !== linkedId)]
    : data
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [visible, setVisible] = useState(10)
  const pinned = linkedId ? list?.[0] : null
  useEffect(() => {
    if (!pinned || pinned._id !== linkedId) return undefined
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-item-id="${linkedId}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.add('flash-highlight')
      setTimeout(() => el.classList.remove('flash-highlight'), 3500)
    }, 200)
    return () => clearTimeout(timer)
  }, [pinned?._id, linkedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault()
    setFormError('')
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      type: form.type,
      priority: form.priority,
      category: form.category
    }
    if (form.type === 'poll') {
      const options = form.pollOptions.split('\n').map((s) => s.trim()).filter(Boolean)
      if (options.length < 2) return setFormError('Add at least two poll options, one per line.')
      payload.pollOptions = options.map((option) => ({ option }))
    }
    if (form.type === 'event') {
      if (form.eventDate) payload.eventDate = new Date(form.eventDate).toISOString()
      if (form.eventLocation) payload.eventLocation = form.eventLocation.trim()
    }
    const targets = form.targets.split(/[\n,]/).map((t) => t.trim()).filter(Boolean)
    if (form.audience === 'specific_blocks' || form.audience === 'specific_flats') {
      if (!targets.length) return setFormError(form.audience === 'specific_blocks' ? 'Enter at least one block, for example A, B.' : 'Enter at least one flat, for example A-101, 202.')
      payload.targetAudience = form.audience
      if (form.audience === 'specific_blocks') payload.targetBlocks = targets
      else payload.targetFlats = targets
    }
    if (form.expiresAt) payload.expiresAt = new Date(form.expiresAt).toISOString()
    if (isSuperAdmin) {
      const id = form.societyId || societies?.[0]?._id
      if (!id) return setFormError('Choose a society for this notice.')
      payload.societyId = id
    }

    const ok = await run('create', () => api.post('/notices', payload), 'Notice published')
    if (ok) {
      setOpen(false)
      setForm(EMPTY_FORM)
    }
  }

  return (
    <>
      <PageHeader
        title="Notices"
        subtitle="Announcements, polls and events from your society."
        action={
          isAdmin && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <FiPlus size={16} /> New notice
            </button>
          )
        }
      />

      {loading ? (
        <div className="panel"><ListSkeleton rows={4} /></div>
      ) : error ? (
        <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
      ) : !list?.length ? (
        <div className="panel">
          <EmptyState
            icon={FiBell}
            title="No notices right now"
            text={isAdmin ? 'Post an announcement, poll or event for residents.' : 'New announcements from your society will appear here.'}
            action={isAdmin ? <button className="btn-primary" onClick={() => setOpen(true)}>New notice</button> : null}
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {list.slice(0, visible).map((n) => (
            <li key={n._id} data-item-id={n._id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="tag-info">{titleCase(n.type)}</span>
                    {n.targetAudience === 'specific_blocks' && n.targetBlocks?.length > 0 && <span className="tag-neutral">Block {n.targetBlocks.join(', ')}</span>}
                    {n.targetAudience === 'specific_flats' && n.targetFlats?.length > 0 && <span className="tag-neutral">Flats {n.targetFlats.join(', ')}</span>}
                    {['urgent', 'high'].includes(n.priority) && <span className={PRIORITY_TAG[n.priority]}>{titleCase(n.priority)} priority</span>}
                    <span className="text-xs text-muted">{formatDate(n.publishedAt || n.createdAt, true)}</span>
                  </div>
                  <h2 className="text-lg font-bold">{n.title}</h2>
                </div>
                {isAdmin && (
                  <button className="btn-ghost btn-sm" onClick={() => setDeleting(n)} aria-label={`Delete ${n.title}`}>
                    <FiTrash2 size={15} />
                  </button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/90">{n.content}</p>

              {n.type === 'event' && (n.eventDate || n.eventLocation) && (
                <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                  {n.eventDate && <span className="inline-flex items-center gap-1.5"><FiCalendar size={14} />{formatDate(n.eventDate, true)}</span>}
                  {n.eventLocation && <span className="inline-flex items-center gap-1.5"><FiMapPin size={14} />{n.eventLocation}</span>}
                </p>
              )}

              {n.type === 'event' && <Rsvp notice={n} canReply={isResident} onDone={reload} />}

              {n.type === 'poll' && n.pollOptions?.length > 0 && (
                <Poll
                  notice={n}
                  userId={user?.id}
                  canVote={isResident}
                  busy={busy === n._id}
                  onVote={(i) => run(n._id, () => api.post(`/notices/${n._id}/vote`, { optionIndex: i }), 'Vote recorded')}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {list?.length > visible && (
        <div className="mt-4 text-center">
          <button className="btn-secondary" onClick={() => setVisible(visible + 10)}>Show older notices ({list.length - visible} more)</button>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New notice"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="notice-form" type="submit" disabled={busy === 'create'}>
              {busy === 'create' && <Spinner className="h-4 w-4" />}
              Publish
            </button>
          </>
        }
      >
        <form id="notice-form" onSubmit={submit} className="space-y-4">
          {isSuperAdmin && (
            <Field label="Society" htmlFor="n-society">
              <select id="n-society" className="input" value={form.societyId || societies?.[0]?._id || ''} onChange={(e) => setForm({ ...form, societyId: e.target.value })}>
                {(societies || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Title" htmlFor="n-title">
            <input id="n-title" required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Message" htmlFor="n-content">
            <textarea id="n-content" required rows={4} className="input" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </Field>
          <Field label="Who should see it" htmlFor="n-audience">
            <select id="n-audience" className="input" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              <option value="all">Everyone in the society</option>
              <option value="specific_blocks">Only certain blocks</option>
              <option value="specific_flats">Only certain flats</option>
            </select>
          </Field>
          {form.audience !== 'all' && (
            <Field label={form.audience === 'specific_blocks' ? 'Blocks' : 'Flats'} htmlFor="n-targets" hint={form.audience === 'specific_blocks' ? 'Separate with commas, for example A, B.' : 'Separate with commas. Use A-101 for block and flat, or just 101.'}>
              <input id="n-targets" className="input" value={form.targets} onChange={(e) => setForm({ ...form, targets: e.target.value })} />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Type" htmlFor="n-type">
              <select id="n-type" className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </Field>
            <Field label="Priority" htmlFor="n-priority">
              <select id="n-priority" className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </Field>
            <Field label="Category" htmlFor="n-category">
              <select id="n-category" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </Field>
          </div>
          {form.type === 'poll' && (
            <Field label="Poll options" htmlFor="n-options" hint="One option per line.">
              <textarea id="n-options" rows={3} className="input" value={form.pollOptions} onChange={(e) => setForm({ ...form, pollOptions: e.target.value })} />
            </Field>
          )}
          {form.type === 'event' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date and time" htmlFor="n-edate">
                <input id="n-edate" type="datetime-local" className="input" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
              </Field>
              <Field label="Location" htmlFor="n-eloc">
                <input id="n-eloc" className="input" value={form.eventLocation} onChange={(e) => setForm({ ...form, eventLocation: e.target.value })} />
              </Field>
            </div>
          )}
          <Field label="Hide after" htmlFor="n-expires" hint="Optional. The notice disappears from residents' feeds after this time.">
            <input id="n-expires" type="datetime-local" className="input" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </Field>
          {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        danger
        title="Delete this notice?"
        text={`"${deleting?.title}" will be removed for all residents. This cannot be undone.`}
        confirmLabel="Delete notice"
        busy={busy === deleting?._id}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const ok = await run(deleting._id, () => api.delete(`/notices/${deleting._id}`), 'Notice deleted')
          if (ok) setDeleting(null)
        }}
      />
    </>
  )
}

export default Notices
