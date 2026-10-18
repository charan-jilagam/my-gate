import { useEffect, useState } from 'react'
import { FiCopy } from 'react-icons/fi'
import toast from 'react-hot-toast'
import api from '../services/api'
import { Avatar, Modal, Spinner, errorMessage } from './ui'

/** The QR code and 6-digit code a daily-help worker shows at the gate, both coming in and going out. */
const HelperPass = ({ helper, onClose }) => {
  const [pass, setPass] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!helper) return undefined
    let live = true
    setPass(null)
    setError('')
    api.get(`/daily-help/${helper._id}/pass`)
      .then((res) => live && setPass(res.data))
      .catch((err) => live && setError(errorMessage(err, 'Could not load the pass.')))
    return () => { live = false }
  }, [helper])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pass.code)
      toast.success('Code copied')
    } catch (e) {
      toast.error('Could not copy. Read the code out instead.')
    }
  }

  return (
    <Modal open={!!helper} onClose={onClose} title="Gate pass" size="sm" footer={<button className="btn-primary" onClick={onClose}>Done</button>}>
      {helper && (
        <div className="text-center">
          <Avatar name={helper.name} src={helper.photo} size={56} className="mx-auto" />
          <p className="mt-2 font-display text-xl font-extrabold">{helper.name}</p>
          <p className="text-sm text-muted">Daily help pass</p>
          <div className="mx-auto mt-4 grid h-52 w-52 place-items-center rounded-xl bg-white p-2 ring-1 ring-line">
            {pass ? <img src={pass.qrCodeImage} alt={`QR code for ${helper.name}`} className="h-full w-full" /> : error ? <p role="alert" className="px-3 text-sm text-danger">{error}</p> : <Spinner className="h-6 w-6 text-brand" />}
          </div>
          {pass && (
            <>
              <p className="mt-3 text-xs font-semibold text-muted">Gate code</p>
              <p className="font-mono text-2xl font-bold tracking-[0.25em]">{pass.code}</p>
              <button className="btn-secondary btn-sm mt-3" onClick={copy}><FiCopy size={14} /> Copy code</button>
            </>
          )}
          <p className="mt-4 text-sm text-muted">They show this to the guard when they arrive and again when they leave.</p>
        </div>
      )}
    </Modal>
  )
}

export default HelperPass
