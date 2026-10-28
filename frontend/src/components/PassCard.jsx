import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FiCopy, FiDownload, FiRefreshCw } from 'react-icons/fi'
import api from '../services/api'
import { useT } from '../contexts/LanguageContext'
import { Avatar, ConfirmDialog, Modal, Spinner, errorMessage } from './ui'

const ROLE = { resident: 'Resident', security: 'Security guard', guard_admin: 'Guard head', staff: 'Staff', society_admin: 'Society admin', super_admin: 'Platform admin', vendor: 'Service provider' }

// Saves the QR (with the name and code written under it) as a picture the person can keep on their phone or print.
const downloadPass = (pass) => {
  const img = new Image()
  img.onload = () => {
    const w = 420
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = 560
    const c = canvas.getContext('2d')
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, w, canvas.height)
    c.fillStyle = '#111827'
    c.textAlign = 'center'
    c.font = 'bold 26px sans-serif'
    c.fillText(pass.person.name, w / 2, 48)
    c.font = '16px sans-serif'
    c.fillStyle = '#4b5563'
    c.fillText([pass.person.relation || ROLE[pass.person.role], pass.person.flat].filter(Boolean).join(' · '), w / 2, 76)
    c.drawImage(img, 60, 96, 300, 300)
    c.fillStyle = '#111827'
    c.font = 'bold 22px monospace'
    c.fillText(pass.displayCode, w / 2, 440)
    c.font = '14px sans-serif'
    c.fillStyle = '#4b5563'
    c.fillText('Nivora entry pass. Show this to the guard.', w / 2, 480)
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `nivora-pass-${pass.person.name.replace(/\W+/g, '-').toLowerCase()}.png`
    a.click()
  }
  img.src = pass.qrCodeImage
}

/**
 * A person's permanent entry pass: photo, name, QR and typed code, with Regenerate.
 * userId empty = my own pass. canRegenerate=false hides the button (for read-only views).
 */
export const PassCard = ({ userId, canRegenerate = true, onChanged }) => {
  const { t } = useT()
  const [pass, setPass] = useState(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const base = userId ? `/passes/user/${userId}` : '/passes/me'

  const load = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get(base)
      setPass(data.pass)
    } catch (err) {
      setError(errorMessage(err, 'Could not load the pass.'))
    }
  }, [base])

  useEffect(() => {
    setPass(null)
    load()
  }, [load])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pass.displayCode)
      toast.success(t('Code copied'))
    } catch (e) {
      toast.error(t('Could not copy. Read the code out instead.'))
    }
  }

  const regenerate = async () => {
    setBusy(true)
    try {
      const { data } = await api.post(`/passes/user/${userId || pass.person._id}/regenerate`)
      setPass(data.pass)
      toast.success(t('New pass made. The old one no longer works.'))
      setConfirming(false)
      onChanged?.()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p role="alert" className="py-6 text-center text-sm text-danger">{error}</p>
  if (!pass) return <div className="grid h-72 place-items-center"><Spinner className="h-6 w-6 text-brand" /></div>
  const p = pass.person
  const sub = [p.relation || t(ROLE[p.role] || 'Member'), p.flat].filter(Boolean).join(' · ')

  return (
    <div className="text-center">
      <Avatar name={p.name} src={p.photo} size={72} className="mx-auto ring-4 ring-brand-soft" />
      <p className="mt-3 font-display text-2xl font-extrabold">{p.name}</p>
      <p className="text-sm text-muted">{sub}</p>
      <div className="mx-auto mt-4 grid h-56 w-56 place-items-center rounded-2xl bg-white p-2 shadow-sm ring-1 ring-edge">
        <img src={pass.qrCodeImage} alt={`${t('Entry pass QR code for')} ${p.name}`} className="h-full w-full" />
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t('Pass code')}</p>
      <p className="font-mono text-lg font-bold tracking-wider">{pass.displayCode}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button className="btn-secondary btn-sm" onClick={copy}><FiCopy size={14} /> {t('Copy code')}</button>
        <button className="btn-secondary btn-sm" onClick={() => downloadPass(pass)}><FiDownload size={14} /> {t('Save picture')}</button>
        {canRegenerate && <button className="btn-secondary btn-sm" onClick={() => setConfirming(true)}><FiRefreshCw size={14} /> {t('Make a new pass')}</button>}
      </div>
      <p className="mt-4 text-sm text-muted">{t('This pass does not expire. The guard scans it when you come in and when you go out.')}</p>
      {pass.regeneratedAt && <p className="mt-1 text-xs text-muted">{`${t('Replaced on')} ${new Date(pass.regeneratedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}</p>}

      <ConfirmDialog
        open={confirming}
        title={t('Make a new pass?')}
        text={t('The current QR code and pass code will stop working straight away. Use this if the pass was shared or lost.')}
        confirmLabel={t('Make new pass')}
        busy={busy}
        onConfirm={regenerate}
        onClose={() => setConfirming(false)}
      />
    </div>
  )
}

/** The same card in a pop-up, for lists (family members, people). */
export const PassModal = ({ userId, name, onClose, canRegenerate = true }) => (
  <Modal open={!!userId} onClose={onClose} title={name ? `Entry pass: ${name}` : 'Entry pass'} size="sm" footer={<button className="btn-primary" onClick={onClose}>Done</button>}>
    {userId && <PassCard userId={userId} canRegenerate={canRegenerate} />}
  </Modal>
)

export default PassCard
