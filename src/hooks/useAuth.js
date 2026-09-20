import { useEffect, useState } from 'react'
import { subscribeToAuthChanges } from '../services/auth'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((nextUser) => {
      setUser(nextUser)
      setInitializing(false)
    })
    return unsubscribe
  }, [])

  return { user, initializing }
}
