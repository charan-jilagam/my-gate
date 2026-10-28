import { FiRefreshCw } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import useApi from '../hooks/useApi'
import LocationChip from '../components/LocationChip'
import { useLiveLocation } from '../contexts/LocationContext'
import { NewsRow, SoftNote } from '../components/insights'
import { ErrorState, ListSkeleton, PageHeader } from '../components/ui'

const News = () => {
  const { t, lang } = useT()
  const { params: where } = useLiveLocation()
  const news = useApi('/insights/news', { params: { lang, ...where }, live: false })
  const place = news.data?.place

  return (
    <>
      <PageHeader
        title="Local News"
        subtitle={place ? `${t('Headlines for')} ${place.city || place.label}` : 'Headlines for your city.'}
        action={
          <button className="btn-secondary btn-sm" onClick={news.reload} aria-label={t('Refresh')}>
            <FiRefreshCw size={14} /> {t('Refresh')}
          </button>
        }
      />

      <LocationChip place={place} className="mb-4" />

      {news.loading && !news.data ? (
        <ListSkeleton rows={6} />
      ) : news.error && !news.data ? (
        <ErrorState message={news.error} onRetry={news.reload} />
      ) : (
        <section className="panel overflow-hidden">
          {news.data.stale && <p className="bg-amber-soft px-4 py-2 text-xs font-semibold text-ink">{t('Showing saved headlines. The news service is not answering right now.')}</p>}
          {news.data.news.length === 0 ? (
            <SoftNote>{t('No news right now.')}</SoftNote>
          ) : (
            <ul className="divide-y divide-line">{news.data.news.map((n) => <li key={n.id}><NewsRow item={n} /></li>)}</ul>
          )}
        </section>
      )}

      <p className="mt-4 text-xs text-muted">{t('Headlines open on the publisher’s own website. Nivora only shows the headline and a link.')}</p>
    </>
  )
}

export default News
