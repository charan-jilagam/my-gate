import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiHeart, FiMessageCircle, FiPlus, FiSearch } from 'react-icons/fi'
import { FaThumbtack } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import useDebounced from '../hooks/useDebounced'
import ImageUpload from '../components/ImageUpload'
import { Avatar, EmptyState, ErrorState, Field, ListSkeleton, Modal, PageHeader, Spinner, Tabs, formatDate, formatINR } from '../components/ui'
import { imgSrc } from '../utils/media'

export const CATEGORIES = [
  { key: 'discussion', label: 'Discussion', hint: 'Ask neighbours, share news, suggest ideas' },
  { key: 'help', label: 'Help needed', hint: 'Borrow something, find a plumber, need a hand' },
  { key: 'buy_sell', label: 'Buy and sell', hint: 'Furniture, appliances, books and more' },
  { key: 'lost_found', label: 'Lost and found', hint: 'Keys, pets, parcels' },
  { key: 'recommendation', label: 'Recommendations', hint: 'Doctors, tutors, shops' },
  { key: 'event', label: 'Meet-ups', hint: 'Cricket on Sunday, yoga mornings' }
]
export const categoryLabel = (key) => CATEGORIES.find((c) => c.key === key)?.label || 'Discussion'
const RESOLVED_WORD = { buy_sell: 'Sold', lost_found: 'Found', help: 'Solved' }

const EMPTY = { title: '', body: '', category: 'discussion', price: '', images: [] }

export const PostCard = ({ post }) => (
  <li>
    <Link to={`/community/${post._id}`} className={`panel block p-4 transition-shadow hover:shadow-pop ${post.isResolved ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <Avatar name={post.author.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {post.isPinned && (
              <span className="tag-neutral"><FaThumbtack size={10} /> Pinned</span>
            )}
            <span className="tag-neutral">{categoryLabel(post.category)}</span>
            {post.isResolved && <span className="tag-ok">{RESOLVED_WORD[post.category] || 'Closed'}</span>}
            {post.isHidden && <span className="tag-danger">Hidden</span>}
          </div>
          <h3 className="mt-1 text-base font-bold">{post.title}</h3>
          {post.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{post.body}</p>}
          {post.category === 'buy_sell' && post.price != null && <p className="mt-1 font-display text-lg font-extrabold">{formatINR(post.price)}</p>}
          {post.images?.length > 0 && (
            <img src={imgSrc(post.images[0].url)} alt="" loading="lazy" className="mt-2 h-32 w-full rounded-md object-cover sm:w-56" />
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>{post.author.name}{post.author.flat ? ` · ${post.author.flat}` : ''}{post.author.isAdmin ? ' · Office' : ''}</span>
            <span>{formatDate(post.createdAt)}</span>
            <span className="inline-flex items-center gap-1"><FiHeart size={13} className={post.liked ? 'fill-current text-danger' : ''} /> {post.likeCount}</span>
            <span className="inline-flex items-center gap-1"><FiMessageCircle size={13} /> {post.commentCount}</span>
          </p>
        </div>
      </div>
    </Link>
  </li>
)

const Community = () => {
  const { isAdmin } = useAuth()
  const [category, setCategory] = useState('')
  const [scope, setScope] = useState('all')
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const { data, loading, error, reload } = useApi('/community/posts', {
    params: { category: category || undefined, q: q || undefined, scope: scope === 'all' ? undefined : scope },
    select: (d) => d.posts || []
  })
  const { busy, run } = useAction(reload)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [problem, setProblem] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setProblem('')
    if (form.title.trim().length < 3) return setProblem('Give your post a short title.')
    const ok = await run('create', () => api.post('/community/posts', {
      title: form.title.trim(),
      body: form.body.trim() || undefined,
      category: form.category,
      price: form.category === 'buy_sell' && form.price !== '' ? Number(form.price) : undefined,
      images: form.images
    }), 'Posted')
    if (ok) {
      setOpen(false)
      setForm(EMPTY)
    }
  }

  const chosen = CATEGORIES.find((c) => c.key === form.category)

  return (
    <>
      <PageHeader
        title="Community"
        subtitle="Talk to your neighbours, sell things, find lost items and get recommendations."
        action={<button className="btn-primary" onClick={() => setOpen(true)}><FiPlus size={16} /> New post</button>}
      />

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Category">
        {[{ key: '', label: 'All' }, ...CATEGORIES].map((c) => (
          <button key={c.key} role="tab" aria-selected={category === c.key} onClick={() => setCategory(c.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${category === c.key ? 'bg-brand text-brand-ink' : 'bg-surface text-muted ring-1 ring-line hover:text-ink'}`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" className="input pl-9" placeholder="Search posts" aria-label="Search posts" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Tabs label="Whose posts" value={scope} onChange={setScope} items={[{ key: 'all', label: 'Everyone' }, { key: 'mine', label: 'Mine' }, ...(isAdmin ? [{ key: 'reported', label: 'Reported' }] : [])]} />
      </div>

      {loading ? (
        <div className="panel"><ListSkeleton rows={4} /></div>
      ) : error ? (
        <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
      ) : !data?.length ? (
        <div className="panel">
          <EmptyState title={q || category ? 'No posts match' : 'No posts yet'} text={q || category ? 'Try a different search or category.' : 'Start the first conversation.'} action={<button className="btn-primary" onClick={() => setOpen(true)}>New post</button>} />
        </div>
      ) : (
        <ul className="space-y-3">{data.map((p) => <PostCard key={p._id} post={p} />)}</ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New post"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="post-form" type="submit" disabled={busy === 'create'}>
              {busy === 'create' && <Spinner className="h-4 w-4" />} Post
            </button>
          </>
        }
      >
        <form id="post-form" onSubmit={submit} className="space-y-4">
          <Field label="Type of post" htmlFor="p-cat" hint={chosen?.hint}>
            <select id="p-cat" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Title" htmlFor="p-title"><input id="p-title" className="input" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          {form.category === 'buy_sell' && (
            <Field label="Price (rupees)" htmlFor="p-price"><input id="p-price" type="number" min="0" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          )}
          <Field label="Details" htmlFor="p-body" hint="Optional"><textarea id="p-body" rows={4} maxLength={2000} className="input" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <Field label="Photos" hint="Optional, up to 4"><ImageUpload value={form.images} onChange={(images) => setForm({ ...form, images })} max={4} /></Field>
          {problem && <p role="alert" className="text-sm font-medium text-danger">{problem}</p>}
        </form>
      </Modal>
    </>
  )
}

export default Community
