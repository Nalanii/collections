import { useRef, useState } from 'react'
import { Select } from './Select'
import './CollectionForm.css'

const EMOJI_OPTIONS = [
  '📀', '💿', '📼', '📚', '🎮', '🧸', '👗', '👟',
  '🎨', '🖼️', '🕹️', '📷', '🎭', '🧵', '🪙', '🪆',
  '⚱️', '🎲', '🧩', '🪅', '🗂️', '🏷️', '📦', '✨',
]

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
]

let nextRowKey = 0

function withRowKeys(fieldDefs) {
  return fieldDefs.map((fieldDef) => ({ ...fieldDef, _key: nextRowKey++ }))
}

export function CollectionForm({ initialValues, onSubmit, onCancel, submitLabel, submitting = false }) {
  const [name, setName] = useState(initialValues.name)
  const [emoji, setEmoji] = useState(initialValues.emoji)
  const [fieldDefs, setFieldDefs] = useState(() => withRowKeys(initialValues.fieldDefs))
  const [nameTouched, setNameTouched] = useState(false)
  const [emojiTouched, setEmojiTouched] = useState(false)
  const [fieldsTouched, setFieldsTouched] = useState(false)
  const lastAddedKeyRef = useRef(null)

  const trimmedName = name.trim()
  const validFieldDefs = fieldDefs.filter((fieldDef) => fieldDef.name.trim() !== '')
  const isValid = trimmedName !== '' && emoji !== '' && validFieldDefs.length > 0

  function handleFieldNameChange(key, value) {
    setFieldDefs((rows) =>
      rows.map((row) => (row._key === key ? { ...row, name: value } : row))
    )
  }

  function handleFieldTypeChange(key, value) {
    setFieldDefs((rows) =>
      rows.map((row) => (row._key === key ? { ...row, type: value } : row))
    )
  }

  function handleAddField() {
    const key = nextRowKey++
    lastAddedKeyRef.current = key
    setFieldDefs((rows) => [...rows, { _key: key, name: '', type: 'text' }])
  }

  function handleRemoveField(key) {
    setFieldDefs((rows) => rows.filter((row) => row._key !== key))
    setFieldsTouched(true)
  }

  function handleSubmit(event) {
    event.preventDefault()
    setNameTouched(true)
    setEmojiTouched(true)
    setFieldsTouched(true)
    if (!isValid) {
      return
    }
    onSubmit({
      name: trimmedName,
      emoji,
      fieldDefs: validFieldDefs.map(({ name: fieldName, type }) => ({
        name: fieldName.trim(),
        type,
      })),
    })
  }

  const submittingLabel = submitLabel.toLowerCase().includes('create') ? 'Creating…' : 'Saving…'

  const showNameError = nameTouched && trimmedName === ''
  const showEmojiError = emojiTouched && emoji === ''
  const showFieldsError = fieldsTouched && validFieldDefs.length === 0

  return (
    <form className="collection-form" onSubmit={handleSubmit} noValidate>
      <div className="collection-form-field">
        <label className="collection-form-label" htmlFor="collection-name">
          Name
        </label>
        <input
          id="collection-name"
          type="text"
          className="collection-form-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setNameTouched(true)}
          placeholder="e.g. Vinyl records"
        />
        {showNameError && <p className="collection-form-error">Name is required.</p>}
      </div>

      <div className="collection-form-field">
        <span className="collection-form-label">Emoji</span>
        <div className="emoji-grid" role="group" aria-label="Choose an emoji">
          {EMOJI_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`emoji-grid-option${option === emoji ? ' selected' : ''}`}
              aria-pressed={option === emoji}
              onClick={() => {
                setEmoji(option)
                setEmojiTouched(true)
              }}
            >
              {option}
            </button>
          ))}
        </div>
        {showEmojiError && <p className="collection-form-error">Choose an emoji.</p>}
      </div>

      <div className="collection-form-field">
        <span className="collection-form-label">Fields</span>
        <div className="field-def-rows">
          {fieldDefs.map((row) => (
            <div className="field-def-row" key={row._key}>
              <input
                type="text"
                className="collection-form-input field-def-name-input"
                value={row.name}
                onChange={(event) => handleFieldNameChange(row._key, event.target.value)}
                onBlur={() => setFieldsTouched(true)}
                placeholder="Field name"
                aria-label="Field name"
                ref={(node) => {
                  if (node && lastAddedKeyRef.current === row._key) {
                    node.focus()
                    lastAddedKeyRef.current = null
                  }
                }}
              />
              <Select
                className="field-def-type-select"
                options={FIELD_TYPES}
                value={row.type}
                onChange={(newValue) => handleFieldTypeChange(row._key, newValue)}
                ariaLabel="Field type"
              />
              <button
                type="button"
                className="field-def-remove-button"
                onClick={() => handleRemoveField(row._key)}
                aria-label="Remove field"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path
                    d="M3.5 3.5l9 9m0-9l-9 9"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="field-def-add-button" onClick={handleAddField}>
          + Add field
        </button>
        {showFieldsError && (
          <p className="collection-form-error">Add at least one field with a name.</p>
        )}
      </div>

      <div className="collection-form-actions">
        <button type="button" className="collection-form-cancel-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="collection-form-submit-button"
          disabled={!isValid || submitting}
        >
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  )
}
