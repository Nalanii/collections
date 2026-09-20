import './App.css'
import { SignIn } from './components/SignIn'
import { useAuth } from './hooks/useAuth'
import { signOutUser } from './services/auth'

function App() {
  const { user, initializing } = useAuth()

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

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Collections</h1>
        <button type="button" className="sign-out-button" onClick={signOutUser}>
          Sign out
        </button>
      </header>
      <main className="app-main">
        <p>Your collections will show up here.</p>
      </main>
    </div>
  )
}

export default App
