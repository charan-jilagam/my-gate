import { useState } from 'react'
import { FiCheckCircle, FiPlus, FiThumbsUp, FiTrash2, FiUsers } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { useSocietyScope } from '../components/SocietyPicker'
import VoterList from '../components/VoterList'
import { ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, Modal, PageHeader, Spinner, StatusTag, Tabs, formatDate } from '../components/ui'

const PHASE = { open: 'Open now', upcoming: 'Upcoming', closed: 'Closed', cancelled: 'Cancelled' }
const toLocalInput = (iso) => {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const inHours = (h) => toLocalInput(new Date(Date.now() + h * 3600 * 1000).toISOString())
const blank = () => ({ title: '', description: '', kind: 'resolution', voting: 'per_flat', opensAt: inHours(1), closesAt: inHours(24 * 7), options: [{ label: 'Yes', detail: '' }, { label: 'No', detail: '' }] })

const Votes = () => {
  const { isAdmin, isResident } = useAuth()
  const { t } = useT()
  const scope = useSocietyScope()
  const [tab, setTab] = useState('now')
  const { data, loading, error, reload } = useApi('/elections', { params: scope.params, enabled: scope.ready, select: (d) => d.elections || [] })
  const { busy, run } = useAction(reload)
  const [form, setForm] = useState(null)
  const [openId, setOpenId] = useState(null)
  const detail = useApi(openId ? `/elections/${openId}` : '/elections/none', { enabled: !!openId, select: (d) => d.election })
  const [choice, setChoice] = useState('')
  const [cancelling, setCancelling] = useState(null)

  const list = (data || []).filter((e) => (tab === 'now' ? ['open', 'upcoming'].includes(e.phase) : ['closed', 'cancelled'].includes(e.phase)))
  const needsVote = (data || []).filter((e) => e.phase === 'open' && !e.voted).length

  const setOption = (i, patch) => setForm({ ...form, options: form.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) })

  const save = async (e) => {
    e.preventDefault()
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      kind: form.kind,
      voting: form.voting,
      opensAt: new Date(form.opensAt).toISOString(),
      closesAt: new Date(form.closesAt).toISOString(),
      options: form.options.map((o) => ({ label: o.label.trim(), detail: o.detail?.trim() || undefined })).filter((o) => o.label)
    }
    if (scope.societyId) body.societyId = scope.societyId
    const ok = await run('save', () => (form._id ? api.put(`/elections/${form._id}`, body) : api.post('/elections', body)), 'Saved')
    if (ok) setForm(null)
  }

  const cast = async () => {
    const ok = await run('vote', () => api.post(`/elections/${openId}/vote`, { optionId: choice }), 'Your vote is recorded. Thank you!')
    if (ok) {
      setChoice('')
      detail.reload()
    }
  }

  const v = detail.data

  return (
    <>
      <PageHeader
        title="Votes and elections"
        subtitle={isAdmin ? 'Run committee elections and decisions with a secret ballot.' : 'Have your say. One vote per flat. The office can see that you voted, never what you chose.'}
        action={isAdmin && scope.ready && <button className="btn-primary" onClick={() => setForm(blank())}><FiPlus size={16} /> {t('New vote')}</button>}
      />
      {scope.picker}
      {isResident && needsVote > 0 && <p className="mb-4 rounded-md bg-brand-soft px-4 py-3 text-sm font-semibold text-brand">You have {needsVote} {needsVote === 1 ? 'vote' : 'votes'} waiting for you.</p>}

      <Tabs label="Votes" value={tab} onChange={setTab} items={[{ key: 'now', label: 'Open now' }, { key: 'done', label: 'Results' }]} />

      {!scope.ready || loading ? (
        <div className="panel"><ListSkeleton rows={3} /></div>
      ) : error ? (
        <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
      ) : !list.length ? (
        <div className="panel"><EmptyState icon={FiThumbsUp} title="No votes yet" text={tab === 'now' ? 'When the office starts a vote, it will appear here.' : 'Results appear here once a vote has closed.'} /></div>
      ) : (
        <ul className="space-y-2">
          {list.map((e) => (
            <li key={e._id}>
              <button className="panel-link block w-full p-5 text-left" onClick={() => { setChoice(''); setOpenId(e._id) }}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusTag status={e.phase === 'open' ? 'active' : e.phase === 'upcoming' ? 'on_the_way' : e.phase === 'closed' ? 'checked_out' : 'cancelled'} label={PHASE[e.phase]} />
                  <span className="tag-neutral">{e.kind === 'election' ? 'Election' : 'Decision'}</span>
                  {e.voted && <span className="tag-ok inline-flex items-center gap-1"><FiCheckCircle size={12} /> You voted</span>}
                </div>
                <p className="mt-2 font-display text-lg font-bold">{e.title}</p>
                <p className="text-xs text-muted">{e.phase === 'upcoming' ? `Opens ${formatDate(e.opensAt, true)}` : e.phase === 'open' ? `Closes ${formatDate(e.closesAt, true)}` : `Closed ${formatDate(e.closesAt, true)}`}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* One vote: read, vote, or see results */}
      <Modal open={!!openId} onClose={() => setOpenId(null)} title={v?.title || 'Vote'} size="lg"
        footer={v && (
          <>
            {v.canManage && ['open', 'upcoming'].includes(v.phase) && <button className="btn-ghost text-danger" onClick={() => setCancelling(v)}>Cancel this vote</button>}
            {v.canManage && v.phase === 'upcoming' && <button className="btn-secondary" onClick={() => { setOpenId(null); setForm({ ...v, opensAt: toLocalInput(v.opensAt), closesAt: toLocalInput(v.closesAt) }) }}>{t('Edit')}</button>}
            <button className="btn-secondary" onClick={() => setOpenId(null)}>{t('Close')}</button>
            {isResident && v.phase === 'open' && !v.voted && <button className="btn-primary" disabled={!choice || busy === 'vote'} onClick={cast}>{busy === 'vote' && <Spinner className="h-4 w-4" />} Cast my vote</button>}
          </>
        )}>
        {detail.loading || !v ? <ListSkeleton rows={3} /> : detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag status={v.phase === 'open' ? 'active' : v.phase === 'upcoming' ? 'on_the_way' : v.phase === 'closed' ? 'checked_out' : 'cancelled'} label={PHASE[v.phase]} />
              <span className="text-xs text-muted">{v.voting === 'per_flat' ? 'One vote per flat' : 'One vote per resident'} · Secret ballot</span>
            </div>
            {v.description && <p className="whitespace-pre-line text-sm">{v.description}</p>}
            <p className="text-xs text-muted">{formatDate(v.opensAt, true)} to {formatDate(v.closesAt, true)}</p>

            {v.resultsVisible ? (
              <div>
                <h3 className="mb-2 text-sm font-bold">{t('Results')}</h3>
                <ul className="space-y-3">
                  {v.options.map((o) => (
                    <li key={o._id}>
                      <div className="flex justify-between text-sm"><span className="font-semibold">{o.label}{o.leading && <span className="tag-ok ml-2">{v.tied ? 'Tied' : 'Leading'}</span>}</span><span>{o.votes} ({o.percent}%)</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken" role="presentation"><div className="h-full rounded-full bg-brand" style={{ width: `${o.percent}%` }} /></div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <fieldset disabled={!(isResident && v.phase === 'open' && !v.voted)}>
                <legend className="sr-only">Options</legend>
                <ul className="space-y-2">
                  {v.options.map((o) => (
                    <li key={o._id}>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 ${choice === o._id ? 'border-brand bg-brand-soft' : 'border-line'}`}>
                        <input type="radio" name="vote-option" className="mt-1" checked={choice === o._id} onChange={() => setChoice(o._id)} />
                        <span><span className="block font-semibold">{o.label}</span>{o.detail && <span className="block text-sm text-muted">{o.detail}</span>}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}

            {v.voted && v.phase !== 'closed' && <p className="flex items-center gap-2 rounded-md bg-ok-soft px-3 py-2 text-sm font-semibold text-ok"><FiCheckCircle size={15} /> Your vote is recorded. It cannot be changed.</p>}
            {v.phase === 'upcoming' && <p className="text-sm text-muted">Voting has not opened yet.</p>}
            {v.canManage && v.phase !== 'upcoming' ? <VoterList electionId={v._id} eligible={v.turnout?.eligible} /> : v.turnout && <p className="flex items-center gap-2 text-sm text-muted"><FiUsers size={15} /> {v.turnout.votes} of {v.turnout.eligible} {v.voting === 'per_flat' ? 'flats' : 'residents'} have voted{v.phase === 'open' ? ' so far' : ''}.</p>}
            {v.phase === 'open' && v.canManage && <p className="text-xs text-muted">Results stay hidden until voting closes.</p>}
          </div>
        )}
      </Modal>

      {/* Create or edit */}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?._id ? 'Edit vote' : 'New vote'} size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => setForm(null)}>{t('Cancel')}</button>
          <button className="btn-primary" form="vote-form" type="submit" disabled={busy === 'save'}>{busy === 'save' && <Spinner className="h-4 w-4" />} {t('Save')}</button>
        </>}>
        {form && (
          <form id="vote-form" onSubmit={save} className="space-y-4">
            <Field label="Title" htmlFor="v-title"><input id="v-title" required className="input" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="For example: Install solar panels on the clubhouse roof?" /></Field>
            <Field label="Description" htmlFor="v-desc" hint="Optional. Explain the cost and what happens if it passes."><textarea id="v-desc" rows={3} className="input" maxLength={1500} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" htmlFor="v-kind"><select id="v-kind" className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="resolution">Decision (yes or no, or choose one)</option><option value="election">Election (choose a candidate)</option></select></Field>
              <Field label="Who votes" htmlFor="v-voting"><select id="v-voting" className="input" value={form.voting} onChange={(e) => setForm({ ...form, voting: e.target.value })}><option value="per_flat">One vote per flat</option><option value="per_resident">One vote per resident</option></select></Field>
              <Field label="Voting opens" htmlFor="v-open"><input id="v-open" type="datetime-local" required className="input" value={form.opensAt} onChange={(e) => setForm({ ...form, opensAt: e.target.value })} /></Field>
              <Field label="Voting closes" htmlFor="v-close"><input id="v-close" type="datetime-local" required className="input" value={form.closesAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} /></Field>
            </div>
            <fieldset>
              <legend className="label">Options</legend>
              <ul className="space-y-2">
                {form.options.map((o, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="grid flex-1 gap-2 sm:grid-cols-2">
                      <input className="input" aria-label={`Option ${i + 1}`} required maxLength={80} placeholder={`Option ${i + 1}`} value={o.label} onChange={(e) => setOption(i, { label: e.target.value })} />
                      <input className="input" aria-label={`Option ${i + 1} details`} maxLength={300} placeholder="Details (optional)" value={o.detail || ''} onChange={(e) => setOption(i, { detail: e.target.value })} />
                    </div>
                    <button type="button" className="btn-ghost btn-sm text-danger" disabled={form.options.length <= 2} aria-label={`Remove option ${i + 1}`} onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}><FiTrash2 size={14} /></button>
                  </li>
                ))}
              </ul>
              {form.options.length < 12 && <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setForm({ ...form, options: [...form.options, { label: '', detail: '' }] })}><FiPlus size={14} /> Add option</button>}
            </fieldset>
            <p className="text-xs text-muted">Times are in your device's time zone. Once voting opens, the question and options can no longer be changed.</p>
          </form>
        )}
      </Modal>

      <ConfirmDialog open={!!cancelling} danger title="Cancel this vote?" text="Nobody can vote any more and no results are published." confirmLabel="Cancel vote" busy={busy === 'cancel'} onClose={() => setCancelling(null)}
        onConfirm={async () => { const ok = await run('cancel', () => api.put(`/elections/${cancelling._id}/cancel`), 'Vote cancelled'); if (ok) { setCancelling(null); setOpenId(null) } }} />
    </>
  )
}

export default Votes
