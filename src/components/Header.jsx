import logo from '../assets/logo.png'
import './Header.css'

export function Header({ onLogoClick, action }) {
  const title = (
    <>
      <img className="app-header-logo" src={logo} alt="" width="36" height="36" />
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
        {action}
      </div>
    </header>
  )
}
