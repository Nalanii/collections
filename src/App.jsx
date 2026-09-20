import { useState } from 'react'
import './App.css'
import { Admin } from './components/Admin'
import { SignIn } from './components/SignIn'
import { useAuth } from './hooks/useAuth'
import { signOutUser } from './services/auth'

function App() {
  const { user, initializing } = useAuth()
  const [adminCollectionId, setAdminCollectionId] = useState(undefined)

  if (initializing) {
    return <div className="app-shell app-shell--loading" />
  }

  if (!user) {
    return (
      <div className="app-shell">
        <SignIn />
      </div>
    )
  }

  const showAdmin = adminCollectionId !== undefined

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Collections</h1>
        <button type="button" className="sign-out-button" onClick={signOutUser}>
          Sign out
        </button>
      </header>
      <main className="app-main">
        {showAdmin ? (
          <Admin
            key={adminCollectionId ?? 'new'}
            user={user}
            collectionId={adminCollectionId}
            onDone={() => setAdminCollectionId(undefined)}
          />
        ) : (
          <>
            <p>Your collections will show up here.</p>
            <button
              type="button"
              className="new-collection-button"
              onClick={() => setAdminCollectionId(null)}
            >
              + New collection
            </button>
          </>
        )}
      </main>
    </div>
  )
}

export default App
