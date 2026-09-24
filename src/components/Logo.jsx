import logoLight from '../assets/logo.png'
import logoDark from '../assets/logo-dark.png'
import './Logo.css'

// Renders both variants; Logo.css shows the one matching the active theme, so the
// swap follows the toggle and the OS setting without any JS.
export function Logo({ className = '', width, height }) {
  return (
    <>
      <img
        className={`${className} logo-img--light`}
        src={logoLight}
        alt=""
        width={width}
        height={height}
      />
      <img
        className={`${className} logo-img--dark`}
        src={logoDark}
        alt=""
        width={width}
        height={height}
      />
    </>
  )
}
