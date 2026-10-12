import { useEffect, useRef, useState } from 'react'
import { FiX, FiAlertCircle, FiInbox } from 'react-icons/fi'

/* ---------- Formatting helpers ---------- */

export const formatDate = (value, withTime = false) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {})
  })
}

export const formatINR = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0)

export const titleCase = (s = '') =>
  String(s)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

export const errorMessage = (error, fallback = 'Something went wrong. Try again.') => {
  const data = error?.response?.data
  if (data?.errors?.length) return [...new Set(data.errors.map((e) => e.msg))].join('. ')
  return data?.message || fallback
}

/* ---------- Page structure ---------- */

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 max-w-prose text-sm text-muted">{subtitle}</p>}
    </div>
    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
  </div>
)

export const Spinner = ({ className = 'h-5 w-5' }) => (
  <span
    className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    role="status"
    aria-label="Loading"
  />
)

export const EmptyState = ({ icon: Icon = FiInbox, title, text, action }) => (
  <div className="flex flex-col items-center px-6 py-14 text-center">
    <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-sunken text-muted">
      <Icon size={22} />
    </span>
    <p className="font-display text-lg font-bold">{title}</p>
    {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
)

export const ErrorState = ({ message, onRetry }) => (
  <div className="flex flex-col items-center px-6 py-14 text-center">
    <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger">
      <FiAlertCircle size={22} />
    </span>
    <p className="font-display text-lg font-bold">Could not load this page</p>
    <p className="mt-1 max-w-sm text-sm text-muted">{message || 'Check your connection and try again.'}</p>
    {onRetry && (
      <button className="btn-secondary mt-4" onClick={onRetry}>
        Try again
      </button>
    )}
  </div>
)

export const ListSkeleton = ({ rows = 5 }) => (
  <div className="divide-y divide-line" aria-hidden="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 px-4 py-4">
        <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-1/3" />
          <div className="skeleton h-3 w-1/2" />
        </div>
        <div className="skeleton h-6 w-16" />
      </div>
    ))}
  </div>
)

/* ---------- Status tags ---------- */

const STATUS_TONE = {
  // positive
  approved: 'ok',
  completed: 'ok',
  resolved: 'ok',
  closed: 'ok',
  delivered: 'ok',
  paid: 'ok',
  confirmed: 'ok',
  active: 'ok',
  // waiting
  pending: 'warn',
  open: 'warn',
  in_progress: 'warn',
  in_transit: 'info',
  checked_in: 'info',
  // negative
  rejected: 'danger',
  failed: 'danger',
  cancelled: 'danger',
  expired: 'danger',
  urgent: 'danger',
  high: 'danger',
  // neutral
  checked_out: 'neutral',
  low: 'neutral',
  medium: 'neutral'
}

export const StatusTag = ({ status, label }) => {
  const tone = STATUS_TONE[status] || 'neutral'
  return <span className={`tag-${tone}`}>{label || titleCase(status)}</span>
}

/* ---------- Forms ---------- */

export const Field = ({ label, hint, error, children, htmlFor, className = '' }) => (
  <div className={className}>
    {label && (
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
    )}
    {children}
    {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
    {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
  </div>
)

/* ---------- Modal ---------- */

export const Modal = ({ open, onClose, title, children, footer, size = 'md' }) => {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    // Read the latest onClose through a ref. Callers pass a new inline function on every render, and
    // depending on it here would re-run this effect (and refocus the first field) on every keystroke.
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const first = panelRef.current?.querySelector('input:not([type="hidden"]), select, textarea, button:not([data-close])')
    first?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-[#031414]/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92vh] w-full flex-col rounded-t-lg bg-surface shadow-pop sm:rounded-lg ${width}`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button data-close className="btn-ghost -mr-2 min-h-0 p-2" onClick={onClose} aria-label="Close dialog">
            <FiX size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>
  )
}

export const ConfirmDialog = ({ open, title, text, confirmLabel = 'Confirm', danger, busy, onConfirm, onClose }) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    size="sm"
    footer={
      <>
        <button className="btn-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />}
          {confirmLabel}
        </button>
      </>
    }
  >
    <p className="text-sm text-muted">{text}</p>
  </Modal>
)

/* ---------- Data list ---------- */
/* A register-style list: a table from md up, stacked rows on phones. */

export const DataList = ({ columns, rows, rowKey = (r) => r._id, loading, error, onRetry, empty, pageSize = 15 }) => {
  const [page, setPage] = useState(1)
  const total = rows?.length || 0
  const pages = Math.max(1, Math.ceil(total / pageSize))
  // Filtering or reloading can leave the current page past the end.
  useEffect(() => {
    if (page > pages) setPage(pages)
  }, [page, pages])
  const shown = pageSize ? (rows || []).slice((page - 1) * pageSize, page * pageSize) : rows

  if (loading) return <div className="panel"><ListSkeleton /></div>
  if (error) return <div className="panel"><ErrorState message={error} onRetry={onRetry} /></div>
  if (!rows?.length) return <div className="panel">{empty}</div>

  return (
    <div className="panel overflow-hidden">
      <table className="hidden min-w-full md:table">
        <thead>
          <tr className="border-b border-line bg-sunken text-left text-xs font-semibold text-muted">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-2.5 ${c.className || ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((row) => (
            <tr key={rowKey(row)} className="align-middle hover:bg-sunken/60">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 text-sm ${c.className || ''}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-line md:hidden">
        {shown.map((row) => (
          <li key={rowKey(row)} className="space-y-2 px-4 py-3.5">
            {columns.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-4 text-sm">
                <span className="shrink-0 text-muted">{c.header}</span>
                <span className="min-w-0 text-right">{c.render ? c.render(row) : row[c.key]}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
      {total > pageSize && (
        <nav className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-sm" aria-label="Pagination">
          <p className="text-muted">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </nav>
      )}
    </div>
  )
}
