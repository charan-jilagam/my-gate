import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowLeft, FiArrowRight, FiBookOpen, FiCheck, FiChevronRight, FiPrinter, FiSearch, FiX, FiZap } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import useApi from '../hooks/useApi'
import { ErrorState, ListSkeleton } from '../components/ui'

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
  const index = Math.max(0, shown.findIndex((s) => s.id === active))
  const current = shown[index]
  const prev = shown[index - 1]
  const next = shown[index + 1]

  useEffect(() => {
    if (shown.length && !shown.some((s) => s.id === active)) setActive(shown[0].id)
  }, [shown, active])

  const go = (id) => {
    setActive(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Intro band with the search: the first thing people reach for in a guide */}
      <header className="relative mb-6 overflow-hidden rounded-2xl bg-side px-6 py-7 text-white sm:px-9 sm:py-9 print:bg-transparent print:p-0 print:text-ink">
        <div className="hazard absolute inset-x-0 top-0 h-1.5 print:hidden" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0 max-w-2xl">
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 print:hidden"><FiBookOpen size={20} /></span>
            <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{manual?.title ? t(manual.title) : t('User guide')}</h1>
            {manual?.intro && <p className="mt-2 text-[15px] leading-relaxed text-white/80 print:text-muted">{t(manual.intro)}</p>}
          </div>
          {manual && (
            <button className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/20 print:hidden" onClick={() => window.print()}>
              <FiPrinter size={16} /> {t('Print or save as PDF')}
            </button>
          )}
        </div>
        <div className="relative mt-6 max-w-xl print:hidden">
          <FiSearch size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/60" aria-hidden="true" />
          <input
            className="block min-h-[48px] w-full rounded-xl border border-white/15 bg-white/10 pl-11 pr-11 text-base text-white placeholder:text-white/60 focus:border-white/40 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/20"
            type="search"
            aria-label={t('Search')}
            placeholder={t('Search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setQuery('')} aria-label="Clear search"><FiX size={16} /></button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="panel"><ListSkeleton rows={6} /></div>
      ) : error ? (
        <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="print:hidden">
            {!shown.length && <p className="rounded-xl bg-sunken px-4 py-4 text-sm text-muted">{`Nothing matches "${query}". Try a shorter word.`}</p>}
            {shown.length > 0 && (
              <select className="input lg:hidden" aria-label="Topic" value={current?.id || ''} onChange={(e) => go(e.target.value)}>
                {shown.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            )}
            <nav aria-label="Guide topics" className="hidden lg:sticky lg:top-20 lg:block">
              <p className="caption mb-2 px-3">{`${shown.length} ${shown.length === 1 ? 'topic' : 'topics'}`}</p>
              <ul className="max-h-[calc(100vh-9rem)] space-y-0.5 overflow-y-auto pr-1">
                {shown.map((s) => {
                  const on = current?.id === s.id
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => go(s.id)}
                        aria-current={on ? 'true' : undefined}
                        className={`group relative flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${on ? 'bg-brand-soft font-bold text-brand' : 'font-medium text-ink hover:bg-sunken'}`}
                      >
                        {on && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand" aria-hidden="true" />}
                        <span className="min-w-0 flex-1">{s.title}</span>
                        <FiChevronRight size={14} className={`shrink-0 transition-opacity ${on ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </aside>

          <div className="min-w-0">
            {/* On screen: the chosen topic. When printed: every topic. */}
            {shown.map((s) => (
              <article key={s.id} className={`panel overflow-hidden print:mb-6 print:break-inside-avoid print:border-0 print:shadow-none ${current?.id === s.id ? 'fade-in' : 'hidden print:block'}`} aria-labelledby={`h-${s.id}`}>
                <div className="px-6 pb-2 pt-6 sm:px-8 sm:pt-8">
                  <h2 id={`h-${s.id}`} className="text-2xl font-extrabold leading-tight sm:text-3xl">{s.title}</h2>
                  <p className="mt-2 max-w-prose text-base leading-relaxed text-muted">{s.summary}</p>
                </div>

                <ol className="relative px-6 py-5 sm:px-8">
                  <span className="absolute bottom-9 left-[2.15rem] top-9 w-px bg-line sm:left-[2.65rem] print:hidden" aria-hidden="true" />
                  {s.steps.map((step, i) => (
                    <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                      <span className="z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-brand-ink ring-4 ring-surface">{i + 1}</span>
                      <p className="max-w-prose pt-0.5 text-[15px] leading-7">{step}</p>
                    </li>
                  ))}
                </ol>

                {s.tips?.length > 0 && (
                  <div className="mx-6 mb-6 rounded-xl border border-amber/30 bg-amber-soft/70 px-5 py-4 sm:mx-8">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><FiZap size={14} className="text-amber" /> Good to know</h3>
                    <ul className="space-y-1.5 text-sm leading-relaxed">
                      {s.tips.map((tip, i) => (
                        <li key={i} className="flex gap-2"><FiCheck size={14} className="mt-1 shrink-0 text-brand" /><span>{tip}</span></li>
                      ))}
                    </ul>
                  </div>
                )}

                {s.path && s.path !== '/help' && (
                  <div className="border-t border-line bg-sunken/50 px-6 py-4 sm:px-8 print:hidden">
                    <Link to={s.path} className="btn-primary">Open this screen <FiArrowRight size={15} /></Link>
                  </div>
                )}
              </article>
            ))}

            {(prev || next) && (
              <nav className="mt-4 grid gap-3 sm:grid-cols-2 print:hidden" aria-label="More topics">
                {prev ? (
                  <button className="panel-link flex items-center gap-3 p-4 text-left" onClick={() => go(prev.id)}>
                    <FiArrowLeft size={16} className="shrink-0 text-muted" />
                    <span className="min-w-0"><span className="caption block">Previous</span><span className="block truncate font-semibold">{prev.title}</span></span>
                  </button>
                ) : <span />}
                {next && (
                  <button className="panel-link flex items-center justify-end gap-3 p-4 text-right sm:col-start-2" onClick={() => go(next.id)}>
                    <span className="min-w-0"><span className="caption block">Next</span><span className="block truncate font-semibold">{next.title}</span></span>
                    <FiArrowRight size={16} className="shrink-0 text-muted" />
                  </button>
                )}
              </nav>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Help
