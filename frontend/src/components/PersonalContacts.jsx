import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FiPlus, FiTrash2, FiUsers, FiPhone } from 'react-icons/fi'
import { useT } from '../contexts/LanguageContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import { Field, Spinner, errorMessage } from './ui'

const RELATIONS = ['Family', 'Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Neighbour', 'Doctor', 'Other']
const blank = { name: '', phone: '', relation: 'Family', notify: true }

// "People to call or text in an emergency", kept by the resident on their own profile.
const PersonalContacts = () => {
  const { t } = useT()
  const { data, loading, reload } = useApi('/users/emergency-contacts', { live: false })
  const [list, setList] = useState([])
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setList(data.contacts || []) }, [data])

  const save = async (next) => {
    setBusy(true)
    try {
      const { data: res } = await api.put('/users/emergency-contacts', { contacts: next.map(({ name, phone, relation, notify }) => ({ name, phone, relation, notify })) })
      setList(res.contacts || next)
      toast.success(t('Saved'))
      setForm(null)
      reload()
      return true
    } catch (e) {
      toast.error(errorMessage(e))
      return false
    } finally { setBusy(false) }
  }
  const add = (e) => {
    e.preventDefault()
    save([...list, { ...form, name: form.name.trim(), phone: form.phone.trim() }])
  }

  return (
    <section className="panel p-5">
      <div className="mb-1 flex items-center gap-2"><FiUsers className="text-brand" /><h2 className="text-lg font-bold">{t('My emergency contacts')}</h2></div>
      <p className="mb-4 text-sm text-muted">{t('People we can text when you press SOS. You can also call them from the Emergency page.')}</p>
      {loading ? <Spinner /> : (
        <>
          {!list.length && !form && <p className="mb-3 rounded-lg bg-sunken px-4 py-3 text-sm text-muted">{t('You have not added anyone yet.')}</p>}
          <ul className="divide-y divide-edge">
            {list.map((c, i) => (
              <li key={c._id || i} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name} <span className="text-xs font-normal text-muted">· {c.relation}</span></p>
                  <p className="text-sm text-muted">{c.phone}</p>
                  <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={c.notify !== false} disabled={busy} onChange={(e) => save(list.map((x, j) => (j === i ? { ...x, notify: e.target.checked } : x)))} /> {t('Text them if I press SOS')}</label>
                </div>
                <a className="btn-secondary btn-sm" href={`tel:${c.phone}`} aria-label={`${t('Call')} ${c.name}`}><FiPhone size={14} /></a>
                <button className="btn-ghost btn-sm text-danger" aria-label={`${t('Remove')} ${c.name}`} disabled={busy} onClick={() => save(list.filter((_, j) => j !== i))}><FiTrash2 size={14} /></button>
              </li>
            ))}
          </ul>
          {form ? (
            <form onSubmit={add} className="mt-3 space-y-3 rounded-lg bg-canvas p-3 ring-1 ring-edge">
              <Field label="Name" htmlFor="ec-name"><input id="ec-name" required className="input" maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Mobile number" htmlFor="ec-phone"><input id="ec-phone" required inputMode="tel" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Who is this?" htmlFor="ec-rel"><select id="ec-rel" className="input" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })}>{RELATIONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} /> {t('Text them if I press SOS')}</label>
              <div className="flex gap-2"><button className="btn-primary flex-1" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} {t('Save contact')}</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}>{t('Cancel')}</button></div>
            </form>
          ) : list.length < 5 ? (
            <button className="btn-secondary mt-3 w-full" onClick={() => setForm({ ...blank })}><FiPlus /> {t('Add a contact')}</button>
          ) : <p className="mt-3 text-xs text-muted">{t('You can add up to 5 contacts.')}</p>}
        </>
      )}
    </section>
  )
}

export default PersonalContacts
