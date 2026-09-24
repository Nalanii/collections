import { useEffect, useId, useRef, useState } from 'react'
import './Select.css'

export function Select({ options, value, onChange, ariaLabel, className = '', id }) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [syncedHighlightKey, setSyncedHighlightKey] = useState(null)
  const rootRef = useRef(null)
  const optionRefs = useRef([])
  const listRef = useRef(null)
  const buttonRef = useRef(null)
  const listboxId = useId()

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedOption = options[selectedIndex]

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  // Reset the highlight whenever the list opens or the selection changes while open
  // (adjusted during render, not in an effect).
  const highlightSyncKey = open ? selectedIndex : null
  if (syncedHighlightKey !== highlightSyncKey) {
    setSyncedHighlightKey(highlightSyncKey)
    if (open) {
      setHighlightedIndex(selectedIndex === -1 ? 0 : selectedIndex)
    }
  }

  useEffect(() => {
    if (open && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex].scrollIntoView({ block: 'nearest' })
    }
  }, [open, highlightedIndex])

  useEffect(() => {
    if (open) {
      listRef.current?.focus()
    }
  }, [open])

  function openList() {
    setOpen(true)
  }

  function closeList() {
    setOpen(false)
  }

  function commitSelection(index) {
    const option = options[index]
    if (option) {
      onChange(option.value)
    }
    closeList()
    buttonRef.current?.focus()
  }

  function handleButtonKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openList()
    }
  }

  function handleListKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      // Let shortcuts like Ctrl+Enter (save) bubble to the form, without leaving a stale open list
      closeList()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((index) => Math.min(index + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      commitSelection(highlightedIndex)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeList()
      buttonRef.current?.focus()
    } else if (event.key === 'Tab') {
      closeList()
    }
  }

  return (
    <div className={`select-root${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${selectedOption ? selectedOption.label : ''}`}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={handleButtonKeyDown}
        onKeyUp={(event) => {
          if (event.key === ' ') {
            event.preventDefault()
          }
        }}
      >
        <span className="select-trigger-label">{selectedOption ? selectedOption.label : ''}</span>
      </button>
      {open && (
        <ul
          ref={listRef}
          className="select-listbox"
          role="listbox"
          aria-label={ariaLabel}
          aria-activedescendant={open && highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
          onKeyDown={handleListKeyDown}
          tabIndex={-1}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listboxId}-option-${index}`}
              ref={(node) => {
                optionRefs.current[index] = node
              }}
              role="option"
              aria-selected={option.value === value}
              className={`select-option${index === highlightedIndex ? ' select-option--highlighted' : ''}${option.value === value ? ' select-option--selected' : ''}`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => commitSelection(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
