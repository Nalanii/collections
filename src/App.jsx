import { useState } from 'react'
import './App.css'
import { Admin } from './components/Admin'
import { CollectionView } from './components/CollectionView'
import { DecorBackground } from './components/DecorBackground'
import { Header } from './components/Header'
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

  function goHome() {
    setAdminCollectionId(undefined)
    setOpenCollectionId(null)
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

  const showHome = !showAdmin && !showCollectionView

  return (
    <div className="app-shell">
      <Header
        onLogoClick={goHome}
        action={
          <button type="button" className="header-action-button" onClick={signOutUser}>
            Sign out
          </button>
        }
      />
      <div className={`app-content${showHome ? ' decor-host' : ''}`}>
        {showHome && <DecorBackground />}
        <main className="app-main">{content}</main>
      </div>
    </div>
  )
}

export default App
