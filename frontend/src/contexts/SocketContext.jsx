import { createContext, useContext, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'

const SocketContext = createContext({ socket: null, lastNotification: null })

export const useSocket = () => useContext(SocketContext)

// Dev: same origin (Vite proxies /socket.io). Production: same origin, or VITE_SOCKET_URL.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined

export const SocketProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth()
  const [socket, setSocket] = useState(null)
  const [lastNotification, setLastNotification] = useState(null)

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return undefined

    const newSocket = io(SOCKET_URL, { transports: ['websocket', 'polling'] })

    newSocket.on('connect', () => newSocket.emit('join-room', user.id))
    newSocket.on('notification', (notification) => {
      setLastNotification({ ...notification, receivedAt: Date.now() })
      toast(notification.title || 'New notification', { icon: '🔔', duration: 5000 })
    })

    setSocket(newSocket)
    return () => {
      newSocket.close()
      setSocket(null)
    }
  }, [isAuthenticated, user?.id])

  return <SocketContext.Provider value={{ socket, lastNotification }}>{children}</SocketContext.Provider>
}
