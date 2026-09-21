import './ReadOnlyBanner.css'

export function ReadOnlyBanner({ message = "Read-only — you can view this collection but can't make changes." }) {
  return <p className="read-only-banner">{message}</p>
}
