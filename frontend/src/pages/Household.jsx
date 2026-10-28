import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiEdit2, FiMail, FiPlus, FiPower, FiUsers } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { Avatar, EmptyState, ErrorState, Field, ListSkeleton, Modal, PageHeader, Spinner, Tabs, errorMessage } from '../components/ui'
import { PassModal } from '../components/PassCard'
import PhotoPicker from '../components/PhotoPicker'
import { ActivityList, when } from '../components/Movements'

const RELATIONS = ['Wife', 'Husband', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Grandparent', 'Other']
const blank = { name: '', phone: '', relation: 'Wife', email: '', profilePic: '' }

const Where = ({ m }) => {
  const { t } = useT()
  if (!m.isActive) return <span className="tag-neutral">{t('Switched off')}</span>
  if (m.inside) return <span className="tag-ok">{t('At home')}{m.known && m.since ? ` · ${when(m.since)}` : ''}</span>
  return <span className="tag-warn">{t('Out')}{m.since ? ` · ${when(m.since)}` : ''}</span>
}

const MemberForm = ({ form, setForm, editing }) => {
  const { t } = useT()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <div className="space-y-4">
      <PhotoPicker value={form.profilePic} onChange={(profilePic) => setForm({ ...form, profilePic })} name={form.name} />
      <Field label="Name" htmlFor="m-name"><input id="m-name" className="input" value={form.name} onChange={set('name')} maxLength={60} autoComplete="off" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Relation" htmlFor="m-rel">
          <select id="m-rel" className="input" value={RELATIONS.includes(form.relation) ? form.relation : 'Other'} onChange={set('relation')}>
            {RELATIONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}
          </select>
        </Field>
        <Field label="Phone number" htmlFor="m-phone"><input id="m-phone" className="input" inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      {!editing && (
        <Field label="Email (for their own login)" htmlFor="m-email" hint="Optional. With an email they get a link to choose a password and can sign in. Without one they still get an entry pass.">
          <input id="m-email" className="input" type="email" value={form.email} onChange={set('email')} autoComplete="off" />
        </Field>
      )}
    </div>
  )
}

