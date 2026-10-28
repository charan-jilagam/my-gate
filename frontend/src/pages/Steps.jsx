import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiAward, FiPause, FiPlay, FiZap } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import { Avatar, ErrorState, ListSkeleton, PageHeader, Tabs } from '../components/ui'
import { askMotionPermission, keepAwake, motionSupported, startCounting } from '../utils/stepCounter'

const SYNC_MS = 20000
const fmt = (n) => Number(n || 0).toLocaleString('en-IN')

// A ring that fills as the day's steps get closer to the goal.
const Ring = ({ steps, goal }) => {
  const pct = Math.min(1, steps / goal)
  const r = 84
  const c = 2 * Math.PI * r
  return (
    <div className="relative mx-auto h-56 w-56" role="img" aria-label={`${fmt(steps)} of ${fmt(goal)} steps`}>
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r={r} fill="none" strokeWidth="16" className="stroke-sunken" />
        <circle cx="100" cy="100" r={r} fill="none" strokeWidth="16" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="stroke-brand transition-[stroke-dashoffset] duration-500" />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <p className="font-display text-4xl font-extrabold tabular-nums">{fmt(steps)}</p>
        <p className="text-sm text-muted">/ {fmt(goal)}</p>
      </div>
    </div>
  )
}

const WeekBars = ({ week, goal }) => {
  const max = Math.max(goal, ...week.map((d) => d.steps))
  return (
    <div className="flex h-32 items-end justify-between gap-2" role="list" aria-label="Last 7 days">
      {week.map((d) => {
        const day = new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })
        return (
          <div key={d.date} role="listitem" className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${fmt(d.steps)}`}>
            <div className="flex h-24 w-full items-end rounded-md bg-sunken">
              <div className={`w-full rounded-md ${d.steps >= goal ? 'bg-brand' : 'bg-brand/50'}`} style={{ height: `${Math.max(d.steps ? 4 : 0, (d.steps / max) * 100)}%` }} />
            </div>
            <span className="text-[11px] text-muted">{day}</span>
          </div>
        )
      })}
    </div>
  )
}

const Steps = () => {
  const { t } = useT()
  const me = useApi('/steps/me', { live: false })
  const [period, setPeriod] = useState('today')
  const board = useApi('/steps/leaderboard', { params: { period }, live: false })

  const supported = motionSupported()
  const [counting, setCounting] = useState(false)
  const [total, setTotal] = useState(0) // today's steps: what the server had, plus what was counted here
  const totalRef = useRef(0)
  const savedRef = useRef(0)
  const baseSet = useRef(false)

  // Start from what the server already has for today (steps from earlier sessions or the Android app).
  useEffect(() => {
    if (me.data && !baseSet.current) {
      baseSet.current = true
      totalRef.current = me.data.steps
      savedRef.current = me.data.steps
      setTotal(me.data.steps)
    }
  }, [me.data])

  const save = useCallback(async () => {
    if (totalRef.current <= savedRef.current) return
    const steps = totalRef.current
    try {
      await api.post('/steps', { steps, source: 'web' })
      savedRef.current = steps
    } catch (e) {
      /* kept in memory; the next sync tries again */
    }
  }, [])

  useEffect(() => {
    if (!counting) return undefined
    let wake = null
    keepAwake().then((w) => { wake = w })
    const stop = startCounting((n) => {
      totalRef.current += n
      setTotal(totalRef.current)
    })
    const timer = setInterval(save, SYNC_MS)
    const hidden = () => { if (document.visibilityState === 'hidden') save() }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      stop()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', hidden)
      wake?.release?.().catch(() => {})
      save().then(() => { me.reload(); board.reload() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counting, save])

  const toggle = async () => {
    if (counting) return setCounting(false)
    if (!(await askMotionPermission())) return toast.error(t('Motion access was not allowed. Allow it in your browser settings to count steps.'))
    setCounting(true)
  }

  const data = me.data
  const goal = data?.goal || 8000
  const reached = total >= goal

  const toggleBoard = async () => {
    try {
      await api.put('/steps/settings', { leaderboard: !data.onLeaderboard })
      me.reload()
      board.reload()
    } catch (e) {
      toast.error(t('Could not change that. Try again.'))
    }
  }

  return (
    <>
      <PageHeader title="Walking challenge" subtitle="Walk with your neighbours. Reach your daily goal, keep your streak and see who is walking the most in the society." />

      {me.loading && !data ? <ListSkeleton rows={4} /> : me.error && !data ? <ErrorState message={me.error} onRetry={me.reload} /> : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <section className="panel p-5 text-center sm:p-6">
            <Ring steps={total} goal={goal} />
            <p className="mt-3 text-sm font-semibold">{reached ? t('Goal reached. Well done!') : `${fmt(goal - total)} ${t('steps to go')}`}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {supported ? (
                <button className={counting ? 'btn-secondary' : 'btn-primary'} onClick={toggle}>
                  {counting ? <FiPause size={16} /> : <FiPlay size={16} />} {counting ? t('Pause counting') : t('Start counting')}
                </button>
              ) : (
                <p className="max-w-xs text-sm text-muted">{t('This device cannot count steps. Open Nivora on your phone to join in.')}</p>
              )}
            </div>
            {counting && <p className="mt-3 text-xs text-muted" role="status">{t('Counting. Keep Nivora open and the phone with you.')}</p>}
            {supported && !counting && <p className="mt-3 text-xs text-muted">{t('Steps are counted while Nivora is open on your phone.')}</p>}

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <p className="flex items-center justify-center gap-1 font-display text-2xl font-extrabold"><FiZap size={18} className="text-amber" aria-hidden="true" /> {data?.streak || 0}</p>
                <p className="text-xs text-muted">{t('Day streak')}</p>
              </div>
              <div>
                <p className="font-display text-2xl font-extrabold tabular-nums">{fmt((data?.weekTotal || 0) - (data?.steps || 0) + total)}</p>
                <p className="text-xs text-muted">{t('Steps this week')}</p>
              </div>
            </div>
          </section>

          <div className="space-y-5">
            <section className="panel p-5">
              <h2 className="mb-3 text-base font-bold">{t('Last 7 days')}</h2>
              {data && <WeekBars week={data.week.map((d) => (d.date === data.today ? { ...d, steps: Math.max(d.steps, total) } : d))} goal={goal} />}
            </section>

            <section className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <h2 className="flex items-center gap-2 text-base font-bold"><FiAward size={18} className="text-amber" aria-hidden="true" /> {t('Society leaderboard')}</h2>
                <Tabs items={[{ key: 'today', label: 'Today' }, { key: 'week', label: 'This week' }]} value={period} onChange={setPeriod} label="Leaderboard period" />
              </div>
              {board.loading && !board.data ? <ListSkeleton rows={4} /> : board.error && !board.data ? <ErrorState message={board.error} onRetry={board.reload} /> : !board.data?.top?.length ? (
                <p className="px-4 py-6 text-sm text-muted">{t('Nobody has walked yet. Be the first!')}</p>
              ) : (
                <ol className="divide-y divide-line">
                  {board.data.top.map((r) => (
                    <li key={r.userId} className={`flex items-center gap-3 px-4 py-2.5 ${r.you ? 'bg-brand-soft/60' : ''}`}>
                      <span className="w-6 text-center font-display font-bold text-muted">{r.rank}</span>
                      <Avatar name={r.name} src={r.photo} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{r.you ? `${r.name} (${t('you')})` : r.name}</p>
                        {r.flat && <p className="text-xs text-muted">{r.flat}</p>}
                      </div>
                      <span className="font-display font-bold tabular-nums">{fmt(r.steps)}</span>
                    </li>
                  ))}
                </ol>
              )}
              {data && (
                <label className="flex items-center gap-2 border-t border-line px-4 py-3 text-sm">
                  <input type="checkbox" checked={data.onLeaderboard} onChange={toggleBoard} /> {t('Show my name on the leaderboard')}
                </label>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  )
}

export default Steps
