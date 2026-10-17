import { imgSrc } from '../utils/media'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  FiBell,
  FiCalendar,
  FiCheckCircle,
  FiCreditCard,
  FiFileText,
  FiGrid,
  FiHome,
  FiLogOut,
  FiMenu,
  FiMoon,
  FiPackage,
  FiShield,
  FiSun,
  FiTool,
  FiTruck,
  FiUser,
  FiUsers,
  FiX
} from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import api from '../services/api'
import { formatDate } from './ui'

const NAV = {
  common: [{ to: '/dashboard', icon: FiGrid, label: 'Home' }],
  resident: [
    { to: '/visitors', icon: FiUsers, label: 'Visitors' },
    { to: '/deliveries', icon: FiPackage, label: 'Deliveries' },
    { to: '/vehicles', icon: FiTruck, label: 'Vehicles' },
    { to: '/notices', icon: FiBell, label: 'Notices' },
    { to: '/complaints', icon: FiFileText, label: 'Complaints' },
    { to: '/payments', icon: FiCreditCard, label: 'Payments' },
    { to: '/bookings', icon: FiCalendar, label: 'Amenities' },
    { to: '/services', icon: FiTool, label: 'Services' }
  ],
  security: [
    { to: '/gate', icon: FiShield, label: 'Gate console' },
    { to: '/visitors', icon: FiUsers, label: 'Visitors' },
    { to: '/deliveries', icon: FiPackage, label: 'Deliveries' },
    { to: '/vehicles', icon: FiTruck, label: 'Vehicles' },
    { to: '/notices', icon: FiBell, label: 'Notices' }
  ],
  society_admin: [
    { to: '/admin/residents', icon: FiCheckCircle, label: 'People' },
    { to: '/gate', icon: FiShield, label: 'Gate console' },
    { to: '/visitors', icon: FiUsers, label: 'Visitors' },
    { to: '/deliveries', icon: FiPackage, label: 'Deliveries' },
    { to: '/vehicles', icon: FiTruck, label: 'Vehicles' },
    { to: '/notices', icon: FiBell, label: 'Notices' },
    { to: '/complaints', icon: FiFileText, label: 'Complaints' },
    { to: '/payments', icon: FiCreditCard, label: 'Payments' },
    { to: '/bookings', icon: FiCalendar, label: 'Amenities' },
    { to: '/admin/services', icon: FiTool, label: 'Services' },
    { to: '/admin/societies', icon: FiHome, label: 'Society' }
  ],
  super_admin: [
    { to: '/admin/societies', icon: FiHome, label: 'Societies' },
    { to: '/admin/residents', icon: FiCheckCircle, label: 'People' },
    { to: '/visitors', icon: FiUsers, label: 'Visitors' },
    { to: '/deliveries', icon: FiPackage, label: 'Deliveries' },
    { to: '/vehicles', icon: FiTruck, label: 'Vehicles' },
    { to: '/notices', icon: FiBell, label: 'Notices' },
    { to: '/complaints', icon: FiFileText, label: 'Complaints' },
    { to: '/payments', icon: FiCreditCard, label: 'Payments' },
    { to: '/bookings', icon: FiCalendar, label: 'Amenities' },
    { to: '/admin/services', icon: FiTool, label: 'Services' }
  ],
  staff: [
    { to: '/complaints', icon: FiFileText, label: 'Complaints' },
    { to: '/notices', icon: FiBell, label: 'Notices' }
  ],
  vendor: [
    { to: '/work', icon: FiTool, label: 'My jobs' },
    { to: '/work/setup', icon: FiCalendar, label: 'My schedule' },
    { to: '/complaints', icon: FiFileText, label: 'Complaints' },
    { to: '/notices', icon: FiBell, label: 'Notices' }
  ]
}

const ROLE_LABEL = {
  super_admin: 'Super admin',
  society_admin: 'Society admin',
  resident: 'Resident',
  security: 'Security',
  staff: 'Staff',
  vendor: 'Vendor'
}

