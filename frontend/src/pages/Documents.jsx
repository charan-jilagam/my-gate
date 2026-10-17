import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiDownload, FiFileText, FiLink, FiLock, FiPlus, FiSearch, FiTrash2, FiUpload } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useAction from '../hooks/useAction'
import useDebounced from '../hooks/useDebounced'
import { useSocietyScope } from '../components/SocietyPicker'
import { ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, Modal, PageHeader, Spinner, Tabs, errorMessage, formatDate } from '../components/ui'
import { imgSrc } from '../utils/media'

const CATEGORIES = [
  ['bylaws', 'Bylaws and rules'],
  ['minutes', 'Meeting minutes'],
  ['circular', 'Circulars'],
  ['financial', 'Financial reports'],
  ['forms', 'Forms'],
  ['insurance', 'Insurance'],
  ['other', 'Other']
]
const label = (k) => CATEGORIES.find((c) => c[0] === k)?.[1] || k
const EMPTY = { title: '', category: 'bylaws', description: '', visibility: 'all', url: '', fileName: '', notify: false }

const Documents = () => {
  const { isAdmin } = useAuth()
  const { t } = useT()
  const scope = useSocietyScope()
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim())
  const { data, loading, error, reload } = useApi('/documents', {
    params: { ...scope.params, ...(category ? { category } : {}), ...(q ? { q } : {}) },
    enabled: scope.ready,
    select: (d) => d.documents || []
  })
  const { busy, run } = useAction(reload)
  const [form, setForm] = useState(null)
  const [mode, setMode] = useState('upload')
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(null)
  const fileInput = useRef(null)

  const upload = async (file) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) return toast.error('That file is larger than 10 MB.')
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const { data: res } = await api.post('/uploads/document', body, { headers: { 'Content-Type': undefined }, timeout: 120000 })
      setForm((f) => ({ ...f, url: res.url, fileName: res.name, title: f.title || res.name.replace(/\.pdf$/i, '') }))
    } catch (e) {
      toast.error(errorMessage(e, 'The upload failed. Try again.'))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.url) return toast.error(mode === 'upload' ? 'Choose a PDF to upload.' : 'Paste the link to the document.')
    const body = { title: form.title.trim(), category: form.category, description: form.description.trim(), visibility: form.visibility, url: form.url.trim(), fileName: form.fileName || undefined }
    if (!form._id) {
      body.notify = form.notify
      if (scope.societyId) body.societyId = scope.societyId
    }
    const ok = await run('save', () => (form._id ? api.put(`/documents/${form._id}`, body) : api.post('/documents', body)), 'Saved')
    if (ok) setForm(null)
  }

  const openForm = (doc) => {
    setMode(doc && !doc.url.startsWith('/uploads/') && doc.url.startsWith('https://') && !doc.fileName ? 'link' : 'upload')
    setForm(doc ? { ...EMPTY, ...doc, description: doc.description || '', fileName: doc.fileName || '' } : { ...EMPTY })
  }

  return (
    <>
      <PageHeader
        title="Society documents"
        subtitle="Bylaws, meeting minutes, circulars and forms in one place."
        action={isAdmin && scope.ready && <button className="btn-primary" onClick={() => openForm()}><FiPlus size={16} /> {t('Add document')}</button>}
      />
      {scope.picker}

      <Tabs label="Document type" value={category} onChange={setCategory} items={[{ key: '', label: 'All' }, ...CATEGORIES.map(([key, l]) => ({ key, label: l }))]} />
      <div className="relative mb-4 max-w-sm">
        <FiSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input className="input pl-9" type="search" aria-label={t('Search')} placeholder={t('Search')} value={query} maxLength={60} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {!scope.ready || loading ? (
        <div className="panel"><ListSkeleton rows={4} /></div>
      ) : error ? (
        <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
      ) : !data.length ? (
        <div className="panel"><EmptyState icon={FiFileText} title="No documents yet" text={isAdmin ? 'Add the bylaws and meeting minutes so residents can find them.' : 'The office has not added any documents yet.'} /></div>
      ) : (
        <ul className="panel divide-y divide-line">
          {data.map((d) => (
            <li key={d._id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-soft text-brand"><FiFileText size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.title}</p>
                <p className="text-xs text-muted">
                  {label(d.category)} · {formatDate(d.createdAt)}
                  {d.visibility === 'admins' && <span className="tag-warn ml-2 inline-flex items-center gap-1"><FiLock size={11} /> Office only</span>}
                </p>
                {d.description && <p className="mt-0.5 text-sm text-muted">{d.description}</p>}
              </div>
              <a className="btn-secondary btn-sm" href={imgSrc(d.url)} target="_blank" rel="noreferrer noopener">
                <FiDownload size={14} /> Open
              </a>
              {isAdmin && (
                <>
                  <button className="btn-ghost btn-sm" onClick={() => openForm(d)}>{t('Edit')}</button>
                  <button className="btn-ghost btn-sm text-danger" aria-label={`${t('Delete')} ${d.title}`} onClick={() => setRemoving(d)}><FiTrash2 size={14} /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? 'Edit document' : 'Add document'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setForm(null)}>{t('Cancel')}</button>
            <button className="btn-primary" form="doc-form" type="submit" disabled={busy === 'save' || uploading}>{busy === 'save' && <Spinner className="h-4 w-4" />} {t('Save')}</button>
          </>
        }
      >
        {form && (
          <form id="doc-form" onSubmit={save} className="space-y-4">
            <Field label="Title" htmlFor="d-title"><input id="d-title" required className="input" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="d-cat">
                <select id="d-cat" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </Field>
              <Field label="Who can open it" htmlFor="d-vis">
                <select id="d-vis" className="input" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                  <option value="all">Everyone in the society</option>
                  <option value="admins">Office only</option>
                </select>
              </Field>
            </div>
            <Field label="Description" htmlFor="d-desc" hint="Optional"><input id="d-desc" className="input" maxLength={400} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>

            <fieldset>
              <legend className="label">File</legend>
              <div className="mb-2 flex gap-2">
                {[['upload', 'Upload a PDF', FiUpload], ['link', 'Paste a link', FiLink]].map(([k, l, Icon]) => (
                  <button key={k} type="button" onClick={() => { setMode(k); setForm({ ...form, url: '', fileName: '' }) }} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${mode === k ? 'bg-brand text-brand-ink' : 'bg-surface text-muted ring-1 ring-line'}`}>
                    <Icon size={14} /> {l}
                  </button>
                ))}
              </div>
              {mode === 'upload' ? (
                <div>
                  <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="input" aria-label="PDF file" onChange={(e) => upload(e.target.files?.[0])} />
                  {uploading && <p className="mt-1 flex items-center gap-2 text-xs text-muted"><Spinner className="h-3 w-3" /> Uploading...</p>}
                  {form.url && !uploading && <p className="mt-1 text-xs font-medium text-ok">Ready: {form.fileName || form.url}</p>}
                  <p className="mt-1 text-xs text-muted">PDF only, up to 10 MB.</p>
                </div>
              ) : (
                <input className="input" type="url" inputMode="url" placeholder="https://" aria-label="Link" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              )}
            </fieldset>

            {!form._id && form.visibility === 'all' && (
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} /> Tell residents about this document
              </label>
            )}
          </form>
        )}
      </Modal>

      <ConfirmDialog open={!!removing} danger title="Remove this document?" text={removing?.title} confirmLabel="Remove" busy={busy === 'rm'} onClose={() => setRemoving(null)}
        onConfirm={async () => { const ok = await run('rm', () => api.delete(`/documents/${removing._id}`), 'Document removed'); if (ok) setRemoving(null) }} />
    </>
  )
}

export default Documents
