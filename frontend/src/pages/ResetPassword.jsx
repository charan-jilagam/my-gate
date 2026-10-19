import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../services/api'
import AuthShell from '../components/AuthShell'
import { Field, Spinner, errorMessage } from '../components/ui'

const ResetPassword = () => {
  const { token } = useParams()
  const navigate = useNavigate()
  // A link from an admin who created the account says "choose a password", not "reset".
  const welcome = useSearchParams()[0].get('welcome') === '1'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('Use at least 8 characters with a letter and a number.')
    if (password !== confirm) return setError('The two passwords do not match.')

    setLoading(true)
    try {
      await api.put(`/auth/reset-password/${token}`, { password })
      toast.success(welcome ? 'Password saved. Sign in to start.' : 'Password changed. Sign in with your new password.')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'This link has expired. Request a new one.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={welcome ? 'Welcome! Choose your password' : 'Choose a new password'}
      footer={
        <Link to="/forgot-password" className="font-semibold text-brand hover:underline">
          Request a new link
        </Link>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <Field label={welcome ? 'Password' : 'New password'} htmlFor="password" hint="At least 8 characters, with a letter and a number.">
          <input id="password" type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <input id="confirm" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading && <Spinner className="h-4 w-4" />}
          {welcome ? 'Save password' : 'Change password'}
        </button>
      </form>
    </AuthShell>
  )
}

export default ResetPassword
