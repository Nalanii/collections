import './BackButton.css'

export function BackChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M10 3.5L5.5 8l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BackButton({ onClick }) {
  return (
    <button type="button" className="back-button" onClick={onClick}>
      <BackChevronIcon /> Back
    </button>
  )
}
