// Loads every screen's code in the background once the person is signed in, a few at a time while the phone is idle.
// Without this, the first visit to each screen waits for its code to download, which looks like a flicker.
const loaders = [
  () => import('./pages/Dashboard'),
  () => import('./pages/Visitors'),
  () => import('./pages/Deliveries'),
  () => import('./pages/Vehicles'),
  () => import('./pages/Notices'),
  () => import('./pages/Complaints'),
  () => import('./pages/Payments'),
  () => import('./pages/Bookings'),
  () => import('./pages/Profile'),
  () => import('./pages/GateConsole'),
  () => import('./pages/AdminResidents'),
  () => import('./pages/AdminSocieties'),
  () => import('./pages/Swaps'),
  () => import('./pages/Attendance'),
  () => import('./pages/LiveGuards'),
  () => import('./pages/GuardPosts'),
  () => import('./pages/Nearby'),
  () => import('./pages/Services'),
  () => import('./pages/ServiceProvider'),
  () => import('./pages/ServiceRequests'),
  () => import('./pages/ServiceRequestDetail'),
  () => import('./pages/WorkHome'),
  () => import('./pages/WorkSetup'),
  () => import('./pages/AdminServices'),
  () => import('./pages/Community'),
  () => import('./pages/CommunityPost'),
  () => import('./pages/Emergency'),
  () => import('./pages/DailyHelp'),
  () => import('./pages/Accounts'),
  () => import('./pages/Documents'),
  () => import('./pages/Votes'),
  () => import('./pages/Upkeep'),
  () => import('./pages/Roster'),
  () => import('./pages/MyShifts'),
  () => import('./pages/Help'),
  () => import('./pages/NotFound'),
]

let started = false

export const preloadPages = () => {
  if (started || typeof window === 'undefined') return
  started = true
  // Phones on a slow or saving-data connection keep the old behaviour: load a screen only when it is opened.
  const c = navigator.connection
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return
  let i = 0
  const next = () => {
    if (i >= loaders.length) return
    const load = loaders[i++]
    load().catch(() => {}).finally(() => setTimeout(idle, 120))
  }
  const idle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(next, { timeout: 2000 }) : setTimeout(next, 200))
  setTimeout(idle, 800)
}
