import './App.css'
import { Admin } from './components/Admin'
import { CollectionView } from './components/CollectionView'
import { DecorBackground } from './components/DecorBackground'
import { Header } from './components/Header'
import { Home } from './components/Home'
import { Logo } from './components/Logo'
import { OfflineBanner } from './components/OfflineBanner'
import { SignIn } from './components/SignIn'
import { useAuth } from './hooks/useAuth'
import { useRoute } from './hooks/useRoute'
import { signOutUser } from './services/auth'

function App() {
  const { user, initializing } = useAuth()
  const [route, navigate] = useRoute()

  if (initializing) {
    return (
      <div className="app-shell app-shell--loading">
        <Logo className="app-shell-loading-logo" width="80" height="80" />
      </div>
    )
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

  const showAdmin = route.view === 'admin'
  const showCollectionView = route.view === 'collection'

  let content
  if (showAdmin) {
    content = (
      <Admin
        key={route.collectionId ?? 'new'}
        user={user}
        collectionId={route.collectionId ?? undefined}
        onDone={goHome}
        onCancel={
          route.collectionId
            ? () => navigate(`/collections/${encodeURIComponent(route.collectionId)}`)
            : goHome
        }
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
  } else {
    content = (
      <Home
        user={user}
        onCreateCollection={() => navigate('/admin')}
        onOpenCollection={(collectionId) => navigate(`/collections/${encodeURIComponent(collectionId)}`)}
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
      <OfflineBanner />
      <div className={`app-content${showHome ? ' decor-host' : ''}`}>
        {showHome && <DecorBackground />}
        <main className="app-main">{content}</main>
      </div>
    </div>
  )
}

export default App
