import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FiArrowLeft, FiCheck, FiFlag, FiHeart, FiSend, FiTrash2 } from 'react-icons/fi'
import { FaThumbtack } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import { Avatar, ConfirmDialog, ErrorState, ListSkeleton, Spinner, formatDate, formatINR } from '../components/ui'
import { categoryLabel } from './Community'
import { imgSrc } from '../utils/media'

const RESOLVE = { buy_sell: ['Mark as sold', 'Mark as available'], lost_found: ['Mark as found', 'Mark as still missing'], help: ['Mark as solved', 'Reopen'] }

const CommunityPost = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const { data: post, loading, error, reload } = useApi(`/community/posts/${id}`, { select: (d) => d.post })
  const { busy, run } = useAction(reload)
  const [text, setText] = useState('')
  const [confirm, setConfirm] = useState(null)

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
    <>
      <Link to="/community" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><FiArrowLeft size={15} /> Community</Link>

      <article className="panel p-5">
        <div className="flex items-start gap-3">
          <Avatar name={post.author.name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{post.author.name}{post.author.isAdmin && <span className="tag-neutral ml-2">Office</span>}</p>
            <p className="text-xs text-muted">{post.author.flat && `${post.author.flat} · `}{formatDate(post.createdAt, true)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {post.isPinned && <span className="tag-neutral"><FaThumbtack size={10} /> Pinned</span>}
          <span className="tag-neutral">{categoryLabel(post.category)}</span>
          {post.isResolved && <span className="tag-ok">Closed</span>}
          {post.isHidden && <span className="tag-danger">Hidden{post.reportCount ? ` · ${post.reportCount} reports` : ''}</span>}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{post.title}</h1>
        {post.category === 'buy_sell' && post.price != null && <p className="mt-1 font-display text-2xl font-extrabold">{formatINR(post.price)}</p>}
        {post.body && <p className="mt-3 whitespace-pre-line leading-relaxed">{post.body}</p>}
        {post.images?.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {post.images.map((img) => (
              <li key={img.url}><a href={imgSrc(img.url)} target="_blank" rel="noreferrer"><img src={imgSrc(img.url)} alt={img.name || 'Photo'} className="h-32 w-32 rounded-md object-cover ring-1 ring-line" /></a></li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <button className="btn-secondary btn-sm" disabled={busy === 'like'} onClick={() => run('like', () => api.post(`/community/posts/${id}/like`))} aria-pressed={post.liked}>
            <FiHeart size={14} className={post.liked ? 'fill-current text-danger' : ''} /> {post.likeCount}
          </button>
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

      <section className="panel mt-5" aria-labelledby="c-h">
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
      <ConfirmDialog
        open={confirm === 'report'}
        title="Report this post?"
        text="The society office will be told. Posts with several reports are hidden until someone looks."
        confirmLabel="Report"
        busy={busy === 'rep'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const ok = await run('rep', () => api.post(`/community/posts/${id}/report`), 'Thanks. The office will look at it.')
          if (ok) setConfirm(null)
        }}
      />
    </>
  )
}

export default CommunityPost
