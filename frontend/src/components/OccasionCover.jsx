import { useState } from 'react'
import { imgSrc } from '../utils/media'
import { kindIcon } from '../utils/occasions'

/** An occasion's cover photo, or a calm placeholder with the type's icon when there is no photo (or it fails to load). */
const OccasionCover = ({ src, kind, className = '', iconSize = 34, alt = '', eager = false }) => {
  const [failed, setFailed] = useState(false)
  const Icon = kindIcon(kind)
  if (!src || failed) {
    return (
      <div className={`grid place-items-center bg-brand-soft text-brand ${className}`} role="img" aria-label={alt || 'No photo'}>
        <Icon size={iconSize} strokeWidth={1.5} />
      </div>
    )
  }
  return <img src={imgSrc(src)} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} className={`object-cover ${className}`} />
}

export default OccasionCover
