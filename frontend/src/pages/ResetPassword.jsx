import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../services/api'
import AuthShell from '../components/AuthShell'
import { Field, Spinner, errorMessage } from '../components/ui'

const ResetPassword = () => {
  const { token } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('Use at least 6 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')

    setLoading(true)
    try {
      await api.put(`/auth/reset-password/${token}`, { password })
      toast.success('Password changed. Sign in with your new password.')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'This link has expired. Request a new one.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      footer={
        <Link to="/forgot-password" className="font-semibold text-brand hover:underline">
          Request a new link
        </Link>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <Field label="New password" htmlFor="password" hint="At least 6 characters.">
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
          Change password
        </button>
      </form>
    </AuthShell>
  )
}

export default ResetPassword