const Household = () => {
  const { t } = useT()
  const { user } = useAuth()
  const [tab, setTab] = useState('family')
  const [days, setDays] = useState(7)
  const home = useApi('/household')
  const activity = useApi('/household/activity', { params: { days }, enabled: tab === 'log' && Boolean(home.data?.canManage), select: (d) => d.items || [] })
  const { busy, run } = useAction(home.reload)

  const [form, setForm] = useState(null) // { ...fields, _id? }
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [passFor, setPassFor] = useState(null)
  const [shared, setShared] = useState(null) // setup link to hand over when the email could not be sent

  const canManage = home.data?.canManage
  const members = home.data?.members || []
  const addable = members.length < (home.data?.maxMembers || 10)

  const save = async () => {
    setFormError('')
    setSaving(true)
    try {
      const body = { name: form.name.trim(), phone: form.phone, relation: form.relation, profilePic: form.profilePic }
      if (form._id) {
        await api.put(`/household/members/${form._id}`, body)
        toast.success(t('Saved'))
      } else {
        const { data } = await api.post('/household/members', { ...body, email: form.email.trim() || undefined })
        toast.success(data.message)
        if (data.invite && !data.invite.emailSent) setShared({ name: form.name, url: data.invite.setupUrl })
      }
      setForm(null)
      home.reload()
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const toggle = (m) => run(`on${m._id}`, () => api.put(`/household/members/${m._id}/active`, { active: !m.isActive }), m.isActive ? t('Switched off') : t('Switched on'))
  const invite = async (m) => {
    const ok = await run(`inv${m._id}`, async () => {
      const { data } = await api.post(`/household/members/${m._id}/invite`)
      if (!data.invite.emailSent) setShared({ name: m.name, url: data.invite.setupUrl })
      return data
    }, t('Link sent'))
    return ok
  }

  return (
    <>
      <PageHeader
        title="My family"
        subtitle={home.data?.flat ? `${t('Flat')} ${home.data.flat}. ${t('Everyone gets their own entry pass with their photo. The guard sees who they are when the pass is scanned.')}` : 'Everyone gets their own entry pass with their photo.'}
        action={canManage && (
          <button className="btn-primary" onClick={() => { setFormError(''); setForm({ ...blank }) }} disabled={!addable}>
            <FiPlus size={16} /> {t('Add family member')}
          </button>
        )}
      />

      {canManage && <Tabs items={[{ key: 'family', label: 'Family' }, { key: 'log', label: 'Entry and exit log' }]} value={tab} onChange={setTab} label="Family sections" />}

      {tab === 'family' && (home.loading && !home.data ? <div className="panel"><ListSkeleton rows={3} /></div> : home.error && !home.data ? <div className="panel"><ErrorState message={home.error} onRetry={home.reload} /></div> : !members.length ? (
        <div className="panel"><EmptyState icon={FiUsers} title="No family members yet" text="Add your family so each person has a login and an entry pass." /></div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {members.map((m) => (
            <li key={m._id} className="panel min-w-0 p-4">
              <div className="flex gap-3">
                <Avatar name={m.name} src={m.photo} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{m.name}</p>
                  <p className="text-sm text-muted">{t(m.relation) || t('Family')}{m.phone ? ` · ${m.phone}` : ''}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Where m={m} />
                    <span className="inline-flex items-center gap-1 text-xs text-muted"><FiMail size={12} aria-hidden="true" /> {m.hasLogin ? m.email : t('Pass only, no login')}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                <button className="btn-primary btn-sm" onClick={() => setPassFor(m)} disabled={!m.isActive}>{t('Show pass')}</button>
                {canManage && !m.isHead && (
                  <>
                    <button className="btn-secondary btn-sm" onClick={() => { setFormError(''); setForm({ _id: m._id, name: m.name, phone: m.phone || '', relation: m.relation || 'Other', profilePic: m.photo || '', email: '' }) }}><FiEdit2 size={14} /> {t('Edit')}</button>
                    {m.hasLogin && <button className="btn-secondary btn-sm" onClick={() => invite(m)} disabled={busy === `inv${m._id}`}>{busy === `inv${m._id}` ? <Spinner className="h-4 w-4" /> : <FiMail size={14} />} {t('Send sign-in link')}</button>}
                    <button className="btn-ghost btn-sm" onClick={() => toggle(m)} disabled={busy === `on${m._id}`}><FiPower size={14} /> {m.isActive ? t('Switch off') : t('Switch on')}</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ))}

      {tab === 'log' && canManage && (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-base font-bold">{t('Everyone who came or went at your flat')}</h2>
            <select className="input !w-auto" aria-label={t('Time range')} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 7, 30].map((d) => <option key={d} value={d}>{d === 1 ? t('Last 24 hours') : `${t('Last')} ${d} ${t('days')}`}</option>)}
            </select>
          </div>
          {activity.loading && !activity.data ? <ListSkeleton rows={5} /> : activity.error && !activity.data ? <ErrorState message={activity.error} onRetry={activity.reload} /> : <ActivityList items={activity.data || []} />}
          <p className="border-t border-line px-4 py-3 text-xs text-muted">{t('Shows family (going out and coming in), visitors and daily help.')}</p>
        </section>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? 'Edit family member' : 'Add family member'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setForm(null)} disabled={saving}>{t('Cancel')}</button>
            <button className="btn-primary" onClick={save} disabled={saving || form?.name.trim().length < 2 || form?.phone.length !== 10}>{saving && <Spinner className="h-4 w-4" />} {t('Save')}</button>
          </>
        }
      >
        {form && <MemberForm form={form} setForm={setForm} editing={!!form._id} />}
        {formError && <p role="alert" className="mt-3 text-sm font-medium text-danger">{formError}</p>}
      </Modal>

      <PassModal userId={passFor?._id} name={passFor?.name} onClose={() => setPassFor(null)} canRegenerate={canManage || String(passFor?._id) === String(user?._id || user?.id)} />

      <Modal open={!!shared} onClose={() => setShared(null)} title="Share the sign-in link" size="sm" footer={<button className="btn-primary" onClick={() => setShared(null)}>{t('Done')}</button>}>
        {shared && (
          <div className="space-y-2 text-sm">
            <p>{`${t('The email could not be sent. Send this link to')} ${shared.name} ${t('yourself. It works for 7 days.')}`}</p>
            <input className="input font-mono text-xs" readOnly value={shared.url} onFocus={(e) => e.target.select()} aria-label={t('Sign-in link')} />
          </div>
        )}
      </Modal>
    </>
  )
}

export default Household
