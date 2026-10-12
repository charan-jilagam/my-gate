import { useEffect, useRef, useState } from 'react'
import { Spinner } from './ui'

/**
 * Opens the camera and calls onScan(text) once when a QR code is read.
 * Cameras only work on https:// pages or on localhost.
 */
const QrScanner = ({ onScan }) => {
  const id = useRef(`qr-${Math.random().toString(36).slice(2)}`)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const [state, setState] = useState('starting') // starting | scanning | error
  const [message, setMessage] = useState('')

  useEffect(() => {
    let scanner
    let cancelled = false
    let done = false

    ;(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return
        scanner = new Html5Qrcode(id.current)
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.75); return { width: s, height: s } } },
          (text) => {
            if (done) return
            done = true
            onScanRef.current?.(text)
          },
          () => {}
        )
        if (!cancelled) setState('scanning')
      } catch (err) {
        if (cancelled) return
        setState('error')
        const text = String(err?.message || err)
        if (!window.isSecureContext) setMessage('The camera only works on a secure (https) page. Type the pass code instead.')
        else if (/permission|denied|NotAllowed/i.test(text)) setMessage('Camera access was blocked. Allow the camera for this site in your browser settings, then try again.')
        else if (/NotFound|no camera|Requested device/i.test(text)) setMessage('No camera was found on this device.')
        else setMessage('The camera could not be started. Type the pass code instead.')
      }
    })()

    return () => {
      cancelled = true
      if (scanner) {
        const stop = scanner.isScanning ? scanner.stop() : Promise.resolve()
        stop.catch(() => {}).finally(() => { try { scanner.clear() } catch (e) { /* already cleared */ } })
      }
    }
  }, [])

  return (
    <div>
      <div id={id.current} className="mx-auto w-full max-w-sm overflow-hidden rounded-lg bg-black/80" style={{ minHeight: state === 'error' ? 0 : 260 }} />
      {state === 'starting' && (
        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Starting the camera…</p>
      )}
      {state === 'scanning' && <p className="mt-3 text-center text-sm text-muted">Point the camera at the visitor's QR code.</p>}
      {state === 'error' && <p role="alert" className="text-sm font-medium text-danger">{message}</p>}
    </div>
  )
}

export default QrScanner
