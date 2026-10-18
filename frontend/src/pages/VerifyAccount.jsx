import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiCheckCircle, FiMail, FiSmartphone } from 'react-icons/fi'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import AuthShell from '../components/AuthShell'
import { Field, Spinner, errorMessage } from '../components/ui'

const COOLDOWN = 30

const CHANNEL = {
  email: { label: 'Email code', icon: FiMail, field: 'emailCode' },
  phone: { label: 'Mobile code', icon: FiSmartphone, field: 'phoneCode' }
}

/** Where the code went, in words the person can check against their own email and number. */
const whereText = (channel, hints) => (channel === 'email' ? `sent to ${hints?.email || 'your email'}` : `sent by text to ${hints?.phone || 'your mobile'}`)

// While developing there may be no mail server or SMS gateway. The code is then printed in the backend terminal.
const devNote = (channel, delivery) =>
  delivery?.sent?.[channel] === 'console'
    ? `${channel === 'email' ? 'Email' : 'SMS'} is not set up on this server, so the code is printed in the backend terminal.`
    : delivery?.errors?.[channel] || ''

const VerifyAccount = () => {
  const { state } = useLocation()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [pending, setPending] = useState(state?.channels || ['email'])
  const [codes, setCodes] = useState({ email: '', phone: '' })
  const [delivery, setDelivery] = useState(state?.delivery)
  const [wait, setWait] = useState({ email: COOLDOWN, phone: COOLDOWN })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setInterval(() => setWait((w) => ({ email: Math.max(0, w.email - 1), phone: Math.max(0, w.phone - 1) })), 1000)
    return () => clearInterval(t)
  }, [])

  if (!state?.email) return <Navigate to="/login" replace />

  const resend = async (channel) => {
    setError('')
    try {
      const { data } = await api.post('/auth/otp/send', { email: state.email, channel })
      setDelivery((d) => ({ ...d, sent: { ...(d?.sent || {}), [channel]: data.delivery }, errors: { ...(d?.errors || {}), [channel]: '' } }))
      setWait((w) => ({ ...w, [channel]: COOLDOWN }))
      toast.success('A new code is on its way.')
    } catch (err) {
      setError(errorMessage(err, 'Could not send a new code.'))
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const body = { email: state.email }
    pending.forEach((c) => { if (codes[c]) body[CHANNEL[c].field] = codes[c] })
    if (!body.emailCode && !body.phoneCode) return setError('Enter the code you received.')
    setBusy(true)
    try {
      const { data } = await api.post('/auth/otp/verify', body)
      setPending(data.pending)
      if (!data.done) return toast.success(data.message)
      toast.success('Verified')
      // Sign in straight away when the password is still at hand, otherwise ask for it.
      const result = state.password ? await login(state.email, state.password) : { success: false }
      if (result.success) navigate('/dashboard', { replace: true })
      else navigate('/login', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'That code did not work.'))
      // A right code is kept even when the other one was wrong, so only what is left is asked again.
      if (err.response?.data?.pending) setPending(err.response.data.pending)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Verify your account"
      subtitle="Enter the code we sent so we know this email and mobile number are yours."
      footer={<>Wrong details? <Link to="/register" className="font-semibold text-brand hover:underline">Start again</Link></>}
    >
      <form className="space-y-5" onSubmit={submit} noValidate>
        {pending.length === 0 && (
          <p className="flex items-center gap-2 rounded-lg bg-ok-soft px-3 py-2.5 text-sm font-semibold text-ok"><FiCheckCircle size={16} /> All verified.</p>
        )}
        {pending.map((c) => {
          const Icon = CHANNEL[c].icon
          const note = devNote(c, delivery)
          return (
            <div key={c}>
              <Field label={CHANNEL[c].label} htmlFor={`code-${c}`} hint={`6 digits, ${whereText(c, state.hints)}.`}>
                <div className="relative">
                  <Icon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input id={`code-${c}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input pl-10 font-mono text-lg tracking-[0.35em]" placeholder="000000" value={codes[c]} onChange={(e) => setCodes({ ...codes, [c]: e.target.value.replace(/\D/g, '') })} />
                </div>
              </Field>
              {note && <p className="mt-1.5 text-xs text-muted">{note}</p>}
              <button type="button" className="mt-1.5 text-sm font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline" disabled={wait[c] > 0} onClick={() => resend(c)}>
                {wait[c] > 0 ? `Send again in ${wait[c]}s` : 'Send the code again'}
              </button>
            </div>
          )
        })}
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy || pending.length === 0}>
          {busy && <Spinner className="h-4 w-4" />} {busy ? 'Checking' : 'Verify'}
        </button>
      </form>
    </AuthShell>
  )
}

export default VerifyAccount
