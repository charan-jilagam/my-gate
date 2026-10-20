import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SocketProvider } from './contexts/SocketContext'
import { LanguageProvider } from './contexts/LanguageContext'
import PrivateRoute, { FullPageSpinner } from './components/PrivateRoute'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const VerifyAccount = lazy(() => import('./pages/VerifyAccount'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const PublicPass = lazy(() => import('./pages/PublicPass'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Visitors = lazy(() => import('./pages/Visitors'))
const Deliveries = lazy(() => import('./pages/Deliveries'))
const Vehicles = lazy(() => import('./pages/Vehicles'))
const Notices = lazy(() => import('./pages/Notices'))
const Complaints = lazy(() => import('./pages/Complaints'))
const Payments = lazy(() => import('./pages/Payments'))
const Bookings = lazy(() => import('./pages/Bookings'))
const Profile = lazy(() => import('./pages/Profile'))
const GateConsole = lazy(() => import('./pages/GateConsole'))
const AdminResidents = lazy(() => import('./pages/AdminResidents'))
const AdminSocieties = lazy(() => import('./pages/AdminSocieties'))
const Swaps = lazy(() => import('./pages/Swaps'))
const Attendance = lazy(() => import('./pages/Attendance'))
const LiveGuards = lazy(() => import('./pages/LiveGuards'))
const GuardPosts = lazy(() => import('./pages/GuardPosts'))
const Nearby = lazy(() => import('./pages/Nearby'))
const Services = lazy(() => import('./pages/Services'))
const ServiceProvider = lazy(() => import('./pages/ServiceProvider'))
const ServiceRequests = lazy(() => import('./pages/ServiceRequests'))
const ServiceRequestDetail = lazy(() => import('./pages/ServiceRequestDetail'))
const WorkHome = lazy(() => import('./pages/WorkHome'))
const WorkSetup = lazy(() => import('./pages/WorkSetup'))
const AdminServices = lazy(() => import('./pages/AdminServices'))
const Community = lazy(() => import('./pages/Community'))
const CommunityPost = lazy(() => import('./pages/CommunityPost'))
const Emergency = lazy(() => import('./pages/Emergency'))
const DailyHelp = lazy(() => import('./pages/DailyHelp'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Documents = lazy(() => import('./pages/Documents'))
const Occasions = lazy(() => import('./pages/Occasions'))
const OccasionDetail = lazy(() => import('./pages/OccasionDetail'))
const Votes = lazy(() => import('./pages/Votes'))
const Upkeep = lazy(() => import('./pages/Upkeep'))
const Roster = lazy(() => import('./pages/Roster'))
const MyShifts = lazy(() => import('./pages/MyShifts'))
const Help = lazy(() => import('./pages/Help'))
const NotFound = lazy(() => import('./pages/NotFound'))

const ADMINS = ['society_admin', 'super_admin']
const OFFICE = [...ADMINS, 'guard_admin']

// Signed-in users have no reason to see the sign-in screens.
const GuestOnly = ({ children }) => {
  const { isAuthenticated, pendingApproval, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  // Unapproved residents are routed to the dashboard route, where the guard shows the "waiting for approval" screen.
  return isAuthenticated || pendingApproval ? <Navigate to="/dashboard" replace /> : children
}

function App() {
  return (
    <LanguageProvider>
    <AuthProvider>
      <SocketProvider>
        <Router>
          <ErrorBoundary>
          <Suspense fallback={<FullPageSpinner />}>
            <Routes>
              <Route path="/pass/:passId" element={<PublicPass />} />
              <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
              <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
              <Route path="/verify" element={<GuestOnly><VerifyAccount /></GuestOnly>} />
              <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
              <Route path="/reset-password/:token" element={<GuestOnly><ResetPassword /></GuestOnly>} />

              <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/visitors" element={<Visitors />} />
                <Route path="/deliveries" element={<Deliveries />} />
                <Route path="/vehicles" element={<Vehicles />} />
                <Route path="/notices" element={<Notices />} />
                <Route path="/notices/:id" element={<Notices />} />
                <Route path="/complaints" element={<Complaints />} />
                <Route path="/payments" element={<PrivateRoute roles={['resident', ...ADMINS]}><Payments /></PrivateRoute>} />
                <Route path="/bookings" element={<PrivateRoute roles={['resident', 'staff', ...ADMINS]}><Bookings /></PrivateRoute>} />
                <Route path="/services" element={<PrivateRoute roles={['resident', ...ADMINS]}><Services /></PrivateRoute>} />
                <Route path="/services/providers/:id" element={<PrivateRoute roles={['resident', ...ADMINS]}><ServiceProvider /></PrivateRoute>} />
                <Route path="/services/requests" element={<PrivateRoute roles={['resident', 'vendor', ...ADMINS]}><ServiceRequests /></PrivateRoute>} />
                <Route path="/services/requests/:id" element={<PrivateRoute roles={['resident', 'vendor', ...ADMINS]}><ServiceRequestDetail /></PrivateRoute>} />
                <Route path="/work" element={<PrivateRoute roles={['vendor']}><WorkHome /></PrivateRoute>} />
                <Route path="/work/setup" element={<PrivateRoute roles={['vendor']}><WorkSetup /></PrivateRoute>} />
                <Route path="/admin/services" element={<PrivateRoute roles={ADMINS}><AdminServices /></PrivateRoute>} />
                <Route path="/community" element={<PrivateRoute roles={['resident', ...ADMINS]}><Community /></PrivateRoute>} />
                <Route path="/community/:id" element={<PrivateRoute roles={['resident', ...ADMINS]}><CommunityPost /></PrivateRoute>} />
                <Route path="/emergency" element={<PrivateRoute roles={['resident', 'security', 'guard_admin', ...ADMINS]}><Emergency /></PrivateRoute>} />
                <Route path="/daily-help" element={<PrivateRoute roles={['resident', 'security', 'guard_admin', ...ADMINS]}><DailyHelp /></PrivateRoute>} />
                <Route path="/accounts" element={<PrivateRoute roles={['resident', ...ADMINS]}><Accounts /></PrivateRoute>} />
                <Route path="/documents" element={<PrivateRoute roles={['resident', 'security', 'guard_admin', 'staff', ...ADMINS]}><Documents /></PrivateRoute>} />
                <Route path="/occasions" element={<PrivateRoute roles={['resident', 'security', 'guard_admin', 'staff', ...ADMINS]}><Occasions /></PrivateRoute>} />
                <Route path="/occasions/:id" element={<PrivateRoute roles={['resident', 'security', 'guard_admin', 'staff', ...ADMINS]}><OccasionDetail /></PrivateRoute>} />
                <Route path="/votes" element={<PrivateRoute roles={['resident', ...ADMINS]}><Votes /></PrivateRoute>} />
                <Route path="/upkeep" element={<PrivateRoute roles={['resident', 'security', 'guard_admin', 'staff', ...ADMINS]}><Upkeep /></PrivateRoute>} />
                <Route path="/roster" element={<PrivateRoute roles={OFFICE}><Roster /></PrivateRoute>} />
                <Route path="/swaps" element={<PrivateRoute roles={['security', 'guard_admin', 'staff', ...ADMINS]}><Swaps /></PrivateRoute>} />
                <Route path="/attendance" element={<PrivateRoute roles={OFFICE}><Attendance /></PrivateRoute>} />
                <Route path="/live" element={<PrivateRoute roles={OFFICE}><LiveGuards /></PrivateRoute>} />
                <Route path="/nearby" element={<PrivateRoute roles={['resident', 'security', 'guard_admin', 'staff', ...ADMINS]}><Nearby /></PrivateRoute>} />
                <Route path="/guard-posts" element={<PrivateRoute roles={OFFICE}><GuardPosts /></PrivateRoute>} />
                <Route path="/my-shifts" element={<PrivateRoute roles={['security', 'guard_admin', 'staff']}><MyShifts /></PrivateRoute>} />
                <Route path="/help" element={<Help />} />
                {/* Notification links point at one record; these pages are lists, so open the list. */}
                {['visitors', 'deliveries', 'vehicles', 'complaints', 'payments', 'bookings', 'documents'].map((base) => (
                  <Route key={base} path={`/${base}/:id`} element={<Navigate to={`/${base}`} replace />} />
                ))}
                <Route path="/profile" element={<Profile />} />
                <Route path="/gate" element={<PrivateRoute roles={['security', 'guard_admin', ...ADMINS]}><GateConsole /></PrivateRoute>} />
                <Route path="/admin/residents" element={<PrivateRoute roles={[...ADMINS, 'staff']}><AdminResidents /></PrivateRoute>} />
                <Route path="/admin/societies" element={<PrivateRoute roles={ADMINS}><AdminSocieties /></PrivateRoute>} />
                <Route path="*" element={<NotFound />} />
              </Route>

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'rgb(var(--surface))',
                color: 'rgb(var(--ink))',
                border: '1px solid rgb(var(--line))',
                fontSize: '14px'
              }
            }}
          />
        </Router>
      </SocketProvider>
    </AuthProvider>
    </LanguageProvider>
  )
}

export default App
