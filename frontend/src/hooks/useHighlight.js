import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Notification links open a list with ?highlight=<id>. Once the list has loaded, scroll to that item and flash it,
// so the person lands exactly on what the message was about. Items mark themselves with data-item-id.
// Scrolls to the visible element for an id (a phone shows the list version, a desktop the table) and flashes it.
export const flashItem = (id) => {
  const el = Array.from(document.querySelectorAll('[data-item-id]')).find((n) => n.getAttribute('data-item-id') === String(id) && (n.offsetParent !== null || n.getClientRects().length))
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('flash-highlight')
  setTimeout(() => el.classList.remove('flash-highlight'), 3500)
  return true
}

export const useHighlight = (ready = true) => {
  const { search } = useLocation()
  const id = new URLSearchParams(search).get('highlight')
  useEffect(() => {
    if (!id || !ready) return undefined
    const timer = setTimeout(() => flashItem(id), 150)
    return () => clearTimeout(timer)
  }, [id, ready])
  return id
}

export default useHighlight
