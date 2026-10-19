// Phone location helpers.

export const locationSupported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator

// One position, as a promise. Rejects with a short, plain message that is safe to show to anyone.
export const getPosition = ({ timeout = 12000, highAccuracy = true } = {}) =>
  new Promise((resolve, reject) => {
    if (!locationSupported()) return reject(new Error('This phone or browser cannot share its location.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy || 0) }),
      (err) => {
        const messages = {
          1: 'Location is switched off for this app. Turn it on in your browser settings, then try again.',
          2: 'We could not find your location. Move to an open place and try again.',
          3: 'Finding your location took too long. Try again.'
        }
        reject(new Error(messages[err.code] || 'Could not get your location.'))
      },
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 15000 }
    )
  })

// Like getPosition, but gives back null instead of failing, for places where location is a bonus.
export const tryPosition = async (options) => {
  try {
    return await getPosition(options)
  } catch (e) {
    return null
  }
}

// "Permission is granted / asked / blocked" where the browser can tell us (it cannot on some iPhones).
export const locationPermission = async () => {
  try {
    if (!navigator.permissions?.query) return 'unknown'
    const r = await navigator.permissions.query({ name: 'geolocation' })
    return r.state // granted | prompt | denied
  } catch (e) {
    return 'unknown'
  }
}

export const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`

// "40 m" or "1.2 km"
export const distanceLabel = (m) => {
  if (m === null || m === undefined || Number.isNaN(Number(m))) return ''
  const n = Number(m)
  return n < 1000 ? `${Math.round(n)} m` : `${(n / 1000).toFixed(1)} km`
}

// "2 min ago" for a recent time
export const agoLabel = (iso) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`
}
