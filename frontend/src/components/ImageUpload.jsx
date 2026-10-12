import { useRef, useState } from 'react'
import { FiImage, FiX } from 'react-icons/fi'
import toast from 'react-hot-toast'
import api from '../services/api'
import { imgSrc } from '../utils/media'
import { Spinner, errorMessage } from './ui'

// Shrinks big phone photos before upload so they send quickly on mobile data.
const shrink = (file, maxSide = 1600) =>
  new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return resolve(file)
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
        URL.revokeObjectURL(url)
        return resolve(file)
      }
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file)
        },
        'image/jpeg',
        0.85
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })

export const uploadImage = async (file) => {
  const body = new FormData()
  body.append('file', await shrink(file))
  const { data } = await api.post('/uploads', body, { headers: { 'Content-Type': undefined }, timeout: 60000 })
  return { url: data.url, name: data.name }
}

/** Picks and uploads up to `max` images. `value` is [{url, name}], `onChange` gets the new list. */
const ImageUpload = ({ value = [], onChange, max = 4, label = 'Add photos' }) => {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)

  const pick = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, max - value.length)
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    const added = []
    for (const file of files) {
      try {
        added.push(await uploadImage(file))
      } catch (err) {
        toast.error(errorMessage(err, 'Could not upload that image.'))
      }
    }
    setBusy(false)
    if (added.length) onChange([...value, ...added])
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((img, i) => (
          <div key={img.url} className="relative h-20 w-20 overflow-hidden rounded-md ring-1 ring-line">
            <img src={imgSrc(img.url)} alt={img.name || `Photo ${i + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="absolute right-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
            >
              <FiX size={14} />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="grid h-20 w-20 place-items-center rounded-md border border-dashed border-line text-muted hover:border-brand hover:text-brand"
          >
            {busy ? <Spinner className="h-5 w-5" /> : <span className="grid place-items-center gap-1 text-xs"><FiImage size={18} />{label}</span>}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple={max - value.length > 1} className="sr-only" onChange={pick} aria-label={label} />
    </div>
  )
}

export default ImageUpload
