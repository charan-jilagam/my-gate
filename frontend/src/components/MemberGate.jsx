import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiCamera, FiPhone, FiSearch } from 'react-icons/fi'
import api from '../services/api'
import useApi from '../hooks/useApi'
import { useT } from '../contexts/LanguageContext'
import QrScanner from './QrScanner'
import { ActionBadge, when } from './Movements'
import { Avatar, ErrorState, ListSkeleton, Modal, Spinner, errorMessage } from './ui'
import { readScan } from '../utils/pass'

const ROLE = { resident: 'Resident', security: 'Security guard', guard_admin: 'Guard head', staff: 'Staff', society_admin: 'Society admin', super_admin: 'Platform admin', vendor: 'Service provider' }

/**
 * The guard's side of permanent passes: family members and the head of the house, and also guards, staff and admins.
 * Scan the QR (or type the NV- code) to see who it is, then record them coming in or going out.
 * Family: "going out / coming in" (they start at home). Everyone else: "entry / exit" (they start outside).
 */
const MemberGate = () => {
  const { t } = useT()
  const recent = useApi('/passes/recent', { params: { limit: 15 }, select: (d) => d.events || [] })
  const [code, setCode] = useState('')
  const [found, setFound] = useState(null)
  const [error, setError] = useState('')
  const [looking, setLooking] = useState(false)
  const [acting, setActing] = useState(false)
  const [scanning, setScanning] = useState(false)

  const lookup = async (value) => {
    setError('')
    setFound(null)
    setLooking(true)
    try {
      const { data } = await api.post('/passes/lookup', { code: value })
      setFound({ ...data, code: value })
    } catch (err) {
      setError(errorMessage(err, 'Could not look up that pass.'))
    } finally {
      setLooking(false)
    }
  }

  const record = async (direction) => {
    setActing(true)
    try {
      const { data } = await api.post('/passes/check', { code: found.code, direction })
      toast.success(data.message)
      setFound(null)
      setCode('')
      recent.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setActing(false)
    }
  }

  const onScan = (raw) => {
    setScanning(false)
    const read = readScan(raw)
    if (read.kind !== 'member') return setError(t('That is not a Nivora member pass.'))
    setCode(read.code)
    lookup(read.code)
  }

  const p = found?.person
  const family = p?.isFamily
  const next = found?.next
  const label = (dir) => (family ? (dir === 'out' ? 'Going out' : 'Coming in') : dir === 'out' ? 'Mark exit' : 'Let in (entry)')

  return (
    <div className="space-y-5">
      <section className="panel p-5" aria-labelledby="member-gate-h">
        <h2 id="member-gate-h" className="text-base font-bold">{t('Family, guards and staff')}</h2>
        <p className="mb-3 text-sm text-muted">{t('Scan the QR code on their entry pass or type the code that starts with NV. You will see their photo and details, then you record them coming in or going out.')}</p>
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 8) lookup(code.trim()) }} className="flex flex-wrap items-start gap-2">
          <input className="input w-64 font-mono uppercase tracking-wider" placeholder="NV-____-____-____-____" aria-label={t('Pass code')} autoComplete="off" value={code} onChange={(e) => { setCode(e.target.value); setFound(null) }} />
          <button className="btn-primary" type="submit" disabled={code.trim().length < 8 || looking}>{looking ? <Spinner className="h-4 w-4" /> : <FiSearch size={16} />} {t('Find')}</button>
          <button className="btn-secondary" type="button" onClick={() => setScanning(true)}><FiCamera size={16} /> {t('Scan QR')}</button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}

        {p && (
          <div className="fade-in mt-4 rounded-2xl border border-edge bg-sunken/60 p-4" role="status">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={p.name} src={p.photo} size={84} className="ring-4 ring-brand-soft" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-extrabold">{p.name}</p>
                <p className="text-sm text-muted">
                  {[p.relation || t(ROLE[p.role] || 'Member'), p.flat && `${t('Flat')} ${p.flat}`].filter(Boolean).join(' · ')}
                </p>
                {family && !p.isHead && p.headName && <p className="text-sm text-muted">{`${t('Family of')} ${p.headName}`}</p>}
                <p className="mt-1 text-sm font-semibold">
                  {p.inside ? (family ? t('At home') : t('Inside')) : (family ? t('Out') : t('Outside'))}
                  {p.since ? ` · ${t('since')} ${when(p.since)}` : ''}
                </p>
                {p.phone && <a className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-info" href={`tel:${p.phone}`}><FiPhone size={13} aria-hidden="true" /> {p.phone}</a>}
              </div>
            </div>
            {!p.isActive ? (
              <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{t('This account is switched off. Do not let them in on this pass.')}</p>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button className={next === 'out' ? 'btn-secondary' : 'btn-primary'} onClick={() => record(next)} disabled={acting}>
                  {acting && <Spinner className="h-4 w-4" />} {t(label(next))}
                </button>
                <button className="text-sm font-semibold text-muted hover:text-ink" onClick={() => record(next === 'out' ? 'in' : 'out')} disabled={acting}>
                  {t('Wrong way? Record')} {t(label(next === 'out' ? 'in' : 'out')).toLowerCase()}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 text-base font-bold">{t('Latest entries and exits')}</h2>
        {recent.loading && !recent.data ? <ListSkeleton rows={3} /> : recent.error && !recent.data ? <ErrorState message={recent.error} onRetry={recent.reload} /> : !recent.data?.length ? (
          <p className="px-4 py-6 text-sm text-muted">{t('No member scans yet.')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {recent.data.map((e) => (
              <li key={e._id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={e.name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.name}</p>
                  <p className="truncate text-xs text-muted">{[e.relation || t(ROLE[e.role] || 'Member'), e.flat].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="text-right">
                  <ActionBadge action={e.action} family={e.role === 'resident'} />
                  <p className="mt-0.5 text-xs text-muted">{when(e.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={scanning} onClose={() => setScanning(false)} title="Scan member pass" size="sm">
        {scanning && <QrScanner onScan={onScan} />}
      </Modal>
    </div>
  )
}

export default MemberGate
