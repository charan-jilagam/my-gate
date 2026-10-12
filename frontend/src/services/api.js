import axios from 'axios'

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

api.interceptors.response.use(
  (response) => response,
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
