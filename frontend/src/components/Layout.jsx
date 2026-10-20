import { imgSrc } from '../utils/media'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { preloadPages } from '../preload'
import { onDataChange } from '../utils/apiCache'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import ErrorBoundary from './ErrorBoundary'
import {
  FiAlertTriangle,
  FiBell,
  FiBookOpen,
  FiCalendar,
  FiCheckCircle,
  FiClipboard,
  FiClock,
  FiCreditCard,
  FiFileText,
  FiFolder,
  FiGlobe,
  FiGrid,
  FiHome,
  FiLogOut,
  FiMenu,
  FiMessageSquare,
  FiMoon,
  FiMoreHorizontal,
  FiMapPin,
  FiCompass,
  FiRepeat,
  FiNavigation,
  FiPackage,
  FiPieChart,
  FiShield,
  FiThumbsUp,
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
import { BrandLoader, formatDate } from './ui'
import { useT } from '../contexts/LanguageContext'
import { LANGUAGES } from '../i18n/translations'
import DutyTracker from './DutyTracker'

const I = {
  home: { to: '/dashboard', icon: FiGrid, label: 'Home' },
  visitors: { to: '/visitors', icon: FiUsers, label: 'Visitors' },
  deliveries: { to: '/deliveries', icon: FiPackage, label: 'Deliveries' },
  vehicles: { to: '/vehicles', icon: FiTruck, label: 'Vehicles' },
  help: { to: '/daily-help', icon: FiClock, label: 'Daily help' },
  services: { to: '/services', icon: FiTool, label: 'Services' },
  bookings: { to: '/bookings', icon: FiCalendar, label: 'Amenities' },
  community: { to: '/community', icon: FiMessageSquare, label: 'Community' },
  notices: { to: '/notices', icon: FiBell, label: 'Notices' },
  complaints: { to: '/complaints', icon: FiFileText, label: 'Complaints' },
  payments: { to: '/payments', icon: FiCreditCard, label: 'Payments' },
  accounts: { to: '/accounts', icon: FiPieChart, label: 'Accounts' },
  emergency: { to: '/emergency', icon: FiAlertTriangle, label: 'Emergency' },
  gate: { to: '/gate', icon: FiShield, label: 'Gate console' },
  people: { to: '/admin/residents', icon: FiCheckCircle, label: 'People' },
  adminServices: { to: '/admin/services', icon: FiTool, label: 'Home services' },
  societies: { to: '/admin/societies', icon: FiHome, label: 'Society' },
  jobs: { to: '/work', icon: FiTool, label: 'My jobs' },
  schedule: { to: '/work/setup', icon: FiCalendar, label: 'My schedule' },
  documents: { to: '/documents', icon: FiFolder, label: 'Documents' },
  votes: { to: '/votes', icon: FiThumbsUp, label: 'Votes' },
  upkeep: { to: '/upkeep', icon: FiTool, label: 'Upkeep' },
  roster: { to: '/roster', icon: FiClipboard, label: 'Duty roster' },
  shifts: { to: '/my-shifts', icon: FiClock, label: 'My shifts' },
  swaps: { to: '/swaps', icon: FiRepeat, label: 'Shift swaps' },
  attendance: { to: '/attendance', icon: FiCheckCircle, label: 'Attendance' },
  live: { to: '/live', icon: FiNavigation, label: 'Guard tracking' },
  nearby: { to: '/nearby', icon: FiCompass, label: 'Nearby places' },
  posts: { to: '/guard-posts', icon: FiMapPin, label: 'Guard posts' },
  guide: { to: '/help', icon: FiBookOpen, label: 'User guide' }
}

// Sidebar and "More" menu: grouped so a long list stays scannable.
const NAV = {
  resident: [
    { items: [I.home] },
    { title: 'At the gate', items: [I.visitors, I.deliveries, I.vehicles, I.help] },
    { title: 'Home and community', items: [I.services, I.bookings, I.community, I.nearby, I.notices, I.votes, I.documents] },
    { title: 'Money and help', items: [I.payments, I.accounts, I.complaints, I.upkeep, I.emergency] },
    { items: [I.guide] }
  ],
  security: [
    { items: [I.home, I.gate, I.shifts, I.swaps] },
    { title: 'Gate', items: [I.visitors, I.deliveries, I.vehicles, I.help] },
    { title: 'Society', items: [I.notices, I.nearby, I.emergency, I.upkeep, I.documents] },
    { items: [I.guide] }
  ],
  guard_admin: [
    { items: [I.home, I.gate, I.shifts, I.swaps] },
    { title: 'Guards', items: [I.roster, I.attendance, I.live, I.posts] },
    { title: 'Gate', items: [I.visitors, I.deliveries, I.vehicles, I.help] },
    { title: 'Society', items: [I.notices, I.nearby, I.emergency, I.upkeep, I.documents] },
    { items: [I.guide] }
  ],
  society_admin: [
    { items: [I.home, I.people] },
    { title: 'Gate', items: [I.gate, I.visitors, I.deliveries, I.vehicles, I.help] },
    { title: 'Society', items: [I.notices, I.nearby, I.votes, I.complaints, I.community, I.bookings, I.adminServices, I.emergency] },
    { title: 'Guards', items: [I.roster, I.attendance, I.live, I.swaps, I.posts] },
    { title: 'Operations', items: [I.upkeep, I.documents] },
    { title: 'Money', items: [I.payments, I.accounts] },
    { title: 'Setup', items: [I.societies] },
    { items: [I.guide] }
  ],
  super_admin: [
    { items: [I.home, I.societies, I.people] },
    { title: 'Gate', items: [I.visitors, I.deliveries, I.vehicles, I.help] },
    { title: 'Society', items: [I.notices, I.nearby, I.votes, I.complaints, I.community, I.bookings, I.adminServices, I.emergency] },
    { title: 'Guards', items: [I.roster, I.attendance, I.live, I.swaps, I.posts] },
    { title: 'Operations', items: [I.upkeep, I.documents] },
    { title: 'Money', items: [I.payments, I.accounts] },
    { items: [I.guide] }
  ],
  staff: [
    { items: [I.home, I.people, I.bookings, I.shifts, I.swaps, I.upkeep, I.complaints, I.notices, I.nearby, I.documents] },
    { items: [I.guide] }
  ],
  vendor: [
    { items: [I.jobs, I.schedule, I.complaints, I.notices] },
    { items: [I.guide] }
  ]
}

// The bottom bar on phones: the four things each role does most, then everything else under "More".
const TABS = {
  resident: [I.home, I.visitors, I.services, I.community],
  security: [I.home, I.gate, I.visitors, I.shifts],
  guard_admin: [I.home, I.gate, I.live, I.roster],
  society_admin: [I.home, I.people, I.visitors, I.complaints],
  super_admin: [I.home, I.societies, I.people, I.complaints],
  staff: [I.home, I.people, I.bookings, I.shifts],
  vendor: [I.jobs, I.schedule, I.notices]
}

// Notifications may carry a link to one record (/visitors/abc). Those pages are lists, so open the list and
// highlight that record (?highlight=abc), so the person lands exactly on what the message was about.
// A notice has its own page (/notices/abc), which opens that notice.
const LIST_PAGES = ['visitors', 'deliveries', 'vehicles', 'complaints', 'payments', 'bookings', 'documents']
export const resolveActionUrl = (url) => {
  if (!url || !url.startsWith('/')) return null
  const [, first, second] = url.split('?')[0].split('/')
  if (LIST_PAGES.includes(first) && second) return `/${first}?highlight=${encodeURIComponent(second)}`
  return url
}

const ROLE_LABEL = {
  super_admin: 'Super admin',
  society_admin: 'Society admin',
  resident: 'Resident',
  security: 'Security',
  guard_admin: 'Guard head',
  staff: 'Staff',
  vendor: 'Vendor'
}

// The Nivora mark sits on a white tile so it looks the same on the dark sidebar, the light pages and the sign-in screen.
export const LogoMark = ({ size = 36, className = '' }) => (
  <span className={`inline-grid shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5 ${className}`} style={{ width: size, height: size }}>
    <img src="/logo-mark.png" alt="" width={size} height={size} style={{ width: size * 0.82, height: size * 0.82 }} className="object-contain" draggable="false" />
  </span>
)

export const Logo = ({ className = '', size = 36 }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <LogoMark size={size} />
    <span className="font-display text-xl font-extrabold tracking-tight">Nivora</span>
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

// What each notification looks like in the list: an icon and a colour, so people can tell them apart at a glance.
const NOTE_STYLE = {
  sos_alert: [FiAlertTriangle, 'danger'],
  visitor_approval: [FiUser, 'brand'], visitor_entry: [FiUser, 'brand'],
  delivery_approval: [FiPackage, 'brand'], delivery_entry: [FiPackage, 'brand'],
  vehicle_entry: [FiTruck, 'brand'], vehicle_exit: [FiTruck, 'brand'],
  payment_due: [FiCreditCard, 'amber'], payment_received: [FiCreditCard, 'good'],
  complaint_update: [FiFileText, 'amber'], complaint_assigned: [FiFileText, 'amber'],
  notice_published: [FiBell, 'brand'], community: [FiMessageSquare, 'brand'],
  booking_request: [FiCalendar, 'brand'], booking_approved: [FiCheckCircle, 'good'], booking_rejected: [FiX, 'danger'],
  service_request: [FiTool, 'brand'], service_update: [FiTool, 'brand'], service_review: [FiTool, 'good'],
  daily_help: [FiUsers, 'brand'], election: [FiThumbsUp, 'brand'], document: [FiFolder, 'brand'],
  facility: [FiClipboard, 'brand'], shift: [FiClock, 'brand'], shift_swap: [FiRepeat, 'brand'], attendance: [FiMapPin, 'amber']
}
const TONE = {
  brand: 'bg-brand-soft text-brand',
  good: 'bg-brand-soft text-brand',
  amber: 'bg-amber-soft text-amber',
  danger: 'bg-red-500/15 text-red-500'
}

const timeAgo = (value) => {
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (!Number.isFinite(mins) || mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.floor(hrs / 24)
  return days < 7 ? `${days} d ago` : null
}

const Notifications = () => {
  const navigate = useNavigate()
  const { lastNotification } = useSocket()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [ring, setRing] = useState(false)
  const first = useRef(true)
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
    if (first.current) {
      first.current = false
      return undefined
    }
    // A new one just arrived: wiggle the bell for a moment.
    setRing(true)
    const timer = setTimeout(() => setRing(false), 1400)
    return () => clearTimeout(timer)
  }, [load, lastNotification])

  // Marking something read, approving, deleting: the count in the bell follows without a refresh.
  useEffect(() => onDataChange(() => load()), [load])

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
    const to = resolveActionUrl(n.actionUrl)
    if (to) {
      setOpen(false)
      navigate(to)
    }
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
        <FiBell size={19} className={ring ? 'bell-ring' : ''} />
        {unread > 0 && (
          <span key={unread} className="badge-pop absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-amber px-1 text-[10px] font-extrabold leading-none text-[#1b1400] ring-2 ring-bg">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,400px)] overflow-hidden rounded-xl border border-edge bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="font-display font-bold">Notifications</p>
              <p className="text-xs text-muted">{unread > 0 ? `${unread > 9 ? '9+' : unread} new` : 'All caught up'}</p>
            </div>
            {unread > 0 && (
              <button className="rounded-md bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand hover:underline" onClick={markAll}>
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-[65vh] overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-10 text-center">
                <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
                  <FiCheckCircle size={24} />
                </span>
                <p className="text-sm font-semibold">You are all caught up.</p>
                <p className="mt-0.5 text-xs text-muted">New updates will show up here.</p>
              </li>
            )}
            {items.map((n, i) => {
              const [Icon, tone] = NOTE_STYLE[n.type] || [FiBell, 'brand']
              const heading = !n.isRead && i === 0 ? 'New' : n.isRead && (i === 0 || !items[i - 1].isRead) ? 'Earlier' : null
              return (
                <li key={n._id}>
                  {heading && <p className="bg-sunken px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{heading}</p>}
                  <button
                    onClick={() => markOne(n)}
                    className={`relative flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-sunken ${n.isRead ? 'opacity-75' : 'bg-brand-soft/40'}`}
                  >
                    {!n.isRead && <span className="absolute inset-y-0 left-0 w-1 bg-brand" aria-hidden="true" />}
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${n.isRead ? 'bg-sunken text-muted' : TONE[tone]}`}>
                      {n.isRead ? <FiCheckCircle size={16} /> : <Icon size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`text-sm ${n.isRead ? 'font-medium' : 'font-bold'}`}>{n.title}</span>
                        {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber" aria-label="Unread" />}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{n.message}</span>
                      <span className="mt-1 block text-xs text-muted">{timeAgo(n.createdAt) || formatDate(n.createdAt, true)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

// A screen's code normally arrives instantly (it is loaded ahead of time). If it is slow, wait a moment before
// showing a loader, so a quick switch never flashes one.
const DelayedLoader = () => {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 350)
    return () => clearTimeout(t)
  }, [])
  return show ? <BrandLoader compact text="Loading…" /> : <div className="min-h-[50vh]" aria-hidden="true" />
}

const Layout = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [dark, toggleTheme] = useTheme()
  const { t, lang, setLang } = useT()

  useEffect(() => setDrawer(false), [location.pathname])
  useEffect(() => { preloadPages() }, [])

  const groups = NAV[user?.role] || [{ items: [I.home] }]
  const tabs = TABS[user?.role] || [I.home]
  const sos = user?.role === 'resident'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const sidebar = (
    <div className="flex h-full flex-col border-r border-white/10 bg-side text-white">
      <div className="hazard h-1.5 shrink-0" aria-hidden="true" />
      <div className="px-5 pb-4 pt-5 text-white">
        <Logo />
        <p className="mt-1 text-[11px] font-medium tracking-wide text-white/55">Every Community. One Platform.</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Main">
        {groups.map((g, gi) => (
          <div key={gi} className={gi ? 'mt-4' : ''}>
            {g.title && <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-white/50">{t(g.title)}</p>}
            <div className="space-y-0.5">
              {g.items.map(({ to, icon: Icon, label }) => (
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
                      {t(label)}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
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
              {t(ROLE_LABEL[user?.role])}
              {user?.flatNo ? ` · ${user.block ? `${user.block}-` : ''}${user.flatNo}` : ''}
            </span>
          </span>
        </NavLink>
        <button
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/5 hover:text-white"
        >
          <FiLogOut size={18} /> {t('Sign out')}
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
          <label className="relative flex items-center">
            <span className="sr-only">{t('Language')}</span>
            <FiGlobe size={17} className="pointer-events-none absolute left-2 text-muted" aria-hidden="true" />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="h-9 w-[5.5rem] cursor-pointer appearance-none truncate rounded-md border border-edge bg-surface py-0 pl-7 pr-2 text-xs font-semibold text-ink hover:border-brand focus:border-brand sm:w-auto sm:pr-2 sm:text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <NavLink to="/help" className="btn-ghost hidden min-h-0 p-2 sm:inline-flex" aria-label={t('User guide')} title={t('User guide')}>
            <FiBookOpen size={19} />
          </NavLink>
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

      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-8 lg:pb-8">
        {['security', 'guard_admin', 'staff'].includes(user?.role) && <DutyTracker />}
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<DelayedLoader />}>
            <div key={location.pathname} className="page-in"><Outlet /></div>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Phone navigation: the main places for this role, always one thumb away. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick navigation">
        <ul className="mx-auto flex max-w-lg items-stretch justify-around">
          {tabs.map(({ to, icon: Icon, label }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className={({ isActive }) => `flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold ${isActive ? 'text-brand' : 'text-muted'}`}
              >
                <Icon size={20} aria-hidden="true" />
                {t(label)}
              </NavLink>
            </li>
          ))}
          {sos && (
            <li className="flex-1">
              <NavLink to="/emergency" className="flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-bold text-danger">
                <FiAlertTriangle size={20} aria-hidden="true" />
                {t('SOS')}
              </NavLink>
            </li>
          )}
          <li className="flex-1">
            <button type="button" onClick={() => setDrawer(true)} className="flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold text-muted" aria-label="More">
              <FiMoreHorizontal size={20} aria-hidden="true" />
              {t('More')}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  )
}

export default Layout
