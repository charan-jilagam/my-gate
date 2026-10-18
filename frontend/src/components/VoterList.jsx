import { useMemo, useState } from 'react'
import { FiLock, FiSearch } from 'react-icons/fi'
import useApi from '../hooks/useApi'
import { Avatar, ErrorState, ListSkeleton, formatDate } from './ui'

/** Office only: who has voted and who has not. It never shows what anyone chose. */
const VoterList = ({ electionId, eligible }) => {
  const { data, loading, error, reload } = useApi(`/elections/${electionId}/voters`, { live: false })
  const [tab, setTab] = useState('voted')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    if (!data) return []
    const list = tab === 'voted' ? data.voted : data.waiting
    const needle = q.trim().toLowerCase()
    return needle ? list.filter((r) => `${r.name} ${r.flat}`.toLowerCase().includes(needle)) : list
  }, [data, tab, q])

  if (loading) return <ListSkeleton rows={3} />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const unit = data.voting === 'per_flat' ? 'flats' : 'residents'
  const total = eligible || data.votes + data.waiting.length
  const pct = total ? Math.min(100, Math.round((data.votes / total) * 100)) : 0

  return (
    <section className="rounded-xl border border-line" aria-label="Who has voted">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-end justify-between gap-3">
          <p className="font-display text-2xl font-extrabold leading-none">{pct}%<span className="ml-2 text-sm font-semibold text-muted">turnout</span></p>
          <p className="text-sm text-muted">{`${data.votes} of ${total} ${unit}`}</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Turnout">
          <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        <div className="flex gap-1 rounded-lg bg-sunken p-1" role="tablist" aria-label="Voter list">
          {[['voted', 'Voted', data.voted.length], ['waiting', 'Yet to vote', data.waiting.length]].map(([key, label, n]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors ${tab === key ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}>
              {label} <span className="text-muted">{n}</span>
            </button>
          ))}
        </div>
        <label className="relative ml-auto min-w-[10rem] flex-1 sm:max-w-[14rem]">
          <span className="sr-only">Search the list</span>
          <FiSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input className="input min-h-[36px] py-1.5 pl-8" type="search" placeholder="Search name or flat" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="border-t border-line px-4 py-6 text-center text-sm text-muted">{q ? 'Nobody matches that search.' : tab === 'voted' ? 'Nobody has voted yet.' : 'Everyone has voted.'}</p>
      ) : (
        <ul className="max-h-64 divide-y divide-line overflow-y-auto border-t border-line">
          {rows.map((r, i) => (
            <li key={`${r.flat}-${r.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={r.name} size={32} />
              <p className="min-w-0 flex-1 text-sm"><span className="block truncate font-semibold">{r.name}</span><span className="block text-xs text-muted">{r.flat || 'No flat'}</span></p>
              {r.votedAt && <span className="shrink-0 text-xs text-muted">{formatDate(r.votedAt, true)}</span>}
            </li>
          ))}
        </ul>
      )}

      {data.unlisted > 0 && tab === 'voted' && <p className="border-t border-line px-4 py-2.5 text-xs text-muted">{data.unlisted === 1 ? '1 earlier vote was cast before this list existed, so it is counted but not named.' : `${data.unlisted} earlier votes were cast before this list existed, so they are counted but not named.`}</p>}
      <p className="flex items-center gap-2 border-t border-line bg-sunken/50 px-4 py-2.5 text-xs text-muted"><FiLock size={12} /> You can see who took part. What each person chose stays secret.</p>
    </section>
  )
}

export default VoterList
