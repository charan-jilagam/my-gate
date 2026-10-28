import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiCamera } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import { uploadImage } from './ImageUpload'
import { Avatar, Spinner, errorMessage } from './ui'

/** One round profile photo. `value` is the saved image link, `onChange` gets the new link (or '' when removed). */
const PhotoPicker = ({ value, onChange, name = '', size = 72 }) => {
  const { t } = useT()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const { url } = await uploadImage(file)
      onChange(url)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not upload that photo.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} src={value} size={size} />
      <div className="flex flex-col items-start gap-1">
        <button type="button" className="btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : <FiCamera size={14} />} {value ? t('Change photo') : t('Add photo')}
        </button>
        {value && !busy && <button type="button" className="text-xs font-semibold text-muted hover:text-danger" onClick={() => onChange('')}>{t('Remove photo')}</button>}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  )
}

export default PhotoPicker
