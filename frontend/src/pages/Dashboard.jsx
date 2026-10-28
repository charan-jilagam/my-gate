import { Link, Navigate } from 'react-router-dom'
import { FiAlertTriangle, FiArrowRight, FiCamera, FiCompass, FiMapPin, FiPhone, FiRepeat, FiNavigation, FiBell, FiCalendar, FiCheckCircle, FiClipboard, FiClock, FiCreditCard, FiFileText, FiFolder, FiMessageSquare, FiPackage, FiPieChart, FiShield, FiThumbsUp, FiTool, FiUserPlus, FiUsers } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../contexts/LanguageContext'
import useApi from '../hooks/useApi'
import { useLiveLocation } from '../contexts/LocationContext'
import LocationChip from '../components/LocationChip'
import { ErrorState, PageHeader, formatDate, formatINR } from '../components/ui'
import RequestCard from '../components/RequestCard'
import { AlertBanner, ServiceTiles, TopNews, WeatherHero } from '../components/HomeLive'
import { TONE, TONE_ORDER } from '../components/insights'
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
    { to: '/occasions', icon: FiCamera, label: 'Occasions' },
    { to: '/nearby', icon: FiCompass, label: 'Nearby places' },
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
    { to: '/notices', icon: FiBell, label: 'Notices' },
    { to: '/occasions', icon: FiCamera, label: 'Add occasion photos' }
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
    { to: '/occasions', icon: FiCamera, label: 'Occasions' },
    { to: '/documents', icon: FiFolder, label: 'Documents' },
    { to: '/emergency', icon: FiAlertTriangle, label: 'Emergency', danger: true }
  ]
}
QUICK.super_admin = QUICK.society_admin
QUICK.guard_admin = [
  { to: '/live', icon: FiNavigation, label: 'Where are my guards?' },
  { to: '/roster', icon: FiClipboard, label: 'Duty roster' },
  { to: '/attendance', icon: FiCheckCircle, label: 'Attendance' },
  { to: '/swaps', icon: FiRepeat, label: 'Shift swaps' },
  { to: '/gate', icon: FiShield, label: 'Gate console' },
  { to: '/my-shifts', icon: FiClock, label: 'My shifts' },
  { to: '/guard-posts', icon: FiMapPin, label: 'Guard posts' },
  { to: '/emergency', icon: FiAlertTriangle, label: 'Alerts', danger: true }
]
QUICK.society_admin = [...QUICK.society_admin.slice(0, 7), { to: '/live', icon: FiNavigation, label: 'Guard tracking' }, ...QUICK.society_admin.slice(7)]
QUICK.super_admin = QUICK.society_admin
QUICK.security = [...QUICK.security.slice(0, 5), { to: '/swaps', icon: FiRepeat, label: 'Swap a shift' }, ...QUICK.security.slice(5)]

const count = (d, key) => d?.count ?? d?.[key]?.length ?? 0

