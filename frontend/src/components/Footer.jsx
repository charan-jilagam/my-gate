import { FiHeart } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'

/** Copyright line shown at the bottom of every screen. `tone` is for dark backgrounds (the sign-in panel). */
const Footer = ({ tone = 'default', className = '' }) => {
  const { t } = useT()
  const year = new Date().getFullYear()
  const dark = tone === 'dark'
  return (
    <footer className={`text-center text-xs leading-relaxed ${dark ? 'text-white/60' : 'text-muted'} ${className}`}>
      <p>{`© ${year} Nivora. ${t('All rights reserved.')}`}</p>
      <p data-no-translate className="mt-0.5 inline-flex flex-wrap items-center justify-center gap-1">
        Developed with <FiHeart size={12} className="fill-danger text-danger" aria-label="love" role="img" /> by Nivero-Dev Team
      </p>
    </footer>
  )
}

export default Footer
