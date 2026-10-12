// Uploaded images may be stored by the API itself ("/uploads/x.jpg") or on Cloudinary (a full URL).
const API_ORIGIN = (() => {
  try {
    return import.meta.env.VITE_API_URL ? new URL(import.meta.env.VITE_API_URL, window.location.origin).origin : ''
  } catch (e) {
    return ''
  }
})()

export const imgSrc = (url) => (url && url.startsWith('/') ? `${API_ORIGIN}${url}` : url)
