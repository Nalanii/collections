import { useState } from 'react'
import './App.css'
import { Admin } from './components/Admin'
import { CollectionView } from './components/CollectionView'
import { Home } from './components/Home'
import { SignIn } from './components/SignIn'
import { useAuth } from './hooks/useAuth'
import { signOutUser } from './services/auth'

function App() {
  const { user, initializing } = useAuth()
  const [adminCollectionId, setAdminCollectionId] = useState(undefined)
  const [openCollectionId, setOpenCollectionId] = useState(null)

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
  const showCollectionView = !showAdmin && openCollectionId !== null

  let content
  if (showAdmin) {
    content = (
      <Admin
        key={adminCollectionId ?? 'new'}
        user={user}
        collectionId={adminCollectionId}
        onDone={() => setAdminCollectionId(undefined)}
      />
    )
  } else if (showCollectionView) {
    content = (
      <CollectionView
        key={openCollectionId}
        collectionId={openCollectionId}
        user={user}
        onBack={() => setOpenCollectionId(null)}
        onManage={(collectionId) => setAdminCollectionId(collectionId)}
      />
    )
  } else {
    content = (
      <Home
        user={user}
        onCreateCollection={() => setAdminCollectionId(null)}
        onOpenCollection={(collectionId) => setOpenCollectionId(collectionId)}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Collections</h1>
        <button type="button" className="sign-out-button" onClick={signOutUser}>
          Sign out
        </button>
      </header>
      <main className="app-main">{content}</main>
    </div>
  )
}

export default App
