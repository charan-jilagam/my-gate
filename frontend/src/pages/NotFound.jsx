import { Link } from 'react-router-dom'
import { FiCompass } from 'react-icons/fi'
import { EmptyState } from '../components/ui'

const NotFound = () => (
  <div className="panel">
    <EmptyState
      icon={FiCompass}
      title="This page does not exist"
      text="The link may be old, or you may not have access to it."
      action={
        <Link to="/dashboard" className="btn-primary">
          Go to home
        </Link>
      }
    />
  </div>
)

export default NotFound
