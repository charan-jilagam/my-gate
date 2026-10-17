import { useEffect, useState } from 'react'

/** The value, but only after it has stopped changing for `delay` ms. Keeps a search box from firing on every key. */
const useDebounced = (value, delay = 300) => {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return settled
}

export default useDebounced
