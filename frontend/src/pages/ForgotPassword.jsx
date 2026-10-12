import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiMail } from 'react-icons/fi'
import api from '../services/api'
import AuthShell from '../components/AuthShell'
import { Field, Spinner, errorMessage } from '../components/ui'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err, 'Could not send the reset link. Try again in a few minutes.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we will send you a link that works for 10 minutes."
      footer={
        <Link to="/login" className="font-semibold text-brand hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="panel p-5" role="status">
          <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand">
            <FiMail size={18} />
          </span>
          <p className="font-display text-lg font-bold">Check your inbox</p>
          <p className="mt-1 text-sm text-muted">
            If {email} has an account, a reset link is on its way. It can take a minute to arrive, so look in spam too.
          </p>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={loading || !email}>
            {loading && <Spinner className="h-4 w-4" />}
            Send reset link
          </button>
        </form>
      )}
    </AuthShell>
  )
}

export default ForgotPassword
