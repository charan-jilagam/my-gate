import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FiCheckCircle, FiCopy, FiAlertTriangle, FiSend } from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import api from '../services/api'
import { useT } from '../contexts/LanguageContext'
import { Field, Modal, Spinner, errorMessage } from './ui'

// Everything an admin needs to add someone: pick the kind of person, fill in who they are, and send them a link to
// choose their own password. The platform admin can also pick the society and add society admins.
export const ROLE_CHOICES = [
  { value: 'resident', label: 'Resident', hint: 'Lives in the society. Needs a flat number.' },
  { value: 'security', label: 'Security guard', hint: 'Works at the gate.' },
  { value: 'guard_admin', label: 'Guard head', hint: 'In charge of the guards, their roster and attendance.' },
  { value: 'staff', label: 'Staff', hint: 'Housekeeping, maintenance, gardening and so on.' },
  { value: 'vendor', label: 'Service vendor', hint: 'Plumber, electrician and other home services.' }
]
const ADMIN_CHOICE = { value: 'society_admin', label: 'Society admin', hint: 'Runs the society: approvals, notices, money and more.' }

const EMPTY = { role: 'resident', name: '', email: '', phone: '', flatNo: '', block: '', societyId: '' }

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (e) {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch (err) {
      return false
    }
  }
}

const AddPersonModal = ({ open, onClose, onCreated, isSuper = false, societies = [], defaultSocietyId = '', startRole }) => {
  const { t } = useT()
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const choices = isSuper ? [ADMIN_CHOICE, ...ROLE_CHOICES] : ROLE_CHOICES
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    if (open) {
      setF({ ...EMPTY, role: startRole || 'resident', societyId: defaultSocietyId || '' })
      setError('')
      setDone(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const picked = choices.find((c) => c.value === f.role) || choices[0]

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (f.name.trim().length < 2) return setError('Enter the person\'s name.')
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setError('Enter a valid email address.')
    if (!/^[0-9]{10}$/.test(f.phone.trim())) return setError('Enter a valid 10-digit phone number.')
    if (f.role === 'resident' && !f.flatNo.trim()) return setError('Enter the flat number.')
    if (isSuper && !f.societyId) return setError('Choose the society.')
    setBusy(true)
    try {
      const { data } = await api.post('/users/create', {
        role: f.role,
        name: f.name.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        flatNo: f.role === 'resident' ? f.flatNo.trim() : undefined,
        block: f.role === 'resident' && f.block.trim() ? f.block.trim() : undefined,
        societyId: isSuper ? f.societyId : undefined
      })
      setDone(data)
      onCreated?.(data.user)
    } catch (err) {
      setError(errorMessage(err, 'Could not create the account. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const link = done?.invite?.setupUrl
  const who = done?.user
  const share = who ? `Hi ${who.name.split(' ')[0]}, your Nivora account is ready. Choose your password here (valid ${done.invite.days} days): ${link}` : ''

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={done ? 'Account created' : 'Add a person'}
      footer={
        done ? (
          <>
            <button className="btn-secondary" onClick={() => { setDone(null); setF({ ...EMPTY, role: f.role, societyId: f.societyId }) }}>{t('Add another')}</button>
            <button className="btn-primary" onClick={onClose}>{t('Done')}</button>
          </>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>{t('Cancel')}</button>
            <button type="submit" form="add-person-form" className="btn-primary" disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : <FiSend size={16} />} {t('Create account')}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"><FiCheckCircle size={20} /></span>
            <div className="min-w-0">
              <p className="font-semibold">{who.name}</p>
              <p className="break-all text-sm text-muted">{who.email} · {t(choices.find((c) => c.value === who.role)?.label || who.role)}</p>
            </div>
          </div>
          {done.invite.emailSent ? (
            <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm">{t('We emailed them a link to choose their password. It works for')} {done.invite.days} {t('days')}.</p>
          ) : (
            <p className="flex items-start gap-2 rounded-lg bg-amber-soft px-3 py-2 text-sm" role="alert"><FiAlertTriangle className="mt-0.5 shrink-0" /> {t('The email could not be sent. Share the link below with them yourself.')}</p>
          )}
          <Field label="Setup link" htmlFor="np-link" hint="Anyone with this link can set the password for this account, so share it only with this person.">
            <div className="flex gap-2">
              <input id="np-link" readOnly className="input min-w-0 flex-1 text-xs" value={link} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn-secondary" onClick={async () => { const ok = await copyText(link); if (ok) toast.success(t('Link copied')); else toast.error(t('Could not copy')) }} aria-label={t('Copy link')}><FiCopy /></button>
            </div>
          </Field>
          <a className="btn-secondary w-full" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer"><FaWhatsapp size={18} /> {t('Share on WhatsApp')}</a>
        </div>
      ) : (
        <form id="add-person-form" className="space-y-4" onSubmit={submit} noValidate>
          <Field label="Kind of person" htmlFor="np-role" hint={picked.hint}>
            <select id="np-role" className="input" value={f.role} onChange={(e) => set('role', e.target.value)}>
              {choices.map((c) => <option key={c.value} value={c.value}>{t(c.label)}</option>)}
            </select>
          </Field>
          {isSuper && (
            <Field label="Society" htmlFor="np-society">
              <select id="np-society" className="input" value={f.societyId} onChange={(e) => set('societyId', e.target.value)}>
                <option value="">{t('Choose a society')}</option>
                {societies.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Full name" htmlFor="np-name">
            <input id="np-name" className="input" autoComplete="off" maxLength={60} value={f.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="np-email">
              <input id="np-email" type="email" inputMode="email" autoComplete="off" className="input" value={f.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Mobile number" htmlFor="np-phone">
              <input id="np-phone" type="tel" inputMode="numeric" autoComplete="off" maxLength={10} className="input" value={f.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          {f.role === 'resident' && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Block" htmlFor="np-block" hint="Optional">
                <input id="np-block" className="input" maxLength={20} value={f.block} onChange={(e) => set('block', e.target.value)} />
              </Field>
              <Field label="Flat number" htmlFor="np-flat">
                <input id="np-flat" className="input" maxLength={20} value={f.flatNo} onChange={(e) => set('flatNo', e.target.value)} />
              </Field>
            </div>
          )}
          <p className="text-xs text-muted">{t('They are approved straight away. We email them a link to choose their own password, so you never have to know it.')}</p>
          {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{t(error)}</p>}
        </form>
      )}
    </Modal>
  )
}

export default AddPersonModal
