import { Link } from 'react-router-dom'
import { FiArrowRight, FiBell, FiCheckCircle } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import useApi from '../hooks/useApi'
import { PageHeader, formatDate, formatINR } from '../components/ui'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const count = (d, key) => d?.count ?? d?.[key]?.length ?? 0

const Dashboard = () => {
  const { user, isResident, isAdmin, isSecurity } = useAuth()
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
    isSecurity && { n: count(visitorsExpected.data, 'visitors'), label: 'invited visitors expected', to: '/gate', cta: 'Open console' }
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

  return (
    <>
      <PageHeader title={`${greeting()}, ${user?.name?.split(' ')[0] || 'there'}`} subtitle={subtitle || undefined} />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="attention-h" className="panel">
          <h2 id="attention-h" className="border-b border-line px-5 py-3.5 text-base font-bold">Needs your attention</h2>
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"><FiCheckCircle size={18} /></span>
              Nothing is waiting on you right now.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((a) => (
                <li key={a.label}>
                  <Link to={a.to} className="group flex items-center gap-4 px-5 py-4 hover:bg-sunken/60">
                    <span className="w-10 text-right font-display text-3xl font-extrabold leading-none">{a.n}</span>
                    <span className="flex-1 text-sm">{a.label}</span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
                      {a.cta} <FiArrowRight className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {glance.length > 0 && (
            <>
              <h2 className="border-y border-line px-5 py-3.5 text-base font-bold">Right now</h2>
              <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-3 sm:divide-y-0">
                {glance.map((g) => (
                  <Link key={g.label} to={g.to} className="px-5 py-4 hover:bg-sunken/60">
                    <p className="font-display text-2xl font-extrabold">{g.value}</p>
                    <p className="text-xs text-muted">{g.label}</p>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>

        <section aria-labelledby="recent-h" className="panel h-fit">
          <h2 id="recent-h" className="border-b border-line px-5 py-3.5 text-base font-bold">Recent activity</h2>
          {notifications.data?.length ? (
            <ul className="divide-y divide-line">
              {notifications.data.map((n) => (
                <li key={n._id} className="px-5 py-3.5">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-sm text-muted">{n.message}</p>
                  <p className="mt-1 text-xs text-muted">{formatDate(n.createdAt, true)}</p>
                </li>
              ))}
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
