import { useMemo, useState, useEffect } from 'react'
import { applyFieldValueChange, subscribeToItems } from '../services/items'
import { findStandardizationGroups, groupKey } from '../utils/standardizationGroups'
import { Select } from './Select'
import './StandardizeValues.css'

const CUSTOM = '__custom__'

function GroupCard({ group, fieldName, onApply, onSkip }) {
  const [choice, setChoice] = useState(group.suggested)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const target = choice === CUSTOM ? custom.trim() : choice
  const affected = group.variants.filter((variant) => variant.value !== target)

  async function handleApply() {
    setError(null)
    setBusy(true)
    try {
      await onApply(group, target)
    } catch (err) {
      console.error(err)
      setError('Could not update items. Please try again.')
      setBusy(false)
    }
  }

  return (
    <li className="standardize-group">
      <fieldset className="standardize-variants" disabled={busy}>
        <legend className="standardize-legend">Choose the value to keep for {fieldName}</legend>
        {group.variants.map((variant) => (
          <label className="standardize-variant" key={variant.value}>
            <input
              type="radio"
              name={`standardize-${groupKey(group)}`}
              checked={choice === variant.value}
              onChange={() => setChoice(variant.value)}
            />
            <span className="standardize-variant-value">{variant.value}</span>
            <span className="standardize-variant-count">
              {variant.count} {variant.count === 1 ? 'item' : 'items'}
            </span>
            {variant.value === group.suggested && <span className="standardize-suggested">suggested</span>}
          </label>
        ))}
        <label className="standardize-variant">
          <input
            type="radio"
            name={`standardize-${groupKey(group)}`}
            checked={choice === CUSTOM}
            onChange={() => setChoice(CUSTOM)}
          />
          <input
            type="text"
            className="standardize-custom-input"
            value={custom}
            placeholder="Custom value"
            aria-label="Custom value"
            onFocus={() => setChoice(CUSTOM)}
            onChange={(event) => {
              setChoice(CUSTOM)
              setCustom(event.target.value)
            }}
          />
        </label>
      </fieldset>
      <div className="standardize-actions">
        <button
          type="button"
          className="standardize-apply-button"
          onClick={handleApply}
          disabled={busy || target === ''}
        >
          {busy ? 'Applying…' : 'Apply'}
        </button>
        <button type="button" className="standardize-skip-button" onClick={() => onSkip(group)} disabled={busy}>
          Skip
        </button>
        {target !== '' && affected.length === 0 && (
          <span className="standardize-hint">Nothing would change.</span>
        )}
      </div>
      {error && <p className="admin-error">{error}</p>}
    </li>
  )
}

export function StandardizeValues({ collectionId, fieldDefs }) {
  const textFields = useMemo(() => (fieldDefs ?? []).filter((fieldDef) => fieldDef.type === 'text'), [fieldDefs])
  const [items, setItems] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [selectedField, setSelectedField] = useState(null)
  const [skipped, setSkipped] = useState(() => new Set())
  const [result, setResult] = useState(null)

  useEffect(() => {
    return subscribeToItems(collectionId, (data, err) => {
      if (err) {
        console.error(err)
        setLoadError('Could not load items.')
        return
      }
      setLoadError(null)
      setItems(data)
    })
  }, [collectionId])

  const fieldName = textFields.some((fieldDef) => fieldDef.name === selectedField)
    ? selectedField
    : (textFields[0]?.name ?? null)

  const groups = useMemo(() => {
    if (items == null || fieldName == null) return []
    return findStandardizationGroups(items, fieldName).filter(
      (group) => !skipped.has(`${fieldName}\u0001${groupKey(group)}`)
    )
  }, [items, fieldName, skipped])

  async function handleApply(group, newValue) {
    const variantValues = new Set(group.variants.map((variant) => variant.value))
    const itemIds = items
      .filter((item) => {
        const raw = item.fields?.[fieldName]
        if (raw == null) return false
        const collapsed = String(raw).replace(/\s+/g, ' ').trim()
        return variantValues.has(collapsed) && String(raw) !== newValue
      })
      .map((item) => item.id)
    const changed = await applyFieldValueChange(itemIds, fieldName, newValue)
    setResult(`Updated ${changed} ${changed === 1 ? 'item' : 'items'}`)
  }

  function handleSkip(group) {
    setSkipped((prev) => new Set(prev).add(`${fieldName}\u0001${groupKey(group)}`))
  }

  return (
    <div className="standardize-zone">
      <h3 className="admin-section-title">Standardize values</h3>
      {textFields.length === 0 ? (
        <p className="standardize-message">This collection has no text fields.</p>
      ) : (
        <>
          <Select
            className="standardize-field-select"
            options={textFields.map((fieldDef) => ({ value: fieldDef.name, label: fieldDef.name }))}
            value={fieldName}
            onChange={(value) => {
              setSelectedField(value)
              setResult(null)
            }}
            ariaLabel="Field to standardize"
          />
          {loadError && <p className="admin-error">{loadError}</p>}
          {result && (
            <p className="standardize-result" role="status">
              {result}
            </p>
          )}
          {items == null && !loadError ? (
            <p className="standardize-message">Loading items…</p>
          ) : groups.length === 0 ? (
            <p className="standardize-message">Nothing to standardize</p>
          ) : (
            <ul className="standardize-groups">
              {groups.map((group) => (
                <GroupCard
                  key={`${fieldName}\u0001${groupKey(group)}`}
                  group={group}
                  fieldName={fieldName}
                  onApply={handleApply}
                  onSkip={handleSkip}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