const Dashboard = () => {
  const { user, isResident, isAdmin, isSecurity } = useAuth()
  const { t, lang } = useT()
  const role = user?.role
  // The guard head can do everything a guard can.
  const sees = (...roles) => roles.includes(role) || (role === 'guard_admin' && roles.includes('security'))

  const visitorsPending = useApi('/visitors', { params: { status: 'pending', limit: 100 }, enabled: sees('resident', 'society_admin', 'super_admin') })
  const visitorsInside = useApi('/visitors', { params: { status: 'checked_in', limit: 100 }, enabled: sees('security', 'society_admin', 'super_admin') })
  const visitorsExpected = useApi('/visitors', { params: { status: 'approved', limit: 100 }, enabled: sees('security', 'resident') })
  const deliveriesOpen = useApi('/deliveries', { params: { status: 'approved', limit: 100 }, enabled: sees('resident', 'security', 'society_admin', 'super_admin') })
  const vehiclesInside = useApi('/vehicles', { params: { isInside: true }, enabled: sees('security', 'society_admin', 'super_admin') })
  const complaintsOpen = useApi('/complaints', { params: { status: 'open', limit: 100 }, enabled: sees('resident', 'society_admin', 'super_admin', 'staff') })
  const paymentsPending = useApi('/payments', { params: { status: 'pending', limit: 100 }, enabled: sees('resident', 'society_admin', 'super_admin') })
  const approvals = useApi('/users/pending-approvals', { enabled: isAdmin || user?.role === 'staff' })
  const services = useApi('/service-requests', { params: { scope: 'upcoming', limit: 3 }, enabled: isResident, select: (d) => d.requests || [] })
  const sosOpen = useApi('/emergency/alerts', { params: { status: 'open', limit: 20 }, enabled: sees('security', 'society_admin', 'super_admin'), select: (d) => (d.alerts || []).filter((a) => a.status !== 'resolved') })
  const votes = useApi('/elections', { enabled: isResident, select: (d) => d.elections || [] })
  const upkeep = useApi('/facility', { enabled: sees('society_admin', 'security', 'staff') })
  const shifts = useApi('/roster/mine', { enabled: sees('security', 'staff') })
  const onDuty = useApi('/guards/on-duty', { enabled: isResident, select: (d) => d })
  const swapsToAnswer = useApi('/guards/swaps', { enabled: sees('security', 'staff'), select: (d) => (d.swaps || []).filter((x) => x.canAccept) })
  // Weather, alerts and headlines for the society's area, from free public sources (one call, cached on the server).
  const hasPlace = Boolean(user?.societyId) && role !== 'vendor'
  const { params: where } = useLiveLocation()
  const live = useApi('/insights/overview', { params: { lang, ...where }, enabled: hasPlace, live: false })
  const notifications = useApi('/users/notifications', { params: { limit: 6 }, select: (d) => d.notifications || [] })

  const pendingPaymentTotal = (paymentsPending.data?.payments || []).reduce((n, p) => n + (p.amount || 0), 0)

  // Things the person can act on right now. Zero-count items are hidden so the list stays short.
  const attention = [
    (isAdmin || user?.role === 'staff') && { n: count(approvals.data, 'users'), label: 'residents waiting for approval', to: '/admin/residents', cta: 'Review' },
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
    sees('security', 'staff') && { n: swapsToAnswer.data?.length || 0, label: 'shift swap requests waiting for your answer', to: '/swaps', cta: 'Answer' },
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

      {hasPlace && <LocationChip place={live.data?.place} className="mb-3" />}

      {hasPlace && (
        <section aria-label={t('Weather and city updates')} className="mb-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          {live.data?.weather ? (
            <WeatherHero weather={live.data.weather} place={live.data.place} updatedAt={live.data.weatherUpdatedAt} />
          ) : live.loading ? (
            <div className="skeleton h-[22rem] rounded-3xl" aria-hidden="true" />
          ) : (
            <div className="panel flex items-center p-4"><ErrorState message={live.error || 'The weather is not available right now.'} onRetry={live.reload} /></div>
          )}
          <div className="flex flex-col gap-4">
            <ServiceTiles canSos={['resident', 'security', 'guard_admin', 'society_admin', 'super_admin'].includes(role)} />
            <AlertBanner alerts={live.data?.alerts} />
          </div>
        </section>
      )}

      {quick.length > 0 && (
        <section aria-labelledby="quick-h" className="mb-6">
          <h2 id="quick-h" className="sr-only">{t('Quick actions')}</h2>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {quick.map(({ to, icon: Icon, label, danger }, i) => (
              <li key={to + label} className={danger && quick.length % 2 === 1 ? 'col-span-2 sm:col-span-1' : ''}>
                <Link to={to} className={`group flex h-full min-h-[88px] flex-col items-start justify-between gap-3 rounded-2xl border p-3.5 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 hover:shadow-lift ${danger ? 'border-danger/30 bg-danger-soft text-danger hover:border-danger' : 'border-line bg-surface shadow-card hover:border-brand/40'}`}>
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${danger ? 'bg-danger text-on-solid' : TONE[TONE_ORDER[i % TONE_ORDER.length]]}`}>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  {t(label)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isResident && onDuty.data && (
        <section aria-labelledby="duty-h" className="panel mb-6 p-4">
          <h2 id="duty-h" className="mb-2 flex items-center gap-2 text-base font-bold"><FiShield className="text-brand" /> {t('Security on duty now')}</h2>
          {!onDuty.data.onDuty?.length ? (
            <p className="text-sm text-muted">{t('No guard is rostered right now. In an emergency call 112 or press SOS.')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {onDuty.data.onDuty.map((g) => (
                <li key={g.userId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{g.name}</p>
                    <p className="text-xs text-muted">{g.postName || String(g.post || '').replace(/_/g, ' ')} · {t('until')} {g.endTime}{g.checkedIn ? '' : ` · ${t('not clocked in yet')}`}</p>
                  </div>
                  {g.phone && <a className="btn-secondary btn-sm" href={`tel:${g.phone}`} aria-label={`${t('Call')} ${g.name}`}><FiPhone size={14} /> {t('Call')}</a>}
                </li>
              ))}
            </ul>
          )}
          {onDuty.data.head?.phone && <p className="mt-2 text-xs text-muted">{t('Head of security')}: {onDuty.data.head.name} · <a className="font-semibold text-brand" href={`tel:${onDuty.data.head.phone}`}>{onDuty.data.head.phone}</a></p>}
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

      {hasPlace && <TopNews items={live.data?.news} />}

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
                    <span className="w-9 shrink-0 text-right font-display text-2xl font-extrabold leading-none tabular-nums sm:w-10 sm:text-3xl">{a.n}</span>
                    <span className="min-w-0 flex-1 text-sm">{t(a.label)}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand">
                      <span className="sr-only sm:not-sr-only">{t(a.cta)}</span> <FiArrowRight className="transition-transform group-hover:translate-x-0.5" />
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
