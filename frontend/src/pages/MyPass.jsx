import { useAuth } from '../contexts/AuthContext'
import { useT } from '../contexts/LanguageContext'
import useApi from '../hooks/useApi'
import { PassCard } from '../components/PassCard'
import { ListSkeleton, PageHeader } from '../components/ui'
import { MovementList } from '../components/Movements'

// My own permanent entry pass, with my recent comings and goings.
const MyPass = () => {
  const { t } = useT()
  const { user } = useAuth()
  const history = useApi(`/passes/user/${user?._id || user?.id}/history`, { params: { limit: 15 }, enabled: Boolean(user), select: (d) => d.events || [] })

  return (
    <>
      <PageHeader title="My entry pass" subtitle="Show this QR code to the guard at the gate. It stays the same until you make a new one." />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <section className="panel p-5 sm:p-6"><PassCard /></section>
        <section className="panel overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 text-base font-bold">{t('Your recent entries and exits')}</h2>
          {history.loading && !history.data ? <ListSkeleton rows={4} /> : <MovementList events={history.data || []} family={user?.role === 'resident'} empty="Nothing yet. Your first scan at the gate will show up here." />}
        </section>
      </div>
    </>
  )
}

export default MyPass
