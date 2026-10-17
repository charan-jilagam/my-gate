import { Link, Navigate } from 'react-router-dom'
import { FiAlertTriangle, FiArrowRight, FiBell, FiCalendar, FiCheckCircle, FiClipboard, FiClock, FiCreditCard, FiFileText, FiFolder, FiMessageSquare, FiPackage, FiPieChart, FiShield, FiThumbsUp, FiTool, FiUserPlus, FiUsers } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../contexts/LanguageContext'
import useApi from '../hooks/useApi'
import { PageHeader, formatDate, formatINR } from '../components/ui'
import RequestCard from '../components/RequestCard'
import { resolveActionUrl } from '../components/Layout'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// The things each role does most, one tap from the home screen.
const QUICK = {
  resident: [
    { to: '/visitors', icon: FiUserPlus, label: 'Pre-approve a visitor' },
    { to: '/services', icon: FiTool, label: 'Book a home service' },
    { to: '/bookings', icon: FiCalendar, label: 'Book an amenity' },
    { to: '/payments', icon: FiCreditCard, label: 'Pay dues' },
    { to: '/complaints', icon: FiFileText, label: 'Raise a complaint' },
    { to: '/daily-help', icon: FiClock, label: 'Daily help' },
    { to: '/community', icon: FiMessageSquare, label: 'Community' },
    { to: '/votes', icon: FiThumbsUp, label: 'Votes' },
    { to: '/documents', icon: FiFolder, label: 'Documents' },
    { to: '/emergency', icon: FiAlertTriangle, label: 'SOS', danger: true }
  ],
  security: [
    { to: '/gate', icon: FiShield, label: 'Gate console' },
    { to: '/visitors', icon: FiUsers, label: 'Visitors' },
    { to: '/deliveries', icon: FiPackage, label: 'Deliveries' },
    { to: '/daily-help', icon: FiClock, label: 'Check in daily help' },
    { to: '/my-shifts', icon: FiClipboard, label: 'My shifts' },
    { to: '/upkeep', icon: FiTool, label: 'Upkeep' },
    { to: '/emergency', icon: FiAlertTriangle, label: 'Alerts', danger: true }
  ],
  staff: [
    { to: '/my-shifts', icon: FiClipboard, label: 'My shifts' },
    { to: '/upkeep', icon: FiTool, label: 'Upkeep' },
    { to: '/complaints', icon: FiFileText, label: 'Complaints' },
    { to: '/notices', icon: FiBell, label: 'Notices' }
  ],
  society_admin: [
    { to: '/admin/residents', icon: FiCheckCircle, label: 'Approve people' },
    { to: '/notices', icon: FiBell, label: 'Post a notice' },
    { to: '/complaints', icon: FiFileText, label: 'Complaints' },
    { to: '/accounts', icon: FiPieChart, label: 'Accounts' },
    { to: '/admin/services', icon: FiTool, label: 'Home services' },
    { to: '/votes', icon: FiThumbsUp, label: 'Votes' },
    { to: '/roster', icon: FiClipboard, label: 'Duty roster' },
    { to: '/upkeep', icon: FiTool, label: 'Upkeep' },
    { to: '/documents', icon: FiFolder, label: 'Documents' },
    { to: '/emergency', icon: FiAlertTriangle, label: 'Emergency', danger: true }
  ]
}
QUICK.super_admin = QUICK.society_admin

const count = (d, key) => d?.count ?? d?.[key]?.length ?? 0

