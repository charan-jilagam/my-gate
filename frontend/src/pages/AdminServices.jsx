import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiEye, FiEyeOff, FiShield, FiTool } from 'react-icons/fi'
import toast from 'react-hot-toast'
import api from '../services/api'
import useApi from '../hooks/useApi'
import useCategories from '../hooks/useCategories'
import RequestCard from '../components/RequestCard'
import { Avatar, EmptyState, ErrorState, ListSkeleton, PageHeader, Stars, Tabs, errorMessage } from '../components/ui'

const AdminServices = () => {
  const [tab, setTab] = useState('vendors')
  const { labelOf } = useCategories()
  const vendors = useApi('/services/admin/providers', { select: (d) => d.providers || [] })
  const bookings = useApi('/service-requests', { params: { scope: 'upcoming', limit: 100 }, enabled: tab === 'bookings', select: (d) => d.requests || [] })
  const [busy, setBusy] = useState('')

  const change = async (p, path, body, msg) => {
    setBusy(p._id)
    try {
      await api.put(`/services/providers/${p._id}/${path}`, body)
      toast.success(msg)
      vendors.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <PageHeader title="Home services" subtitle="Vendors who offer services to residents. Verify the ones you have checked." />
      <Tabs label="Services" value={tab} onChange={setTab} items={[{ key: 'vendors', label: 'Vendors' }, { key: 'bookings', label: 'Bookings' }]} />

      {tab === 'vendors' &&
        (vendors.loading ? (
          <div className="panel"><ListSkeleton rows={4} /></div>
        ) : vendors.error ? (
          <div className="panel"><ErrorState message={vendors.error} onRetry={vendors.reload} /></div>
        ) : !vendors.data.length ? (
          <div className="panel">
            <EmptyState icon={FiTool} title="No vendors yet" text="Vendors sign up with the Vendor role. Approve them under Residents, then they set up their schedule." action={<Link to="/admin/residents" className="btn-secondary">Open approvals</Link>} />
          </div>
        ) : (
          <ul className="space-y-3">
            {vendors.data.map((p) => (
              <li key={p._id} className="panel flex flex-wrap items-center gap-4 p-4">
                <Avatar name={p.name} src={p.photo} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {p.name}
                    {p.isVerified && <span className="tag-ok"><FiShield size={12} /> Verified</span>}
                    {!p.isActive && <span className="tag-danger">Hidden</span>}
                    {!p.accountApproved && <span className="tag-neutral">Account not approved</span>}
                  </p>
                  <p className="text-sm text-muted">{p.categories.map(labelOf).join(', ')}{p.phone ? ` · ${p.phone}` : ''}</p>
                  <p className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                    <Stars value={p.rating.avg} count={p.rating.count} /> <span>{p.jobsCompleted} jobs</span> <span>{p.openJobs} open</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary btn-sm" disabled={busy === p._id} onClick={() => change(p, 'verify', { isVerified: !p.isVerified }, p.isVerified ? 'Verification removed' : 'Vendor verified')}>
                    <FiShield size={14} /> {p.isVerified ? 'Unverify' : 'Verify'}
                  </button>
                  <button className="btn-secondary btn-sm" disabled={busy === p._id} onClick={() => change(p, 'status', { isActive: !p.isActive }, p.isActive ? 'Vendor hidden' : 'Vendor visible')}>
                    {p.isActive ? <FiEyeOff size={14} /> : <FiEye size={14} />} {p.isActive ? 'Hide' : 'Show'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'bookings' &&
        (bookings.loading ? (
          <div className="panel"><ListSkeleton rows={4} /></div>
        ) : bookings.error ? (
          <div className="panel"><ErrorState message={bookings.error} onRetry={bookings.reload} /></div>
        ) : !bookings.data?.length ? (
          <div className="panel"><EmptyState icon={FiTool} title="No upcoming bookings" text="Resident bookings with vendors show up here." /></div>
        ) : (
          <ul className="space-y-2">{bookings.data.map((r) => <RequestCard key={r._id} request={r} />)}</ul>
        ))}
    </>
  )
}

export default AdminServices
