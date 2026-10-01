import { useRef } from 'react'
import './App.css'
import { Admin } from './components/Admin'
import { ArchivedCollections } from './components/ArchivedCollections'
import { CollectionView } from './components/CollectionView'
import { DecorBackground, DecorProvider, useDecorAvoid } from './components/DecorBackground'
import { Header } from './components/Header'
import { Home } from './components/Home'
import { Logo } from './components/Logo'
import { OfflineBanner } from './components/OfflineBanner'
import { SignIn } from './components/SignIn'
import { useAuth } from './hooks/useAuth'
import { useRoute } from './hooks/useRoute'
import { signOutUser } from './services/auth'

// Its own component so the avoid-zone registration unmounts with the splash and icons fill in.
function LoadingSplash() {
  const logoRef = useRef(null)
  useDecorAvoid(logoRef, 'rect')

  return (
    <div className="app-shell app-shell--loading">
      <div className="app-shell-loading-logo-frame" ref={logoRef}>
        <Logo className="app-shell-loading-logo" width="80" height="80" />
      </div>
    </div>
  )
}

function AppScreens() {
  const { user, initializing } = useAuth()
  const [route, navigate] = useRoute()

  if (initializing) {
    return <LoadingSplash />
  }

  if (!user) {
    return (
      <div className="app-shell">
        <SignIn />
      </div>
    )
  }

  function goHome() {
    navigate('/')
  }

  // Back to the collection being edited; a new collection has none, so it goes home.
  const goToCollection = route.collectionId
    ? () => navigate(`/collections/${encodeURIComponent(route.collectionId)}`)
    : goHome

  const showAdmin = route.view === 'admin'
  const showCollectionView = route.view === 'collection'
  const showArchived = route.view === 'archived'

  let content
  if (showAdmin) {
    content = (
      <Admin
        key={route.collectionId ?? 'new'}
        user={user}
        collectionId={route.collectionId ?? undefined}
        onDone={goHome}
        onCancel={goToCollection}
        onSaved={goToCollection}
      />
    )
  } else if (showCollectionView) {
    content = (
      <CollectionView
        key={route.collectionId}
        collectionId={route.collectionId}
        user={user}
        onBack={goHome}
        onManage={(collectionId) => navigate(`/admin/${encodeURIComponent(collectionId)}`)}
      />
    )
  } else if (showArchived) {
    content = (
      <ArchivedCollections
        user={user}
        onBack={goHome}
        onOpenCollection={(collectionId) => navigate(`/collections/${encodeURIComponent(collectionId)}`)}
      />
    )
  } else {
    content = (
      <Home
        user={user}
        onCreateCollection={() => navigate('/admin')}
        onOpenArchived={() => navigate('/archived')}
        onOpenCollection={(collectionId) => navigate(`/collections/${encodeURIComponent(collectionId)}`)}
      />
    )
  }

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
      <OfflineBanner />
      <div className="app-content">
        <main className="app-main">{content}</main>
      </div>
    </div>
  )
}

// One DecorBackground for the whole app keeps its icons put across the splash, sign-in and every route.
function App() {
  return (
    <DecorProvider>
      <DecorBackground />
      <AppScreens />
    </DecorProvider>
  )
}

export default App
