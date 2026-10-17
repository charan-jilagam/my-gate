import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowRight, FiBookOpen, FiPrinter, FiSearch } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import useApi from '../hooks/useApi'
import { ErrorState, ListSkeleton, PageHeader } from '../components/ui'

// The guide comes from the server and is chosen by the signed-in account's role, so it only ever
// describes screens this person can actually open.
const Help = () => {
  const { t } = useT()
  const { data: manual, loading, error, reload } = useApi('/manual', { live: false, select: (d) => d.manual })
  const [query, setQuery] = useState('')
  const [active, setActive] = useState('')

  const sections = manual?.sections || []
  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () => {
      if (!q) return sections
      // Search what the reader sees (the translated sentence) as well as the English it came from.
      const words = (s) => [s.title, s.summary, ...(s.steps || []), ...(s.tips || [])]
      return sections.filter((s) => words(s).flatMap((w) => [w, t(w)]).join(' ').toLowerCase().includes(q))
    },
    [sections, q, t]
  )
  const current = shown.find((s) => s.id === active) || shown[0]

  useEffect(() => {
    if (current && current.id !== active) setActive(current.id)
  }, [current, active])

  return (
    <>
      <PageHeader
        title={manual?.title || 'User guide'}
        subtitle={manual?.intro}
        action={manual && <button className="btn-secondary print:hidden" onClick={() => window.print()}><FiPrinter size={16} /> Print or save as PDF</button>}
      />
      {loading ? (
        <div className="panel"><ListSkeleton rows={6} /></div>
      ) : error ? (
        <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <div className="print:hidden">
            <div className="relative mb-3">
              <FiSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input className="input pl-9" type="search" aria-label={t('Search')} placeholder={t('Search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {/* Phones: a dropdown, so the chosen topic is right below instead of after a long list. */}
            {!shown.length && <p className="mb-3 rounded-md bg-sunken px-3 py-3 text-sm text-muted">Nothing matches "{query}".</p>}
            {shown.length > 0 && (
              <select className="input lg:hidden" aria-label="Topic" value={current?.id || ''} onChange={(e) => setActive(e.target.value)}>
                {shown.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            )}
            <nav aria-label="Guide topics" className="panel hidden max-h-[60vh] overflow-y-auto p-1.5 lg:sticky lg:top-20 lg:block">
              <ul>
                {shown.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => setActive(s.id)} aria-current={current?.id === s.id ? 'true' : undefined} className={`block w-full rounded-md px-3 py-2 text-left text-sm font-semibold ${current?.id === s.id ? 'bg-brand text-brand-ink' : 'text-ink hover:bg-sunken'}`}>
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="min-w-0">
            {/* On screen: the chosen topic. When printed: every topic. */}
            {shown.map((s) => (
              <article key={s.id} className={`panel p-5 sm:p-6 print:mb-6 print:break-inside-avoid print:border-0 print:p-0 ${current?.id === s.id ? '' : 'hidden print:block'}`} aria-labelledby={`h-${s.id}`}>
                <h2 id={`h-${s.id}`} className="flex items-center gap-2 text-xl font-bold"><FiBookOpen size={18} className="text-brand print:hidden" /> {s.title}</h2>
                <p className="mt-1 text-muted">{s.summary}</p>
                <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-muted">How it works</h3>
                <ol className="space-y-3">
                  {s.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                {s.tips?.length > 0 && (
                  <div className="mt-5 rounded-md bg-sunken px-4 py-3">
                    <h3 className="mb-1 text-sm font-bold">Good to know</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{s.tips.map((tip, i) => <li key={i}>{tip}</li>)}</ul>
                  </div>
                )}
                {s.path && s.path !== '/help' && <Link to={s.path} className="btn-primary mt-5 print:hidden">Open this screen <FiArrowRight size={15} /></Link>}
              </article>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export default Help
