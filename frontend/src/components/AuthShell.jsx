import { FiBell, FiCheckCircle, FiMapPin, FiShield, FiTruck } from 'react-icons/fi'
import { LogoMark } from './Layout'

const POINTS = [
  [FiShield, 'Guests are pre-approved before they reach the gate'],
  [FiTruck, 'Deliveries wait at the gate until you say so'],
  [FiCheckCircle, 'Maintenance paid online, with a receipt on record'],
  [FiMapPin, 'See who is on duty at the gate, right now'],
  [FiBell, 'Every notice and alert reaches you instantly']
]

/**
 * Sign-in layout. On a phone: a colourful header with the logo, and the form on a card that overlaps it.
 * On a computer: the brand panel on the left and the form on the right.
 */
const AuthShell = ({ title, subtitle, children, footer }) => (
  <div className="grid min-h-screen bg-bg lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
    {/* Brand panel (computer) */}
    <aside className="auth-hero relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
      <div className="hazard absolute inset-x-0 top-0 h-2" aria-hidden="true" />
      <span className="float-slow absolute -right-16 top-24 h-64 w-64 rounded-full bg-white/5 ring-1 ring-white/10" aria-hidden="true" />
      <span className="float-slower absolute -left-10 bottom-28 h-44 w-44 rounded-full bg-emerald-300/10 ring-1 ring-white/10" aria-hidden="true" />

      <div className="relative">
        <div className="inline-flex items-center gap-4 rounded-3xl bg-white px-5 py-4 shadow-pop">
          <img src="/logo-full.png" alt="Nivora: smart communities, safer living" className="h-36 w-auto" draggable="false" />
        </div>
      </div>

      <div className="relative">
        <p className="font-display text-4xl font-extrabold leading-tight">Know who is at your gate before they ring the bell.</p>
        <ul className="mt-8 space-y-3.5">
          {POINTS.map(([Icon, text]) => (
            <li key={text} className="flex items-center gap-3 text-sm text-white/85">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/12 text-amber ring-1 ring-white/15">
                <Icon size={16} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-xs text-white/55">Residents, guards and society admins, in one place.</p>
    </aside>

    <div className="flex flex-col">
      {/* Header (phone) */}
      <header className="auth-hero relative overflow-hidden px-5 pb-16 pt-[max(1.75rem,env(safe-area-inset-top))] text-white lg:hidden">
        <div className="hazard absolute inset-x-0 top-0 h-1.5" aria-hidden="true" />
        <span className="float-slow absolute -right-10 -top-6 h-40 w-40 rounded-full bg-white/6 ring-1 ring-white/10" aria-hidden="true" />
        <div className="relative flex items-center gap-3 pt-2">
          <LogoMark size={52} className="shadow-pop" />
          <div>
            <p className="font-display text-2xl font-extrabold leading-none tracking-tight">Nivora</p>
            <p className="mt-1 text-xs font-medium tracking-wide text-amber">Smart communities · Safer living</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-10 sm:px-8 lg:items-center lg:py-10">
        <div className="page-in relative z-10 -mt-10 w-full max-w-md rounded-3xl border border-edge/70 bg-surface p-6 shadow-pop sm:p-8 lg:mt-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <h1 className="text-3xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 rounded-xl bg-sunken px-4 py-3 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  </div>
)

export default AuthShell
