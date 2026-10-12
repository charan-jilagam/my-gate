import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { Field, PageHeader, Spinner, errorMessage, titleCase } from '../components/ui'
import { uploadImage } from '../components/ImageUpload'
import { imgSrc } from '../utils/media'
import { currentSubscription, disablePush, enablePush, pushSupported } from '../utils/push'

const Profile = () => {
  const { user, refreshUser } = useAuth()
  const [profile, setProfile] = useState({ name: user?.name || '', phone: user?.phone || '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)
  const [pwError, setPwError] = useState('')

  // Profile photo
  const photoInput = useRef(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const changePhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    try {
      const { url } = await uploadImage(file)
      await api.put('/users/profile', { profilePic: url })
      await refreshUser()
      toast.success('Photo updated')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update your photo.'))
    } finally {
      setPhotoBusy(false)
    }
  }
  const removePhoto = async () => {
    setPhotoBusy(true)
    try {
      await api.put('/users/profile', { profilePic: '' })
      await refreshUser()
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove your photo.'))
    } finally {
      setPhotoBusy(false)
    }
  }

  // Notification settings
  const [notif, setNotif] = useState(null) // server abilities + this user's choices
  const [deviceOn, setDeviceOn] = useState(false)
  const [notifBusy, setNotifBusy] = useState(false)
  useEffect(() => {
    api.get('/push/config').then(({ data }) => setNotif(data)).catch(() => {})
    currentSubscription().then((s) => setDeviceOn(!!s)).catch(() => {})
  }, [])
  const toggleDevice = async () => {
    setNotifBusy(true)
    try {
      if (deviceOn) {
        await disablePush()
        setDeviceOn(false)
        toast.success('Notifications are off for this device')
      } else {
        await enablePush(notif.publicKey)
        setDeviceOn(true)
        toast.success('Notifications are on for this device')
      }
    } catch (err) {
      toast.error(err?.response ? errorMessage(err) : err?.message || 'Could not change notifications.')
    } finally {
      setNotifBusy(false)
    }
  }
  const toggleSms = async () => {
    const next = !notif.prefs.sms
    setNotif({ ...notif, prefs: { ...notif.prefs, sms: next } })
    try {
      await api.put('/push/prefs', { sms: next })
    } catch (err) {
      setNotif({ ...notif, prefs: { ...notif.prefs, sms: !next } })
      toast.error(errorMessage(err, 'Could not save that.'))
    }
  }

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
    if (pw.newPassword.length < 8 || !/[A-Za-z]/.test(pw.newPassword) || !/\d/.test(pw.newPassword)) return setPwError('Use at least 8 characters with a letter and a number.')
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
            {user?.profilePic ? (
              <img src={imgSrc(user.profilePic)} alt="" className="h-14 w-14 rounded-full object-cover ring-1 ring-line" />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-full bg-brand font-display text-xl font-bold text-brand-ink">
                {(user?.name || '?').trim().charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-bold">{user?.name}</p>
              <p className="truncate text-sm text-muted">{user?.email}</p>
              <div className="mt-1 flex gap-3 text-sm">
                <button type="button" className="font-semibold text-brand hover:underline" disabled={photoBusy} onClick={() => photoInput.current?.click()}>
                  {photoBusy ? 'Uploading…' : user?.profilePic ? 'Change photo' : 'Add photo'}
                </button>
                {user?.profilePic && !photoBusy && <button type="button" className="text-muted hover:underline" onClick={removePhoto}>Remove</button>}
              </div>
              <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Profile photo" onChange={changePhoto} />
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

        <div className="space-y-6">
        <section className="panel h-fit p-5">
          <h2 className="mb-1 text-lg font-bold">Notifications</h2>
          <p className="mb-4 text-sm text-muted">In-app alerts are always on. You can also get alerts on this device and by text message.</p>
          {!notif ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between gap-4">
                <span>
                  <span className="block font-semibold">This device</span>
                  <span className="text-muted">
                    {!notif.pushEnabled
                      ? 'Not set up on this server yet.'
                      : !pushSupported()
                        ? 'This browser does not support notifications.'
                        : 'Alerts even when the app is closed.'}
                  </span>
                </span>
                <button className={deviceOn ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} disabled={notifBusy || !notif.pushEnabled || !pushSupported()} onClick={toggleDevice}>
                  {notifBusy && <Spinner className="h-3.5 w-3.5" />}
                  {deviceOn ? 'Turn off' : 'Turn on'}
                </button>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span>
                  <span className="block font-semibold">Text messages</span>
                  <span className="text-muted">{notif.smsEnabled ? 'Visitor at the gate, deliveries, dues and approvals.' : 'Not set up on this server yet.'}</span>
                </span>
                <button className={notif.prefs.sms ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} disabled={!notif.smsEnabled} onClick={toggleSms}>
                  {notif.prefs.sms ? 'Turn off' : 'Turn on'}
                </button>
              </li>
            </ul>
          )}
        </section>

        <section className="panel h-fit p-5">
          <h2 className="mb-4 text-lg font-bold">Change password</h2>
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="Current password" htmlFor="pw-current">
              <input id="pw-current" type="password" autoComplete="current-password" className="input" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </Field>
            <Field label="New password" htmlFor="pw-new" hint="At least 8 characters, with a letter and a number.">
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
      </div>
    </>
  )
}

export default Profile
