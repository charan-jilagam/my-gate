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
