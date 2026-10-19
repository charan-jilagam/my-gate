import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FiEye, FiEyeOff, FiLock, FiMail } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import AuthShell from '../components/AuthShell'
import { Field, Spinner } from '../components/ui'

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(formData.email.trim(), formData.password)
    setLoading(false)

    if (result.success) {
      navigate(location.state?.from || '/dashboard', { replace: true })
    } else if (result.needsVerification) {
      toast(result.message)
      navigate('/verify', { replace: true, state: { email: result.email, password: formData.password, channels: result.channels, hints: result.hints, delivery: result.delivery } })
    } else {
      setError(result.message)
      toast.error(result.message)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use the email you registered with."
      footer={
        <>
          New to your society on Nivora?{' '}
          <Link to="/register" className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <Field label="Email" htmlFor="email">
          <div className="relative">
            <FiMail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={17} aria-hidden="true" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="input pl-10"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
            />
          </div>
        </Field>

        <Field label="Password" htmlFor="password">
          <div className="relative">
            <FiLock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={17} aria-hidden="true" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className="input pl-10 pr-11"
              value={formData.password}
              onChange={handleChange}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
            </button>
          </div>
        </Field>

        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end">
          <Link to="/forgot-password" className="text-sm font-semibold text-brand hover:underline">
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={loading || !formData.email || !formData.password} className="btn-primary min-h-[48px] w-full text-base">
          {loading && <Spinner className="h-4 w-4" />}
          {loading ? 'Signing in' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}

export default Login
