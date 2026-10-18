import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../services/api'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

// The API returns `_id` on /auth/me and `id` on login; components always read `id`.
const normalizeUser = (u) => (u ? { ...u, id: u.id || u._id } : u)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingApproval, setPendingApproval] = useState(false)
  const [token, setToken] = useState(localStorage.getItem('token'))

  const clearSession = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    setPendingApproval(false)
  }, [])

  const fetchUser = useCallback(async () => {
    try {
      const response = await api.get('/auth/me')
      setUser(normalizeUser(response.data.user))
      setPendingApproval(false)
    } catch (error) {
      // A resident who has registered but is not approved yet gets 403 from the API.
      if (error.response?.status === 403) {
        setUser(null)
        setPendingApproval(true)
      } else if (error.response?.status === 401) {
        clearSession()
      } else {
        // Network or server trouble: keep the token so a refresh can recover.
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [clearSession])

  useEffect(() => {
    if (token) {
      fetchUser()
    } else {
      setLoading(false)
    }
  }, [token, fetchUser])

  const startSession = (newToken) => {
    localStorage.setItem('token', newToken)
    setLoading(true)
    setToken(newToken)
  }

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password })
      startSession(response.data.token)
      return { success: true }
    } catch (error) {
      // A new account has to prove its email (and mobile) before it can sign in.
      if (error.response?.data?.needsVerification) return { success: false, ...error.response.data }
      return {
        success: false,
        message: error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || 'Could not sign in. Check your connection and try again.'
      }
    }
  }

  const register = async (userData) => {
    try {
      const response = await api.post('/auth/register', userData)
      // Registration no longer signs anyone in: the codes sent to their email and mobile come first.
      if (response.data.needsVerification) return { success: true, ...response.data }
      startSession(response.data.token)
      return { success: true, message: response.data.message }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.errors?.map((e) => e.msg).join('. ') || error.response?.data?.message || 'Could not create the account. Try again.'
      }
    }
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      pendingApproval,
      login,
      register,
      logout: clearSession,
      refreshUser: fetchUser,
      isAuthenticated: !!user,
      isResident: user?.role === 'resident',
      isSuperAdmin: user?.role === 'super_admin',
      isAdmin: ['society_admin', 'super_admin'].includes(user?.role),
      isSecurity: user?.role === 'security'
    }),
    // login/register only close over stable setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading, pendingApproval, clearSession, fetchUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
