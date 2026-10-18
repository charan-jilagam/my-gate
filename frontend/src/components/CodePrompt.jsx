import { useEffect, useState } from 'react'
import { FiCamera, FiCheckCircle } from 'react-icons/fi'
import { Modal, Spinner } from './ui'
import QrScanner from './QrScanner'
import { readScan } from '../utils/pass'

/**
 * The guard proves a person is who they say by scanning their QR code or typing the code they read out.
 * `kind` is 'visitor' (8 letters and digits) or 'helper' (6 digits).
 * `onSubmit(code)` returns an error message to show, or nothing when it worked (the prompt then closes).
 */
const CodePrompt = ({ open, title, text, kind = 'visitor', confirmLabel = 'Confirm', onClose, onSubmit }) => {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const size = kind === 'helper' ? 6 : 8

  useEffect(() => {
    if (open) {
      setCode('')
      setError('')
      setScanning(false)
      setBusy(false)
    }
  }, [open])

  const send = async (value) => {
    setError('')
    setBusy(true)
    try {
      const message = await onSubmit(value)
      if (message) setError(message)
    } finally {
      setBusy(false)
    }
  }

  const onScan = (raw) => {
    setScanning(false)
    const read = readScan(raw)
    if (read.kind !== kind) return setError(kind === 'helper' ? 'That is not a daily help QR code.' : 'That is not a visitor pass.')
    setCode(read.code)
    send(read.code)
  }

  const clean = (v) => (kind === 'helper' ? v.replace(/\D/g, '') : v.replace(/[^0-9a-fA-F]/g, '').toUpperCase())

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        scanning ? (
          <button className="btn-secondary" onClick={() => setScanning(false)}>Back to typing</button>
        ) : (
          <>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" form="code-form" type="submit" disabled={busy || code.length < size}>
              {busy ? <Spinner className="h-4 w-4" /> : <FiCheckCircle size={15} />} {confirmLabel}
            </button>
          </>
        )
      }
    >
      {scanning ? (
        <QrScanner onScan={onScan} />
      ) : (
        <form id="code-form" onSubmit={(e) => { e.preventDefault(); if (code.length >= size) send(code) }}>
          {text && <p className="mb-4 text-sm text-muted">{text}</p>}
          <label htmlFor="gate-code" className="label">{kind === 'helper' ? 'Gate code' : 'Pass code'}</label>
          <input
            id="gate-code"
            autoFocus
            autoComplete="off"
            inputMode={kind === 'helper' ? 'numeric' : 'text'}
            maxLength={size}
            className="input text-center font-mono text-2xl font-bold tracking-[0.3em]"
            placeholder={kind === 'helper' ? '000000' : 'A1B2C3D4'}
            value={code}
            onChange={(e) => setCode(clean(e.target.value))}
          />
          <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setScanning(true)}>
            <FiCamera size={16} /> Scan the QR code instead
          </button>
          {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
        </form>
      )}
      {scanning && error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
    </Modal>
  )
}

export default CodePrompt
