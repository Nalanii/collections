import { useState } from 'react'
import './ConfirmDialog.css'

// `acknowledgement` (optional) is the label of a checkbox that must be ticked
// before the confirm button is enabled.
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, acknowledgement, onConfirm, onCancel }) {
  const [acknowledged, setAcknowledged] = useState(false)

  return (
    <div className="confirm-dialog-overlay" role="presentation" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog-title">
          {title}
        </h2>
        <p id="confirm-dialog-message" className="confirm-dialog-message">
          {message}
        </p>
        {acknowledgement && (
          <label className="confirm-dialog-acknowledgement">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>{acknowledgement}</span>
          </label>
        )}
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-dialog-confirm-button"
            disabled={Boolean(acknowledgement) && !acknowledged}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
