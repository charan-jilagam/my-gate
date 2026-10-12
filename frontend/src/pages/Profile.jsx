import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { Field, PageHeader, Spinner, errorMessage, titleCase } from '../components/ui'

const Profile = () => {
  const { user, refreshUser } = useAuth()
  const [profile, setProfile] = useState({ name: user?.name || '', phone: user?.phone || '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)
  const [pwError, setPwError] = useState('')

  const saveProfile = async (e) => {
    e.preventDefault()
    setProfileError('')
    if (!profile.name.trim()) return setProfileError('Enter your name.')
    if (!/^[0-9]{10}$/.test(profile.phone)) return setProfileError('Enter a 10-digit mobile number.')
    setSavingProfile(true)
    try {
      await api.put('/users/profile', { name: profile.name.trim(), phone: profile.phone })
      await refreshUser()
      toast.success('Profile saved')
    } catch (err) {
      setProfileError(errorMessage(err, 'Could not save your profile.'))
    } finally {
      setSavingProfile(false)
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    setPwError('')
    if (pw.newPassword.length < 6) return setPwError('Use at least 6 characters for the new password.')
    if (pw.newPassword !== pw.confirm) return setPwError('The two new passwords do not match.')
    setSavingPw(true)
    try {
      await api.put('/auth/update-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword })
      setPw({ currentPassword: '', newPassword: '', confirm: '' })
      toast.success('Password changed')
    } catch (err) {
      setPwError(errorMessage(err, 'Could not change your password.'))
    } finally {
      setSavingPw(false)
    }
  }

  const society = user?.societyId?.name
  const details = [
    ['Email', user?.email],
    ['Role', titleCase(user?.role)],
    ...(society ? [['Society', society]] : []),
    ...(user?.flatNo ? [['Flat', `${user.block ? `${user.block}-` : ''}${user.flatNo}`]] : [])
  ]

  return (
    <>
      <PageHeader title="Profile" subtitle="Your details and sign-in settings." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="panel p-5">
          <div className="mb-5 flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-brand font-display text-xl font-bold text-brand-ink">
              {(user?.name || '?').trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-bold">{user?.name}</p>
              <p className="truncate text-sm text-muted">{user?.email}</p>
            </div>
          </div>
          <dl className="mb-5 grid grid-cols-2 gap-3 text-sm">
            {details.map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <form onSubmit={saveProfile} className="space-y-4 border-t border-line pt-5">
            <Field label="Full name" htmlFor="p-name">
              <input id="p-name" className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Mobile number" htmlFor="p-phone">
              <input id="p-phone" type="tel" inputMode="numeric" maxLength={10} className="input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </Field>
            {profileError && <p role="alert" className="text-sm font-medium text-danger">{profileError}</p>}
            <button className="btn-primary" disabled={savingProfile}>
              {savingProfile && <Spinner className="h-4 w-4" />}
              Save changes
            </button>
          </form>
        </section>

        <section className="panel h-fit p-5">
          <h2 className="mb-4 text-lg font-bold">Change password</h2>
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="Current password" htmlFor="pw-current">
              <input id="pw-current" type="password" autoComplete="current-password" className="input" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </Field>
            <Field label="New password" htmlFor="pw-new" hint="At least 6 characters.">
              <input id="pw-new" type="password" autoComplete="new-password" className="input" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
            </Field>
            <Field label="Confirm new password" htmlFor="pw-confirm">
              <input id="pw-confirm" type="password" autoComplete="new-password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </Field>
            {pwError && <p role="alert" className="text-sm font-medium text-danger">{pwError}</p>}
            <button className="btn-secondary" disabled={savingPw || !pw.currentPassword}>
              {savingPw && <Spinner className="h-4 w-4" />}
              Change password
            </button>
          </form>
        </section>
      </div>
    </>
  )
}

export default Profile
