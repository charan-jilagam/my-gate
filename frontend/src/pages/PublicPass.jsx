import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { FiClock, FiCopy, FiMapPin, FiUser } from 'react-icons/fi'
import toast from 'react-hot-toast'
import api from '../services/api'
import { Spinner, formatDate } from '../components/ui'
import { Logo } from '../components/Layout'

const STATE_TEXT = {
  checked_in: 'You are inside. Show this pass again when you leave.',
  checked_out: 'This pass was already used. Ask your host to invite you again.',
  rejected: 'This invitation was cancelled by your host.',
  pending: 'Your host has not approved this visit yet.'
}

/** The page a guest opens from the link in their text message or email. No sign-in needed: the link is the secret. */
const PublicPass = () => {
  const { passId } = useParams()
  const [pass, setPass] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    api
      .get(`/public/pass/${passId}`)
      .then(({ data }) => alive && setPass(data.pass))
      .catch((e) => alive && setError(e?.response?.data?.message || 'This pass link is not valid.'))
    return () => {
      alive = false
    }
  }, [passId])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pass.code)
      toast.success('Pass code copied')
    } catch (e) {
      toast.error('Could not copy. Read the code out instead.')
    }
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-8">
      <div className="mx-auto max-w-sm">
        <div className="mb-5 flex justify-center"><Logo /></div>
        {!pass && !error && <div className="grid place-items-center py-20"><Spinner className="h-7 w-7 text-brand" /></div>}
        {error && <p role="alert" className="panel p-5 text-center text-sm font-medium text-danger">{error}</p>}
        {pass && (
          <div className="overflow-hidden rounded-2xl bg-brand text-brand-ink shadow-lift">
            <div className="px-5 pb-5 pt-4">
              <p className="text-xs font-semibold opacity-80">Nivora entry pass</p>
              <p className="mt-1 font-display text-2xl font-extrabold leading-tight">{pass.name}</p>
              <p className="mt-0.5 text-sm opacity-90">{`Invited by ${pass.host}`}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2"><dt className="flex items-center gap-1 text-xs opacity-75"><FiMapPin size={12} /> Where</dt><dd className="font-semibold">{[pass.society, pass.flat && `Flat ${pass.flat}`].filter(Boolean).join(', ')}</dd></div>
                {pass.floor ? <div><dt className="text-xs opacity-75">Floor</dt><dd className="font-semibold">{pass.floor}</dd></div> : null}
                <div><dt className="flex items-center gap-1 text-xs opacity-75"><FiUser size={12} /> People</dt><dd className="font-semibold">{pass.numberOfVisitors}</dd></div>
                <div className="col-span-2"><dt className="flex items-center gap-1 text-xs opacity-75"><FiClock size={12} /> Arriving</dt><dd className="font-semibold">{pass.expectedArrival ? formatDate(pass.expectedArrival, true) : 'Any time'}</dd></div>
                {pass.expiresAt ? <div className="col-span-2"><dt className="text-xs opacity-75">Valid until</dt><dd className="font-semibold">{formatDate(pass.expiresAt, true)}</dd></div> : null}
              </dl>
            </div>
            <div className="relative border-t-2 border-dashed border-brand-ink/30" aria-hidden="true" />
            <div className="bg-surface px-5 pb-5 pt-5 text-center text-ink">
              {pass.usable ? (
                <>
                  <div className="mx-auto inline-block rounded-xl bg-white p-2.5 ring-1 ring-edge"><QRCodeSVG value={pass.qr} size={176} /></div>
                  <p className="mt-3 text-xs font-semibold text-muted">Pass code for the guard</p>
                  <p className="font-mono text-2xl font-bold tracking-[0.25em]">{pass.code}</p>
                  <button className="btn-secondary btn-sm mt-3" onClick={copy}><FiCopy size={14} /> Copy code</button>
                  <p className="mt-4 text-sm text-muted">Show the QR code or tell the guard the pass code when you arrive and again when you leave.</p>
                </>
              ) : (
                <p className="py-4 text-sm font-medium text-muted">{pass.expired ? 'This pass has expired. Ask your host to extend it or invite you again.' : STATE_TEXT[pass.status] || 'This pass can not be used.'}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PublicPass
