import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import AuthShell from '../components/AuthShell'
import { Field, Spinner } from '../components/ui'

const ROLES = [
  { value: 'resident', label: 'Resident' },
  { value: 'security', label: 'Security guard' },
  { value: 'staff', label: 'Society staff' },
  { value: 'vendor', label: 'Vendor' }
]

const validate = (f) => {
  const e = {}
  if (!f.name.trim()) e.name = 'Enter your full name.'
  if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email address.'
  if (!/^[0-9]{10}$/.test(f.phone)) e.phone = 'Enter a 10-digit mobile number.'
  if (f.password.length < 6) e.password = 'Use at least 6 characters.'
  if (!f.societyId) e.societyId = 'Choose your society.'
  if (f.role === 'resident' && !f.flatNo.trim()) e.flatNo = 'Enter your flat number.'
  return e
}

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'resident',
    societyId: '',
    flatNo: '',
    block: ''
  })
  const [societies, setSocieties] = useState([])
  const [societiesLoaded, setSocietiesLoaded] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    api
      .get('/societies/public')
      .then((res) => setSocieties(res.data.societies || []))
      .catch(() => setSocieties([]))
      .finally(() => setSocietiesLoaded(true))
  }, [])

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: undefined })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = validate(formData)
    setErrors(found)
    if (Object.keys(found).length) return

    setLoading(true)
    const payload = { ...formData, name: formData.name.trim(), email: formData.email.trim() }
    if (payload.role !== 'resident') {
      delete payload.flatNo
      delete payload.block
    }
    const result = await register(payload)
    setLoading(false)

    if (result.success) {
      toast.success(result.message || 'Account created')
      navigate('/dashboard', { replace: true })
    } else {
      toast.error(result.message)
    }
  }

  const isResident = formData.role === 'resident'

  return (
    <AuthShell
      title="Create your account"
      subtitle="Residents are approved by their society admin before first sign-in."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Field label="Full name" htmlFor="name" error={errors.name}>
          <input id="name" name="name" autoComplete="name" className="input" value={formData.name} onChange={handleChange} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" error={errors.email}>
            <input id="email" name="email" type="email" autoComplete="email" className="input" value={formData.email} onChange={handleChange} />
          </Field>
          <Field label="Mobile number" htmlFor="phone" error={errors.phone}>
            <input id="phone" name="phone" type="tel" inputMode="numeric" maxLength={10} autoComplete="tel-national" className="input" value={formData.phone} onChange={handleChange} />
          </Field>
        </div>

        <Field label="Password" htmlFor="password" error={errors.password} hint="At least 6 characters.">
          <input id="password" name="password" type="password" autoComplete="new-password" className="input" value={formData.password} onChange={handleChange} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="I am a" htmlFor="role">
            <select id="role" name="role" className="input" value={formData.role} onChange={handleChange}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Society"
            htmlFor="societyId"
            error={errors.societyId}
            hint={societiesLoaded && societies.length === 0 ? 'No societies yet. Ask your admin to add yours.' : undefined}
          >
            <select id="societyId" name="societyId" className="input" value={formData.societyId} onChange={handleChange}>
              <option value="">{societiesLoaded ? 'Select society' : 'Loading...'}</option>
              {societies.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                  {s.address?.city ? `, ${s.address.city}` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {isResident && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Block or tower" htmlFor="block" hint="Optional">
              <input id="block" name="block" className="input" value={formData.block} onChange={handleChange} />
            </Field>
            <Field label="Flat number" htmlFor="flatNo" error={errors.flatNo}>
              <input id="flatNo" name="flatNo" className="input" value={formData.flatNo} onChange={handleChange} />
            </Field>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading && <Spinner className="h-4 w-4" />}
          {loading ? 'Creating account' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  )
}

export default Register
