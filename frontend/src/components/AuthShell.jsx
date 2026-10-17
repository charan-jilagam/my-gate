import { FiCheck } from 'react-icons/fi'
import { Logo } from './Layout'

const POINTS = [
  'Guests are pre-approved before they reach the gate',
  'Deliveries wait at the gate until you say so',
  'Maintenance paid online, with a receipt on record'
]

/** Two-column sign-in layout: the brand panel on the left, the form on the right. */
const AuthShell = ({ title, subtitle, children, footer }) => (
  <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-side p-12 text-white lg:flex">
      <div className="hazard absolute inset-x-0 top-0 h-2" aria-hidden="true" />
      <div>
        <Logo />
        <p className="mt-2 text-sm font-medium tracking-wide text-amber">Every Community. One Platform.</p>
      </div>
      <div>
        <p className="font-display text-4xl font-extrabold leading-tight">
          Know who is at your gate before they ring the bell.
        </p>
        <ul className="mt-8 space-y-3 text-white/80">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber text-[#1b1400]">
                <FiCheck size={12} strokeWidth={3} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-white/50">Residents, guards and society admins, in one place.</p>
    </aside>

    <main className="flex items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 lg:hidden">
          <Logo />
          <p className="mt-1 text-xs font-medium text-muted">Every Community. One Platform.</p>
        </div>
        <h1 className="text-3xl font-extrabold">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
      </div>
    </main>
  </div>
)

export default AuthShell