export const Logo = ({ className = '' }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" className="fill-brand" />
      <path d="M7 24V12l9-6 9 6v12" fill="none" stroke="#F5A800" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M12 24v-7h8v7" fill="none" className="stroke-brand-ink" strokeWidth="2.4" />
    </svg>
    <span className="font-display text-xl font-extrabold tracking-tight">MyGate</span>
  </span>
)

const useTheme = () => {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch (e) {
      /* storage unavailable */
    }
    setDark(next)
  }
  return [dark, toggle]
}

const Notifications = () => {
  const { lastNotification } = useSocket()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const ref = useRef(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/users/notifications?limit=15')
      setItems(data.notifications || [])
      setUnread(data.unreadCount || 0)
    } catch (e) {
      /* the bell is non-critical */
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, lastNotification])

  useEffect(() => {
    if (!open) return undefined
    const onClick = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const markAll = async () => {
    try {
      await api.put('/users/notifications/read-all')
      load()
    } catch (e) {
      /* ignore */
    }
  }

  const markOne = async (n) => {
    if (n.isRead) return
    try {
      await api.put(`/users/notifications/${n._id}/read`)
      load()
    } catch (e) {
      /* ignore */
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="btn-ghost relative min-h-0 p-2"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <FiBell size={19} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-amber px-1 text-[10px] font-bold text-[#1b1400]">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-display font-bold">Notifications</p>
            {unread > 0 && (
              <button className="text-xs font-semibold text-brand hover:underline" onClick={markAll}>
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">You are all caught up.</li>}
            {items.map((n) => (
              <li key={n._id}>
                <button
                  onClick={() => markOne(n)}
                  className={`block w-full px-4 py-3 text-left hover:bg-sunken ${n.isRead ? '' : 'bg-brand-soft/50'}`}
                >
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{n.message}</p>
                  <p className="mt-1 text-xs text-muted">{formatDate(n.createdAt, true)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const Layout = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [dark, toggleTheme] = useTheme()

  useEffect(() => setDrawer(false), [location.pathname])

  const items = [...NAV.common, ...(NAV[user?.role] || [])]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const sidebar = (
    <div className="flex h-full flex-col border-r border-white/10 bg-side text-white">
      <div className="hazard h-1.5 shrink-0" aria-hidden="true" />
      <div className="px-5 pb-4 pt-5 text-white">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="hazard absolute inset-y-1.5 left-0 w-1 rounded-full" aria-hidden="true" />}
                <Icon size={18} className={isActive ? 'text-amber' : ''} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <NavLink
          to="/profile"
          className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/5"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber font-display text-sm font-bold text-[#1b1400]">
            {user?.profilePic ? <img src={imgSrc(user.profilePic)} alt="" className="h-full w-full rounded-full object-cover" /> : (user?.name || '?').trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{user?.name}</span>
            <span className="block truncate text-xs text-white/65">
              {ROLE_LABEL[user?.role]}
              {user?.flatNo ? ` · ${user.block ? `${user.block}-` : ''}${user.flatNo}` : ''}
            </span>
          </span>
        </NavLink>
        <button
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/5 hover:text-white"
        >
          <FiLogOut size={18} /> Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:pl-64">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#031414]/60" onClick={() => setDrawer(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-pop">
            {sidebar}
            <button
              className="absolute right-2 top-4 rounded-md p-2 text-white/80 hover:bg-white/10"
              onClick={() => setDrawer(false)}
              aria-label="Close menu"
            >
              <FiX size={20} />
            </button>
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
        <button className="btn-ghost -ml-2 min-h-0 p-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
          <FiMenu size={20} />
        </button>
        <Logo className="lg:hidden" />
        <div className="ml-auto flex items-center gap-1">
          <button
            className="btn-ghost min-h-0 p-2"
            onClick={toggleTheme}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {dark ? <FiSun size={19} /> : <FiMoon size={19} />}
          </button>
          <Notifications />
          <NavLink to="/profile" className="btn-ghost min-h-0 p-2 lg:hidden" aria-label="Profile">
            <FiUser size={19} />
          </NavLink>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
