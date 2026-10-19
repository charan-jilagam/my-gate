import { Navigate, useLocation } from 'react-router-dom'
import { FiClock, FiLogOut, FiRefreshCw } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { Logo } from './Layout'
import { BrandLoader, Spinner } from './ui'

export const FullPageSpinner = () => <BrandLoader />

const PendingApproval = () => {
  const { logout, refreshUser } = useAuth()
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="panel w-full max-w-md p-8 text-center">
        <Logo className="mb-6" />
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-soft text-ink">
          <FiClock size={22} />
        </span>
        <h1 className="text-2xl font-bold">Waiting for approval</h1>
        <p className="mt-2 text-sm text-muted">
          Your society admin needs to approve your account before you can sign in. You will get a notification as soon as
          it is done.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button className="btn-primary" onClick={refreshUser}>
            <FiRefreshCw size={16} /> Check again
          </button>
          <button className="btn-secondary" onClick={logout}>
            <FiLogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Guards a route. Pass `roles` to limit it to certain roles; everyone else is sent to the dashboard.
 */
const PrivateRoute = ({ children, roles }) => {
  const { isAuthenticated, loading, pendingApproval, user } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (pendingApproval) return <PendingApproval />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />

  return children
}

export default PrivateRoute
