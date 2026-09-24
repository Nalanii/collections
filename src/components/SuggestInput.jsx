import { useMemo, useState } from 'react'
import { suggestFieldValues } from '../utils/suggestFieldValues'

// Free-text input with an accessible combobox listbox of fuzzy-matched values
// already used for this field. The user can always ignore the list and submit
// whatever they typed.
export function SuggestInput({ id, items, fieldName, value, onChange, inputRef }) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const suggestions = useMemo(
    () => suggestFieldValues(items, fieldName, value),
    [items, fieldName, value]
  )
  const expanded = open && suggestions.length > 0
  const listboxId = `${id}-listbox`
  const optionId = (index) => `${id}-option-${index}`

  function select(suggestion) {
    onChange(suggestion)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleChange(event) {
    onChange(event.target.value)
    setOpen(true)
    setActiveIndex(-1)
  }

  function handleKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return
    }
    if (event.key === 'ArrowDown') {
      if (suggestions.length === 0) {
        return
      }
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => (expanded ? (index + 1) % suggestions.length : 0))
    } else if (event.key === 'ArrowUp') {
      if (suggestions.length === 0) {
        return
      }
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) =>
        expanded ? (index <= 0 ? suggestions.length - 1 : index - 1) : suggestions.length - 1
      )
    } else if (event.key === 'Enter') {
      // Only swallow Enter when a suggestion is highlighted; otherwise let the
      // form submit what was typed.
      if (expanded && activeIndex >= 0) {
        event.preventDefault()
        select(suggestions[activeIndex])
      }
    } else if (event.key === 'Escape') {
      if (expanded) {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        setActiveIndex(-1)
      }
    }
  }

  return (
    <div className="suggest-input-root">
      <input
        id={id}
        type="text"
        className="collection-view-add-input"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        autoComplete="off"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setOpen(false)
          setActiveIndex(-1)
        }}
        ref={inputRef}
      />
      {expanded && (
        <ul className="suggest-listbox" id={listboxId} role="listbox" aria-label={`${fieldName} suggestions`}>
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={`suggest-option${index === activeIndex ? ' suggest-option--highlighted' : ''}`}
              // mousedown (not click) so the input's blur doesn't close the list first.
              onMouseDown={(event) => {
                event.preventDefault()
                select(suggestion)
              }}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
