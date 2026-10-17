import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiTool } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import useApi from '../hooks/useApi'
import RequestCard from '../components/RequestCard'
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Tabs } from '../components/ui'

const ServiceRequests = () => {
  const { user, isResident } = useAuth()
  const [tab, setTab] = useState('upcoming')
  const { data, loading, error, reload } = useApi('/service-requests', { params: { scope: tab, limit: 100 }, select: (d) => d.requests || [] })
  const isVendor = user?.role === 'vendor'

  return (
    <>
      <PageHeader
        title={isVendor ? 'All jobs' : isResident ? 'My bookings' : 'Service bookings'}
        subtitle={isVendor ? 'Everything residents have booked with you.' : 'Home service visits you have booked with vendors.'}
        action={
          isResident && (
            <Link to="/services" className="btn-primary">
              Book a service
            </Link>
          )
        }
      />

      <Tabs
        label="Booking period"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'past', label: 'Past' }
        ]}
      />

      {loading ? (
        <div className="panel"><ListSkeleton rows={4} /></div>
      ) : error ? (
        <div className="panel"><ErrorState message={error} onRetry={reload} /></div>
      ) : !data?.length ? (
        <div className="panel">
          <EmptyState
            icon={FiTool}
            title={tab === 'upcoming' ? 'Nothing booked' : 'No past bookings yet'}
            text={isResident ? 'Electricians, plumbers, carpenters and more are a few taps away.' : 'Bookings appear here as residents make them.'}
            action={isResident ? <Link to="/services" className="btn-primary">Find a vendor</Link> : null}
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((r) => (
            <RequestCard key={r._id} request={r} />
          ))}
        </ul>
      )}
    </>
  )
}

export default ServiceRequests
