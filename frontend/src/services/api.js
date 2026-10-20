import axios from 'axios'
import { markStale } from '../utils/apiCache'

// Dev: Vite proxies /api to the backend. Production: same origin, or set VITE_API_URL (e.g. https://api.example.com/api).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password']

// Calls that fire in the background (location pings, push settings, sign-in) must not make every screen reload.
const QUIET = ['/guards/ping', '/push/', '/auth/login', '/auth/register', '/auth/otp', '/auth/forgot', '/auth/reset', '/nearby/']

api.interceptors.response.use(
  (response) => {
    const method = (response.config?.method || 'get').toLowerCase()
    const url = response.config?.url || ''
    if (method !== 'get' && !QUIET.some((q) => url.includes(q))) markStale()
    return response
  },
  (error) => {
    const url = error.config?.url || ''
    const isPublicAuthCall = PUBLIC_AUTH_PATHS.some((p) => url.includes(p))
    // An expired or invalid session sends the user to sign in, but a wrong password must stay on the form.
    if (error.response?.status === 401 && !isPublicAuthCall) {
      localStorage.removeItem('token')
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
