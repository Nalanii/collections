import { Logo } from './Logo.jsx'
import { ThemeToggle } from './ThemeToggle.jsx'
import './Header.css'

export function Header({ onLogoClick, action }) {
  const title = (
    <>
      <Logo className="app-header-logo" width="36" height="36" />
      <span className="app-header-title">Collections</span>
    </>
  )

  return (
    <header className="app-header">
      <div className="app-header-inner">
        {onLogoClick ? (
          <button type="button" className="app-header-brand" onClick={onLogoClick}>
            {title}
          </button>
        ) : (
          <div className="app-header-brand">{title}</div>
        )}
        <div className="app-header-actions">
          <ThemeToggle />
          {action}
        </div>
      </div>
    </header>
  )
}
