import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiCamera, FiLogIn, FiLogOut, FiSearch } from 'react-icons/fi'
import api from '../services/api'
import useApi from '../hooks/useApi'
import CodePrompt from './CodePrompt'
import QrScanner from './QrScanner'
import { Avatar, ErrorState, ListSkeleton, Modal, Spinner, errorMessage } from './ui'
import { readScan } from '../utils/pass'
import { clock } from '../utils/gate'

const KIND = { maid: 'Maid', cook: 'Cook', driver: 'Driver', nanny: 'Nanny', gardener: 'Gardener', cleaner: 'Cleaner', tutor: 'Tutor', other: 'Helper' }

/**
 * The guard's side of daily help. Helpers show a QR code or say a 6-digit code, both when they come in and when they leave.
 * Nobody is checked in or out by a click alone.
 */
const HelperGate = () => {
  const inside = useApi('/daily-help', { params: { inside: 'true' }, select: (d) => d.helpers || [] })
  const [code, setCode] = useState('')
  const [found, setFound] = useState(null)
  const [error, setError] = useState('')
  const [looking, setLooking] = useState(false)
  const [acting, setActing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [leaving, setLeaving] = useState(null)

  const lookup = async (value) => {
    setError('')
    setFound(null)
    setLooking(true)
    try {
      const { data } = await api.get(`/daily-help/lookup/${value}`)
      setFound({ ...data, code: value })
      return data
    } catch (err) {
      setError(errorMessage(err, 'Could not look up that code.'))
      return null
    } finally {
      setLooking(false)
    }
  }

  const check = async (value, action) => {
    const { data } = await api.post('/daily-help/check', { code: value, action })
    toast.success(data.message)
    await inside.reload()
    return data
  }

  const act = async () => {
    setActing(true)
    try {
      await check(found.code, found.next)
      setFound(null)
      setCode('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setActing(false)
    }
  }

  const onScan = (raw) => {
    setScanning(false)
    const read = readScan(raw)
    if (read.kind !== 'helper') return setError('That is not a daily help QR code.')
    setCode(read.code)
    lookup(read.code)
  }

  const helper = found?.helper
  const checkingIn = found?.next === 'in'

  return (
    <div className="space-y-5">
      <section className="panel p-5" aria-labelledby="helper-gate-h">
        <h2 id="helper-gate-h" className="text-base font-bold">Daily help at the gate</h2>
        <p className="mb-3 text-sm text-muted">Scan the helper's QR code or type the 6-digit code they say. It works the same way when they arrive and when they leave.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (code.length === 6) lookup(code) }} className="flex flex-wrap items-start gap-2">
          <input className="input w-44 text-center font-display text-xl tracking-[0.3em]" inputMode="numeric" maxLength={6} placeholder="______" aria-label="Helper code" autoComplete="off" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setFound(null) }} />
          <button className="btn-primary" type="submit" disabled={code.length !== 6 || looking}>{looking ? <Spinner className="h-4 w-4" /> : <FiSearch size={16} />} Find</button>
          <button className="btn-secondary" type="button" onClick={() => setScanning(true)}><FiCamera size={16} /> Scan QR</button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}

        {helper && (
          <div className="fade-in mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-sunken/60 p-4" role="status">
            <Avatar name={helper.name} src={helper.photo} size={52} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">{helper.name}</p>
              <p className="text-sm text-muted">{KIND[helper.kind] || 'Helper'}{helper.flats?.length ? ` · works at ${helper.flats.join(', ')}` : ''}</p>
              <p className="mt-1 text-sm font-semibold">{found.inside ? `Inside since ${clock(found.since)}` : 'Not inside right now'}</p>
            </div>
            <button className={checkingIn ? 'btn-primary' : 'btn-secondary'} onClick={act} disabled={acting}>
              {acting ? <Spinner className="h-4 w-4" /> : checkingIn ? <FiLogIn size={15} /> : <FiLogOut size={15} />} {checkingIn ? 'Check in' : 'Check out'}
            </button>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-bold">Inside now</h2>
          <span className="text-xs text-muted">{`Daily help · ${inside.data?.length ?? 0}`}</span>
        </div>
        {inside.loading ? <ListSkeleton rows={2} /> : inside.error ? <ErrorState message={inside.error} onRetry={inside.reload} /> : !inside.data?.length ? (
          <p className="px-4 py-6 text-sm text-muted">No daily help is inside right now.</p>
        ) : (
          <ul className="divide-y divide-line">
            {inside.data.map((h) => (
              <li key={h._id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <Avatar name={h.name} src={h.photo} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{h.name}</p>
                  <p className="truncate text-xs text-muted">{`${KIND[h.kind] || 'Helper'}${h.flats?.length ? ` · ${h.flats.join(', ')}` : ''}${h.today?.checkIn ? ` · in at ${clock(h.today.checkIn)}` : ''}`}</p>
                </div>
                <button className="btn-secondary btn-sm" onClick={() => setLeaving(h)}><FiLogOut size={14} /> Check out</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={scanning} onClose={() => setScanning(false)} title="Scan daily help QR" size="sm">
        {scanning && <QrScanner onScan={onScan} />}
      </Modal>

      <CodePrompt
        open={!!leaving}
        kind="helper"
        title={`Check out ${leaving?.name || ''}`}
        text={`Ask ${leaving?.name || 'the helper'} to show their QR code or say their 6-digit code.`}
        confirmLabel="Check out"
        onClose={() => setLeaving(null)}
        onSubmit={async (value) => {
          const data = await lookup(value).catch(() => null)
          // lookup() reports its own error in the box above, so say it here too.
          if (!data) return 'That code is not valid.'
          if (data.helper._id !== leaving._id) return `That code belongs to ${data.helper.name}, not ${leaving.name}.`
          try {
            await check(value, 'out')
            setLeaving(null)
            setFound(null)
            return ''
          } catch (err) {
            return errorMessage(err)
          }
        }}
      />
    </div>
  )
}

export default HelperGate
