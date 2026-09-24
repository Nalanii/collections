import { useEffect, useRef, useState } from 'react'
import { moveOption, validateOptions } from '../utils/fieldOptions'
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
  { value: 'dropdown', label: 'Dropdown' },
]

const MAX_MAIN_FIELDS = 2

let nextRowKey = 0

function withRowKeys(fieldDefs) {
  return fieldDefs.map((fieldDef) => ({
    ...fieldDef,
    _key: nextRowKey++,
    // Stable per-option keys (UI only) so reordering doesn't remount inputs.
    _optionKeys: (fieldDef.options ?? []).map(() => nextRowKey++),
  }))
}

export function CollectionForm({ initialValues, onSubmit, onCancel, submitLabel, submitting = false }) {
  const [name, setName] = useState(initialValues.name)
  const [emoji, setEmoji] = useState(initialValues.emoji)
  const [fieldDefs, setFieldDefs] = useState(() => withRowKeys(initialValues.fieldDefs))
  const [nameTouched, setNameTouched] = useState(false)
  const [emojiTouched, setEmojiTouched] = useState(false)
  const [fieldsTouched, setFieldsTouched] = useState(false)
  const lastAddedKeyRef = useRef(null)
  const pendingMoveFocusRef = useRef(null)
  const formRef = useRef(null)

  // After a reorder, keep focus on the moved option's button (or the other
  // one if the moved option reached an end and that button is now disabled).
  useEffect(() => {
    const pending = pendingMoveFocusRef.current
    if (!pending) {
      return
    }
    pendingMoveFocusRef.current = null
    const find = (dir) =>
      formRef.current?.querySelector(
        `[data-option-key="${pending.optionKey}"][data-move="${dir}"]`
      )
    const preferred = find(pending.direction)
    const fallback = find(pending.direction === 'up' ? 'down' : 'up')
    const target = preferred && !preferred.disabled ? preferred : fallback
    target?.focus()
  }, [fieldDefs])

  const mainCount = fieldDefs.filter((fieldDef) => fieldDef.main).length
  const trimmedName = name.trim()
  const validFieldDefs = fieldDefs.filter((fieldDef) => fieldDef.name.trim() !== '')
  const trimmedFieldNames = validFieldDefs.map((fieldDef) => fieldDef.name.trim())
  const hasDuplicateFieldNames = new Set(trimmedFieldNames).size !== trimmedFieldNames.length
  const optionsErrors = new Map(
    fieldDefs
      .filter((fieldDef) => fieldDef.type === 'dropdown')
      .map((fieldDef) => [fieldDef._key, validateOptions(fieldDef.options)])
  )
  const hasInvalidOptions = validFieldDefs.some((fieldDef) => optionsErrors.get(fieldDef._key))
  const isValid =
    trimmedName !== '' &&
    emoji !== '' &&
    validFieldDefs.length > 0 &&
    !hasDuplicateFieldNames &&
    !hasInvalidOptions

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

  function handleFieldMainChange(key, checked) {
    setFieldDefs((rows) =>
      rows.map((row) => (row._key === key ? { ...row, main: checked } : row))
    )
  }

  function updateOptions(key, update, updateKeys = (keys) => keys) {
    setFieldDefs((rows) =>
      rows.map((row) =>
        row._key === key
          ? {
              ...row,
              options: update(row.options ?? []),
              _optionKeys: updateKeys(row._optionKeys ?? []),
            }
          : row
      )
    )
  }

  function handleOptionChange(key, index, value) {
    updateOptions(key, (options) => options.map((option, i) => (i === index ? value : option)))
  }

  function handleAddOption(key) {
    const optionKey = nextRowKey++
    updateOptions(key, (options) => [...options, ''], (keys) => [...keys, optionKey])
  }

  function handleMoveOption(key, index, direction, optionKey) {
    pendingMoveFocusRef.current = { optionKey, direction }
    updateOptions(
      key,
      (options) => moveOption(options, index, direction),
      (keys) => moveOption(keys, index, direction)
    )
  }

  function handleRemoveOption(key, index) {
    updateOptions(
      key,
      (options) => options.filter((_, i) => i !== index),
      (keys) => keys.filter((_, i) => i !== index)
    )
    setFieldsTouched(true)
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
      // `options` is only persisted for dropdown fields; switching away drops it.
      // `main` is only persisted when set.
      fieldDefs: validFieldDefs.map(({ name: fieldName, type, options, main }) => ({
        name: fieldName.trim(),
        type,
        ...(type === 'dropdown' && { options: options.map((option) => option.trim()) }),
        ...(main && { main: true }),
      })),
    })
  }

  const submittingLabel = submitLabel.toLowerCase().includes('create') ? 'Creating…' : 'Saving…'

  const showNameError = nameTouched && trimmedName === ''
  const showEmojiError = emojiTouched && emoji === ''
  const showFieldsError = fieldsTouched && validFieldDefs.length === 0
  const showDuplicateFieldsError = fieldsTouched && validFieldDefs.length > 0 && hasDuplicateFieldNames

  return (
    <form className="collection-form" ref={formRef} onSubmit={handleSubmit} noValidate>
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
            <div className="field-def" key={row._key}>
              <div className="field-def-row">
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
              <label className="field-def-main-label">
                <input
                  type="checkbox"
                  checked={Boolean(row.main)}
                  disabled={!row.main && mainCount >= MAX_MAIN_FIELDS}
                  onChange={(event) => handleFieldMainChange(row._key, event.target.checked)}
                />
                Primary field (max {MAX_MAIN_FIELDS})
              </label>
              {row.type === 'dropdown' && (
                <div className="field-def-options">
                  {(row.options ?? []).map((option, index, all) => {
                    const optionKey = row._optionKeys?.[index] ?? index
                    const fieldLabel = row.name.trim() || 'field'
                    return (
                    <div className="field-def-option-row" key={optionKey}>
                      <input
                        type="text"
                        className="collection-form-input"
                        value={option}
                        onChange={(event) => handleOptionChange(row._key, index, event.target.value)}
                        onBlur={() => setFieldsTouched(true)}
                        placeholder="Option"
                        aria-label={`Option ${index + 1} of ${fieldLabel}`}
                      />
                      <button
                        type="button"
                        className="field-def-move-button"
                        data-option-key={optionKey}
                        data-move="up"
                        disabled={index === 0}
                        onClick={() => handleMoveOption(row._key, index, 'up', optionKey)}
                        aria-label={`Move option ${index + 1} of ${fieldLabel} up`}
                      >
                        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                          <path
                            d="M3.5 10l4.5-4.5 4.5 4.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="field-def-move-button"
                        data-option-key={optionKey}
                        data-move="down"
                        disabled={index === all.length - 1}
                        onClick={() => handleMoveOption(row._key, index, 'down', optionKey)}
                        aria-label={`Move option ${index + 1} of ${fieldLabel} down`}
                      >
                        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                          <path
                            d="M3.5 6l4.5 4.5L12.5 6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="field-def-remove-button"
                        onClick={() => handleRemoveOption(row._key, index)}
                        aria-label={`Remove option ${index + 1} of ${fieldLabel}`}
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
                    )
                  })}
                  <button
                    type="button"
                    className="field-def-add-button"
                    onClick={() => handleAddOption(row._key)}
                  >
                    + Add option
                  </button>
                  {fieldsTouched && row.name.trim() !== '' && optionsErrors.get(row._key) && (
                    <p className="collection-form-error">{optionsErrors.get(row._key)}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="field-def-add-button" onClick={handleAddField}>
          + Add field
        </button>
        {showFieldsError && (
          <p className="collection-form-error">Add at least one field with a name.</p>
        )}
        {showDuplicateFieldsError && (
          <p className="collection-form-error">Field names must be unique.</p>
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
