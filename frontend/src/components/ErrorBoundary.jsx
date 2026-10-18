import { Component } from 'react'
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi'

/**
 * A page that throws while drawing must never leave a blank screen.
 * Shows what happened, lets the person try again, and keeps the rest of the app (menu, header) working.
 * Pass `resetKey` (for example the current path) so moving to another page clears the error.
 */
class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Visible in the browser console for whoever is debugging.
    console.error('Screen crashed:', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const text = String(error?.message || error)
    return (
      <div role="alert" className="mx-auto mt-10 max-w-lg rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger"><FiAlertTriangle size={22} /></span>
        <h1 className="mt-4 font-display text-2xl font-extrabold">This screen hit a problem</h1>
        <p className="mt-2 text-sm text-muted">Nothing you did was lost. Try again, and if it keeps happening, send the details below to the person who looks after the app.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={() => this.setState({ error: null })}><FiRefreshCw size={15} /> Try again</button>
          <button className="btn-secondary" onClick={() => window.location.reload()}>Reload the page</button>
        </div>
        <details className="mt-5 text-left text-xs text-muted">
          <summary className="cursor-pointer font-semibold">Details</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-sunken p-3 font-mono">{text}</pre>
        </details>
      </div>
    )
  }
}

export default ErrorBoundary
