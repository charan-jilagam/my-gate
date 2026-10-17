import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import useApi from '../hooks/useApi'
import { useT } from '../contexts/LanguageContext'

/**
 * Platform admins belong to no society, so screens that work on one society need them to choose it.
 * Everyone else just gets their own society: `params` is empty and `picker` renders nothing.
 */
export const useSocietyScope = () => {
  const { isSuperAdmin } = useAuth()
  const { t } = useT()
  const list = useApi('/societies', { enabled: isSuperAdmin, live: false, select: (d) => d.societies || [] })
  const [chosen, setChosen] = useState('')

  const societyId = isSuperAdmin ? chosen || list.data?.[0]?._id || '' : undefined
  const params = societyId ? { societyId } : {}

  const picker = isSuperAdmin ? (
    <div className="mb-4 max-w-xs">
      <label className="label" htmlFor="scope-society">
        {t('Society')}
      </label>
      <select id="scope-society" className="input" value={societyId || ''} onChange={(e) => setChosen(e.target.value)} disabled={list.loading}>
        {!list.data?.length && <option value="">{list.loading ? '...' : '-'}</option>}
        {(list.data || []).map((s) => (
          <option key={s._id} value={s._id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  ) : null

  return { societyId, params, picker, ready: !isSuperAdmin || !!societyId, loading: isSuperAdmin && list.loading }
}
