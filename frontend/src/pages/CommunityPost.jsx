import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FiArrowLeft, FiCheck, FiEyeOff, FiFlag, FiHeart, FiMessageCircle, FiSend, FiTrash2 } from 'react-icons/fi'
import { FaThumbtack } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { Avatar, ConfirmDialog, ErrorState, ListSkeleton, Modal, Spinner, formatDate, formatINR } from '../components/ui'
import { categoryLabel } from './Community'
import { imgSrc } from '../utils/media'

const REPORT_REASONS = ['Spam', 'Rude or abusive', 'Wrong category', 'Not for this community', 'Other']
const RESOLVE = { buy_sell: ['Mark as sold', 'Mark as available'], lost_found: ['Mark as found', 'Mark as still missing'], help: ['Mark as solved', 'Reopen'] }

/** Office only: exactly who liked the post and who reported it, and why. */
const ActivityPanel = ({ post }) => {
  const [tab, setTab] = useState(post.reports.length ? 'reports' : 'likes')
  const tabs = [
    { key: 'likes', label: 'Liked by', n: post.likers.length },
    { key: 'reports', label: 'Reports', n: post.reports.length }
  ]
  return (
    <section className="panel mt-5 overflow-hidden" aria-labelledby="act-h">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id="act-h" className="text-base font-bold">Who reacted</h2>
        <div className="flex gap-1 rounded-lg bg-sunken p-1" role="tablist" aria-label="Reactions">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors ${tab === t.key ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}>
              {t.label} <span className={t.key === 'reports' && t.n ? 'text-danger' : 'text-muted'}>{t.n}</span>
            </button>
          ))}
        </div>
      </div>
      {tab === 'likes' ? (
        post.likers.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Nobody has liked this yet.</p> : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {post.likers.map((u, i) => (
              <li key={u.id || i} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                <Avatar name={u.name} size={34} />
                <p className="min-w-0 text-sm"><span className="block truncate font-semibold">{u.name}</span><span className="block text-xs text-muted">{u.flat || (u.isAdmin ? 'Society office' : 'No flat')}</span></p>
              </li>
            ))}
          </ul>
        )
      ) : post.reports.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Nobody has reported this post.</p>
      ) : (
        <ul>
          {post.reports.map((r, i) => (
            <li key={r.by.id || i} className="flex gap-3 border-b border-line px-5 py-3.5 last:border-0">
              <Avatar name={r.by.name} size={34} />
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{r.by.name} <span className="font-normal text-muted">{r.by.flat && `· ${r.by.flat}`}</span></p>
                <p className="mt-0.5 text-muted">{r.reason ? `"${r.reason}"` : 'No reason given.'}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const CommunityPost = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const { data: post, loading, error, reload } = useApi(`/community/posts/${id}`, { select: (d) => d.post })
  const { busy, run } = useAction(reload)
  const [text, setText] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [reportWhy, setReportWhy] = useState('')
  const [reportNote, setReportNote] = useState('')

  if (loading) return <div className="panel"><ListSkeleton rows={4} /></div>
  if (error || !post) return <div className="panel"><ErrorState message={error || 'This post is no longer available.'} onRetry={reload} /></div>

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    const ok = await run('comment', () => api.post(`/community/posts/${id}/comments`, { text: text.trim() }))
    if (ok) setText('')
  }
  const [resolveOn, resolveOff] = RESOLVE[post.category] || []

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/community" className="mb-4 inline-flex items-center gap-1.5 rounded-lg py-1 text-sm font-semibold text-muted hover:text-ink"><FiArrowLeft size={15} /> Community</Link>

      {post.isHidden && isAdmin && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger" role="status">
          <FiEyeOff size={16} /> {post.reportCount ? `Hidden from residents after ${post.reportCount} ${post.reportCount === 1 ? 'report' : 'reports'}. Only the office can see it.` : 'Hidden from residents. Only the office can see it.'}
        </p>
      )}

      <article className="panel overflow-hidden">
        <div className="p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <Avatar name={post.author.name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{post.author.name}{post.author.isAdmin && <span className="tag-neutral ml-2">Office</span>}</p>
            <p className="text-xs text-muted">{post.author.flat && `${post.author.flat} · `}{formatDate(post.createdAt, true)}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {post.isPinned && <span className="tag-neutral"><FaThumbtack size={10} /> Pinned</span>}
          <span className="tag-neutral">{categoryLabel(post.category)}</span>
          {post.isResolved && <span className="tag-ok">Closed</span>}
          {post.isHidden && <span className="tag-danger">Hidden{post.reportCount ? ` · ${post.reportCount} reports` : ''}</span>}
        </div>
        <h1 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">{post.title}</h1>
        {post.category === 'buy_sell' && post.price != null && <p className="mt-1 font-display text-2xl font-extrabold">{formatINR(post.price)}</p>}
        {post.body && <p className="mt-4 max-w-prose whitespace-pre-line text-[15px] leading-7">{post.body}</p>}
        {post.images?.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {post.images.map((img) => (
              <li key={img.url}><a href={imgSrc(img.url)} target="_blank" rel="noreferrer"><img src={imgSrc(img.url)} alt={img.name || 'Photo'} className="h-40 w-40 rounded-xl object-cover ring-1 ring-edge transition-transform hover:scale-[1.02]" /></a></li>
            ))}
          </ul>
        )}

        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken/40 px-5 py-3 sm:px-7">
          <button className="btn-secondary btn-sm" disabled={busy === 'like'} onClick={() => run('like', () => api.post(`/community/posts/${id}/like`))} aria-pressed={post.liked}>
            <FiHeart size={14} className={post.liked ? 'fill-current text-danger' : ''} /> {post.likeCount}
          </button>
          <span className="inline-flex items-center gap-1.5 px-2 text-sm text-muted"><FiMessageCircle size={14} /> {post.commentCount}</span>
          {post.mine && resolveOn && (
            <button className="btn-secondary btn-sm" disabled={busy === 'resolve'} onClick={() => run('resolve', () => api.put(`/community/posts/${id}/resolve`))}>
              <FiCheck size={14} /> {post.isResolved ? resolveOff : resolveOn}
            </button>
          )}
          {isAdmin && (
            <>
              <button className="btn-secondary btn-sm" onClick={() => run('pin', () => api.put(`/community/posts/${id}/pin`), post.isPinned ? 'Unpinned' : 'Pinned')}>{post.isPinned ? 'Unpin' : 'Pin'}</button>
              <button className="btn-secondary btn-sm" onClick={() => run('vis', () => api.put(`/community/posts/${id}/visibility`, { isHidden: !post.isHidden }), post.isHidden ? 'Post restored' : 'Post hidden')}>{post.isHidden ? 'Restore' : 'Hide'}</button>
            </>
          )}
          {!post.mine && (
            <button className="btn-ghost btn-sm" onClick={() => setConfirm('report')}><FiFlag size={14} /> Report</button>
          )}
          {post.canManage && (
            <button className="btn-ghost btn-sm text-danger" onClick={() => setConfirm('delete')}><FiTrash2 size={14} /> Delete</button>
          )}
        </div>
      </article>

      {isAdmin && post.likers && <ActivityPanel post={post} />}

      <section className="panel mt-5 overflow-hidden" aria-labelledby="c-h">
        <h2 id="c-h" className="border-b border-line px-5 py-3.5 text-base font-bold">Replies ({post.commentCount})</h2>
        {post.comments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No replies yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {post.comments.map((c) => (
              <li key={c._id} className="flex gap-3 px-5 py-3.5">
                <Avatar name={c.author.name} size={32} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{c.author.name} <span className="font-normal text-muted">{c.author.flat && `· ${c.author.flat}`} · {formatDate(c.createdAt, true)}</span></p>
                  <p className="mt-0.5 whitespace-pre-line">{c.text}</p>
                </div>
                {c.canDelete && (
                  <button className="btn-ghost btn-sm" aria-label="Delete reply" onClick={() => run(c._id, () => api.delete(`/community/posts/${id}/comments/${c._id}`))}><FiTrash2 size={14} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={send} className="flex gap-2 border-t border-line p-4">
          <input className="input flex-1" placeholder="Write a reply" aria-label="Write a reply" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-primary" type="submit" disabled={busy === 'comment' || !text.trim()}>
            {busy === 'comment' ? <Spinner className="h-4 w-4" /> : <FiSend size={15} />} Reply
          </button>
        </form>
      </section>

      <ConfirmDialog
        open={confirm === 'delete'}
        danger
        title="Delete this post?"
        text="The post and its replies will be removed for everyone."
        confirmLabel="Delete"
        busy={busy === 'del'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const ok = await run('del', () => api.delete(`/community/posts/${id}`), 'Post deleted')
          if (ok) navigate('/community', { replace: true })
        }}
      />
      <Modal
        open={confirm === 'report'}
        onClose={() => setConfirm(null)}
        title="Report this post"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
            <button
              className="btn-danger"
              disabled={busy === 'rep'}
              onClick={async () => {
                const reason = [reportWhy, reportNote.trim()].filter(Boolean).join(': ')
                const ok = await run('rep', () => api.post(`/community/posts/${id}/report`, { reason }), 'Thanks. The office will look at it.')
                if (ok) { setConfirm(null); setReportWhy(''); setReportNote('') }
              }}
            >
              {busy === 'rep' && <Spinner className="h-4 w-4" />} Report post
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">The society office is told who reported it and why. Posts with several reports are hidden until someone looks.</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
          {REPORT_REASONS.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={reportWhy === r} onClick={() => setReportWhy(r)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${reportWhy === r ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface hover:border-brand'}`}>
              {r}
            </button>
          ))}
        </div>
        <input className="input mt-3" aria-label="More detail" placeholder="Add a detail (optional)" maxLength={120} value={reportNote} onChange={(e) => setReportNote(e.target.value)} />
      </Modal>
    </div>
  )
}

export default CommunityPost
