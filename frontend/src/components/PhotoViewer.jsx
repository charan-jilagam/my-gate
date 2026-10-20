import { useCallback, useEffect, useRef } from 'react'
import { FiChevronLeft, FiChevronRight, FiX } from 'react-icons/fi'
import { imgSrc } from '../utils/media'

/** Full-screen photo viewer: arrows, swipe, keyboard, caption and a counter. `index` null means closed. */
const PhotoViewer = ({ photos, index, onIndex, onClose }) => {
  const open = index !== null && index !== undefined && !!photos?.length
  const touch = useRef(null)
  const closeRef = useRef(null)

  const go = useCallback((step) => onIndex((i) => (i + step + photos.length) % photos.length), [onIndex, photos?.length])

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus?.()
    }
  }, [open, go, onClose])

  // Warm the neighbours so moving on is instant.
  useEffect(() => {
    if (!open || photos.length < 2) return
    ;[1, -1].forEach((s) => {
      const img = new Image()
      img.src = imgSrc(photos[(index + s + photos.length) % photos.length].url)
    })
  }, [open, index, photos])

  if (!open) return null
  const photo = photos[index]
  const many = photos.length > 1

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/92 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touch.current === null || !many) return
        const dx = e.changedTouches[0].clientX - touch.current
        touch.current = null
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span className="tabular-nums text-white/80">{index + 1} / {photos.length}</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close photo viewer" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <FiX size={20} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-14" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <img key={photo.url} src={imgSrc(photo.url)} alt={photo.caption || `Photo ${index + 1}`} className="fade-in max-h-full max-w-full rounded-md object-contain" draggable="false" />
        {many && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 hover:bg-white/20 sm:grid">
              <FiChevronLeft size={22} />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 hover:bg-white/20 sm:grid">
              <FiChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      <p className="min-h-[3.25rem] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-center text-sm text-white/85">{photo.caption || ''}</p>
    </div>
  )
}

export default PhotoViewer
