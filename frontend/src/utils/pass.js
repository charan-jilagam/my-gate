// A visitor's QR payload is JSON. The short pass code (first 8 characters of its id) lets a guard
// find the visitor by typing when scanning is not an option.
export const passCode = (item) => {
  try {
    const id = JSON.parse(item.qrCode)?.visitorId
    return id ? id.slice(0, 8).toUpperCase() : null
  } catch (e) {
    return null
  }
}

/**
 * What a scanned QR code means. Visitor passes carry a JSON visitorId; daily-help passes carry type "daily_help".
 * Anything else that looks like a code typed by hand is passed through so the guard can still use it.
 */
export const readScan = (text) => {
  try {
    const data = JSON.parse(text)
    if (data?.type === 'daily_help' && /^\d{6}$/.test(String(data.code))) return { kind: 'helper', code: String(data.code) }
    if (data?.visitorId) return { kind: 'visitor', code: String(data.visitorId).slice(0, 8).toUpperCase() }
  } catch (e) {
    /* not JSON: treat as typed text below */
  }
  const plain = String(text || '').trim()
  if (/^\d{6}$/.test(plain)) return { kind: 'helper', code: plain }
  if (/^[0-9a-fA-F]{8,32}$/.test(plain)) return { kind: 'visitor', code: plain.slice(0, 8).toUpperCase() }
  return { kind: 'unknown', code: '' }
}