const Dashboard = () => {
  const { user, isResident, isAdmin, isSecurity } = useAuth()
  const { t } = useT()
  const role = user?.role
  const sees = (...roles) => roles.includes(role)

  const visitorsPending = useApi('/visitors', { params: { status: 'pending', limit: 100 }, enabled: sees('resident', 'society_admin', 'super_admin') })
  const visitorsInside = useApi('/visitors', { params: { status: 'checked_in', limit: 100 }, enabled: sees('security', 'society_admin', 'super_admin') })
  const visitorsExpected = useApi('/visitors', { params: { status: 'approved', limit: 100 }, enabled: sees('security', 'resident') })
  const deliveriesOpen = useApi('/deliveries', { params: { status: 'approved', limit: 100 }, enabled: sees('resident', 'security', 'society_admin', 'super_admin') })
  const vehiclesInside = useApi('/vehicles', { params: { isInside: true }, enabled: sees('security', 'society_admin', 'super_admin') })
  const complaintsOpen = useApi('/complaints', { params: { status: 'open', limit: 100 }, enabled: sees('resident', 'society_admin', 'super_admin', 'staff') })
  const paymentsPending = useApi('/payments', { params: { status: 'pending', limit: 100 }, enabled: sees('resident', 'society_admin', 'super_admin') })
  const approvals = useApi('/users/pending-approvals', { enabled: isAdmin })
  const services = useApi('/service-requests', { params: { scope: 'upcoming', limit: 3 }, enabled: isResident, select: (d) => d.requests || [] })
  const sosOpen = useApi('/emergency/alerts', { params: { status: 'open', limit: 20 }, enabled: sees('security', 'society_admin', 'super_admin'), select: (d) => (d.alerts || []).filter((a) => a.status !== 'resolved') })
  const votes = useApi('/elections', { enabled: isResident, select: (d) => d.elections || [] })
  const upkeep = useApi('/facility', { enabled: sees('society_admin', 'security', 'staff') })
  const shifts = useApi('/roster/mine', { enabled: sees('security', 'staff') })
  const notifications = useApi('/users/notifications', { params: { limit: 6 }, select: (d) => d.notifications || [] })

  const pendingPaymentTotal = (paymentsPending.data?.payments || []).reduce((n, p) => n + (p.amount || 0), 0)

  // Things the person can act on right now. Zero-count items are hidden so the list stays short.
  const attention = [
    isAdmin && { n: count(approvals.data, 'users'), label: 'residents waiting for approval', to: '/admin/residents', cta: 'Review' },
    sees('resident', 'society_admin', 'super_admin') && {
      n: count(visitorsPending.data, 'visitors'),
      label: isResident ? 'visitors at the gate waiting for you' : 'visitors waiting for a decision',
      to: '/visitors',
      cta: 'Decide'
    },
    isResident && { n: count(paymentsPending.data, 'payments'), label: `payments pending (${formatINR(pendingPaymentTotal)})`, to: '/payments', cta: 'Pay' },
    sees('resident', 'society_admin', 'super_admin', 'staff') && { n: count(complaintsOpen.data, 'complaints'), label: 'open complaints', to: '/complaints', cta: 'Open' },
    sees('security', 'society_admin', 'super_admin') && { n: sosOpen.data?.length || 0, label: 'open emergency alerts', to: '/emergency', cta: 'Respond' },
    isSecurity && { n: count(visitorsExpected.data, 'visitors'), label: 'invited visitors expected', to: '/gate', cta: 'Open console' },
    isResident && { n: (votes.data || []).filter((e) => e.phase === 'open' && !e.voted).length, label: 'votes waiting for you', to: '/votes', cta: 'Vote' },
    sees('society_admin', 'security', 'staff') && { n: upkeep.data?.counts?.overdue || 0, label: 'upkeep jobs overdue', to: '/upkeep', cta: 'Open' },
    sees('security', 'staff') && { n: (shifts.data?.shifts || []).filter((x) => x.date === shifts.data.today && x.phase !== 'completed').length, label: 'shifts today', to: '/my-shifts', cta: 'Open' }
  ].filter((x) => x && x.n > 0)

  const glance = [
    sees('security', 'society_admin', 'super_admin') && { label: 'Visitors inside', value: count(visitorsInside.data, 'visitors'), to: '/visitors' },
    sees('resident', 'security', 'society_admin', 'super_admin') && { label: 'Deliveries approved', value: count(deliveriesOpen.data, 'deliveries'), to: '/deliveries' },
    sees('security', 'society_admin', 'super_admin') && { label: 'Vehicles inside', value: count(vehiclesInside.data, 'vehicles'), to: '/vehicles' },
    isResident && { label: 'Visitors expected', value: count(visitorsExpected.data, 'visitors'), to: '/visitors' },
    isAdmin && { label: 'Open complaints', value: count(complaintsOpen.data, 'complaints'), to: '/complaints' }
  ].filter(Boolean)

  const flat = user?.flatNo ? `${user.block ? `${user.block}-` : ''}${user.flatNo}` : ''
  const subtitle = [user?.societyId?.name, flat && `Flat ${flat}`].filter(Boolean).join(' · ')

  if (role === 'vendor') return <Navigate to="/work" replace />

  const quick = QUICK[role] || []

  return (
    <>
      <PageHeader title={`${t(greeting())}, ${user?.name?.split(' ')[0] || 'there'}`} subtitle={subtitle || undefined} />

      {quick.length > 0 && (
        <section aria-labelledby="quick-h" className="mb-6">
          <h2 id="quick-h" className="sr-only">{t('Quick actions')}</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quick.map(({ to, icon: Icon, label, danger }) => (
              <li key={to + label}>
                <Link to={to} className={`flex h-full min-h-[76px] flex-col items-start justify-between gap-2 rounded-lg border p-3 text-sm font-semibold transition-colors ${danger ? 'border-danger/40 bg-danger-soft text-danger hover:border-danger' : 'border-line bg-surface hover:border-brand'}`}>
                  <Icon size={22} className={danger ? '' : 'text-brand'} aria-hidden="true" />
                  {t(label)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isResident && services.data?.length > 0 && (
        <section aria-labelledby="svc-h" className="mb-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="svc-h" className="text-base font-bold">{t('Your home services')}</h2>
            <Link to="/services/requests" className="text-sm font-semibold text-brand hover:underline">{t('See all')}</Link>
          </div>
          <ul className="space-y-2">{services.data.map((r) => <RequestCard key={r._id} request={r} />)}</ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="attention-h" className="panel">
          <h2 id="attention-h" className="border-b border-line px-5 py-3.5 text-base font-bold">{t('Needs your attention')}</h2>
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"><FiCheckCircle size={18} /></span>
              {t('Nothing is waiting on you right now.')}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((a) => (
                <li key={a.label}>
                  <Link to={a.to} className="group flex items-center gap-4 px-5 py-4 hover:bg-sunken/60">
                    <span className="w-10 text-right font-display text-3xl font-extrabold leading-none">{a.n}</span>
                    <span className="flex-1 text-sm">{t(a.label)}</span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
                      {t(a.cta)} <FiArrowRight className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {glance.length > 0 && (
            <>
              <h2 className="border-y border-line px-5 py-3.5 text-base font-bold">{t('Right now')}</h2>
              <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-3 sm:divide-y-0">
                {glance.map((g) => (
                  <Link key={g.label} to={g.to} className="px-5 py-4 hover:bg-sunken/60">
                    <p className="font-display text-2xl font-extrabold">{g.value}</p>
                    <p className="text-xs text-muted">{t(g.label)}</p>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>

        <section aria-labelledby="recent-h" className="panel h-fit">
          <h2 id="recent-h" className="border-b border-line px-5 py-3.5 text-base font-bold">{t('Recent activity')}</h2>
          {notifications.data?.length ? (
            <ul className="divide-y divide-line">
              {notifications.data.map((n) => {
                const to = resolveActionUrl(n.actionUrl)
                const body = (
                  <>
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-sm text-muted">{n.message}</p>
                    <p className="mt-1 text-xs text-muted">{formatDate(n.createdAt, true)}</p>
                  </>
                )
                return (
                  <li key={n._id}>
                    {to ? <Link to={to} className="block px-5 py-3.5 hover:bg-sunken/60">{body}</Link> : <div className="px-5 py-3.5">{body}</div>}
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted">
              <FiBell size={18} /> Activity from visitors, deliveries and payments shows up here.
            </div>
          )}
        </section>
      </div>
    </>
  )
}

export default Dashboard
