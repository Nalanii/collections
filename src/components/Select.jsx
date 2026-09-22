import { useEffect, useRef, useState } from 'react'
import './Select.css'

export function Select({ options, value, onChange, ariaLabel, className = '' }) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const rootRef = useRef(null)
  const optionRefs = useRef([])
  const listRef = useRef(null)
  const buttonRef = useRef(null)
  const isFirstRender = useRef(true)

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
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (open && listRef.current) {
      listRef.current.focus()
    } else if (!open && buttonRef.current) {
      buttonRef.current.focus()
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
        aria-label={ariaLabel}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={handleButtonKeyDown}
      >
        <span className="select-trigger-label">{selectedOption ? selectedOption.label : ''}</span>
      </button>
      {open && (
        <ul
          ref={listRef}
          className="select-listbox"
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleListKeyDown}
          tabIndex={-1}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
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
