import api from '../services/api'

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const toKey = (base64) => {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export const currentSubscription = async () => {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  return reg ? reg.pushManager.getSubscription() : null
}

export const enablePush = async (publicKey) => {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser settings.')
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }))
  await api.post('/push/subscribe', sub.toJSON())
}

export const disablePush = async () => {
  const sub = await currentSubscription()
  if (!sub) return
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}
