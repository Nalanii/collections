import { useEffect, useId, useRef, useState } from 'react'
import './Select.css'

export function Select({ options, value, onChange, ariaLabel, className = '' }) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
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

  useEffect(() => {
    if (open) {
      const index = selectedIndex === -1 ? 0 : selectedIndex
      setHighlightedIndex(index)
    }
  }, [open, selectedIndex])

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
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openList()
    }
  }

  function handleListKeyDown(event) {
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
