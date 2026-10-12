import { useState } from 'react'
import toast from 'react-hot-toast'
import { errorMessage } from '../components/ui'

/** Runs an async action with a busy key (to disable that row's buttons) and consistent toasts. */
const useAction = (onDone) => {
  const [busy, setBusy] = useState(null)

  const run = async (key, fn, successMessage) => {
    setBusy(key)
    try {
      const result = await fn()
      if (successMessage) toast.success(successMessage)
      await onDone?.()
      return result ?? true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    } finally {
      setBusy(null)
    }
  }

  return { busy, run }
}

export default useAction
