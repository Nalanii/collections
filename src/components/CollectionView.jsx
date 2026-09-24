import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { subscribeToCollection, subscribeToMembers } from '../services/collections'
import { addItem, deleteItem, subscribeToItems, updateItem } from '../services/items'
import { searchItems } from '../utils/itemSearch'
import { isMainField, summarizeItemFields } from '../utils/itemFieldSummary'
import { buildSelectOptions } from '../utils/fieldOptions'
import { trimFieldValues } from '../utils/trimFieldValues'
import { findDuplicateItem } from '../utils/duplicateItem'
import { canWrite, getMemberRole, isViewerRole } from '../utils/permissions'
import { BackButton } from './BackButton'
import { ConfirmDialog } from './ConfirmDialog'
import { ReadOnlyBanner } from './ReadOnlyBanner'
import { Select } from './Select'
import { SuggestInput } from './SuggestInput'
import { Toast } from './Toast'
import './CollectionView.css'

const EMPTY_FIELD_DEFS = []
const EMPTY_COLLECTION_STATE = { id: null, data: null, loaded: false, error: null }
const EMPTY_ITEMS_STATE = { id: null, data: null, error: null }
const EMPTY_MEMBERS_STATE = { id: null, data: null }

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M8 2.5v11M2.5 8h11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10.5 10.5L14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M11 2.5l2.5 2.5-8 8L3 13.5v-2.5l8-8.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M3.5 4.5h9M6.5 4.5V3a1 1 0 011-1h1a1 1 0 011 1v1.5M6.5 7.5v4M9.5 7.5v4M4.5 4.5l.6 8a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 -960 960 960" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" />
    </svg>
  )
}

// Single-line collection name; when it is cut off with an ellipsis, hovering (or tapping, on touch
// screens) shows the full name.
function CollectionName({ name }) {
  const [truncated, setTruncated] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  function measure() {
    const text = rootRef.current.firstElementChild
    const isTruncated = text.scrollWidth > text.clientWidth
    setTruncated(isTruncated)
    return isTruncated
  }

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  return (
    <span
      ref={rootRef}
      className={`collection-view-name${truncated ? ' collection-view-name--truncated' : ''}${open ? ' collection-view-name--open' : ''}`}
      onMouseEnter={measure}
      onClick={() => setOpen((wasOpen) => (wasOpen ? false : measure()))}
    >
      <span className="collection-view-name-text">{name}</span>
      {truncated && (
        <span className="collection-view-name-tooltip" role="tooltip">
          {name}
        </span>
      )}
    </span>
  )
}

function emptyFormState() {
  return { fields: {}, originalFields: {}, status: 'have', notes: '' }
}

export function CollectionView({ collectionId, user, onBack, onManage = () => {} }) {
  // Subscription results are tagged with the collection id they belong to, so
  // results for a previous collection read as "not loaded yet" after a switch.
  const [collectionState, setCollectionState] = useState(EMPTY_COLLECTION_STATE)
  const [itemsState, setItemsState] = useState(EMPTY_ITEMS_STATE)
  const [membersState, setMembersState] = useState(EMPTY_MEMBERS_STATE)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  const [mode, setMode] = useState('search')
  const [form, setForm] = useState(emptyFormState)
  const [initialForm, setInitialForm] = useState(emptyFormState)
  const [pendingDiscardAction, setPendingDiscardAction] = useState(null)
  const [editingItemId, setEditingItemId] = useState(null)
  const [formError, setFormError] = useState(null)
  // Tied to the `form` object it was raised for, so any edit or reset hides it.
  const [duplicateWarning, setDuplicateWarning] = useState(null)
  const [saving, setSaving] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [toast, setToast] = useState(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const firstFieldRef = useRef(null)
  const savingRef = useRef(false)
  const duplicateWarningRef = useRef(null)

  const currentCollectionState =
    collectionState.id === collectionId ? collectionState : EMPTY_COLLECTION_STATE
  const collectionData = currentCollectionState.data
  const collectionLoaded = currentCollectionState.loaded
  const collectionError = currentCollectionState.error
  const currentItemsState = itemsState.id === collectionId ? itemsState : EMPTY_ITEMS_STATE
  const items = currentItemsState.data
  const itemsError = currentItemsState.error
  const members = membersState.id === collectionId ? membersState.data : null

  useEffect(() => {
    const unsubscribe = subscribeToCollection(collectionId, (data, err) => {
      if (err) {
        console.error(err)
        setCollectionState((prev) => ({
          ...(prev.id === collectionId ? prev : EMPTY_COLLECTION_STATE),
          id: collectionId,
          error: 'Could not load this collection. Please try again.',
        }))
        return
      }
      setCollectionState((prev) => ({
        ...(prev.id === collectionId ? prev : EMPTY_COLLECTION_STATE),
        id: collectionId,
        data,
        loaded: true,
      }))
    })
    return unsubscribe
  }, [collectionId])

  useEffect(() => {
    const unsubscribe = subscribeToItems(collectionId, (data, err) => {
      if (err) {
        console.error(err)
        setItemsState((prev) => ({
          ...(prev.id === collectionId ? prev : EMPTY_ITEMS_STATE),
          id: collectionId,
          error: 'Could not load items. Please try again.',
        }))
        return
      }
      setItemsState((prev) => ({
        ...(prev.id === collectionId ? prev : EMPTY_ITEMS_STATE),
        id: collectionId,
        data,
      }))
    })
    return unsubscribe
  }, [collectionId])

  useEffect(() => {
    const unsubscribe = subscribeToMembers(collectionId, (data, err) => {
      if (err) {
        console.error(err)
      }
      setMembersState({ id: collectionId, data })
    })
    return unsubscribe
  }, [collectionId])

  useEffect(() => {
    if (mode === 'add') {
      // The first field's ref is only on text/number inputs; a dropdown first field
      // (custom Select) is focused via its trigger id instead.
      const target = firstFieldRef.current ?? document.getElementById('add-field-0')
      target?.focus()
    }
  }, [mode, focusToken])

  useEffect(() => {
    if (duplicateWarning) {
      duplicateWarningRef.current?.focus()
    }
  }, [duplicateWarning])

  const fieldDefs = collectionData?.fieldDefs ?? EMPTY_FIELD_DEFS
  const activeDuplicateWarning =
    mode === 'add' && duplicateWarning?.form === form ? duplicateWarning : null
  const rolesLoaded = members !== null
  const myRole = getMemberRole(members, user.uid)
  const isViewer = rolesLoaded && isViewerRole(myRole)
  const showWriteControls = rolesLoaded && canWrite(myRole)

  // Viewers can't write: drop back to search mode (adjusted during render, not in an effect).
  if (isViewer && mode !== 'search') {
    setMode('search')
    setEditingItemId(null)
    setFormError(null)
  }

  const tabItems = useMemo(() => {
    if (items == null) {
      return []
    }
    if (activeTab === 'all') {
      return items
    }
    return items.filter((item) => item.status === activeTab)
  }, [items, activeTab])

  const displayedItems = useMemo(
    () => searchItems(tabItems, fieldDefs, query),
    [tabItems, fieldDefs, query]
  )

  function isAddFormDirty() {
    if (mode !== 'add') {
      return false
    }
    if (form.status !== initialForm.status || form.notes !== initialForm.notes) {
      return true
    }
    const fieldNames = new Set([...Object.keys(form.fields), ...Object.keys(initialForm.fields)])
    for (const fieldName of fieldNames) {
      if ((form.fields[fieldName] ?? '') !== (initialForm.fields[fieldName] ?? '')) {
        return true
      }
    }
    return false
  }

  function handleSwitchToAdd() {
    if (mode === 'add') return
    const emptyState = emptyFormState()
    setEditingItemId(null)
    setForm(emptyState)
    setInitialForm(emptyState)
    setFormError(null)
    setMode('add')
    setFocusToken((token) => token + 1)
  }

  function handleSwitchToSearch() {
    setEditingItemId(null)
    setForm(emptyFormState())
    setFormError(null)
    setMode('search')
  }

  function handleSwitchToSearchTab() {
    if (isAddFormDirty()) {
      setPendingDiscardAction('search')
      return
    }
    handleSwitchToSearch()
  }

  function handleFieldChange(fieldName, value) {
    setForm((prev) => ({ ...prev, fields: { ...prev.fields, [fieldName]: value } }))
  }

  function handleEditClick(item) {
    const nextForm = {
      fields: Object.fromEntries(
        fieldDefs.map((fieldDef) => [
          fieldDef.name,
          item.fields?.[fieldDef.name] != null ? String(item.fields[fieldDef.name]) : '',
        ])
      ),
      originalFields: item.fields ?? {},
      status: item.status,
      notes: item.notes ?? '',
    }
    setForm(nextForm)
    setInitialForm(nextForm)
    setEditingItemId(item.id)
    setFormError(null)
    setMode('add')
    setFocusToken((token) => token + 1)
  }

  function handleCancelEdit() {
    if (isAddFormDirty()) {
      setPendingDiscardAction('cancelEdit')
      return
    }
    setEditingItemId(null)
    setForm(emptyFormState())
    setFormError(null)
    setMode('search')
  }

  function handleConfirmDiscard() {
    const action = pendingDiscardAction
    setPendingDiscardAction(null)
    if (action === 'search') {
      handleSwitchToSearch()
    } else if (action === 'cancelEdit') {
      setEditingItemId(null)
      setForm(emptyFormState())
      setFormError(null)
      setMode('search')
    }
  }

  function handleKeepEditing() {
    setPendingDiscardAction(null)
  }

  async function handleSaveItem({ skipDuplicateCheck = false } = {}) {
    if (savingRef.current) {
      return
    }
    const trimmedFields = trimFieldValues(
      Object.fromEntries(fieldDefs.map((fieldDef) => [fieldDef.name, form.fields[fieldDef.name] ?? '']))
    )
    const trimmedNotes = form.notes.trim()
    const missingMain = fieldDefs.filter(
      (fieldDef, index) => isMainField(fieldDefs, index) && trimmedFields[fieldDef.name] === ''
    )
    if (missingMain.length > 0) {
      setFormError(`Fill in ${missingMain.map((fieldDef) => fieldDef.name).join(' and ')}.`)
      return
    }
    const hasAnyValue =
      Object.values(trimmedFields).some((value) => value !== '') || trimmedNotes !== ''
    if (!hasAnyValue) {
      setFormError('Fill in at least one field.')
      return
    }
    if (!skipDuplicateCheck) {
      const duplicate = findDuplicateItem(items, fieldDefs, trimmedFields, editingItemId)
      if (duplicate) {
        setFormError(null)
        setDuplicateWarning({
          form,
          itemName: summarizeItemFields(fieldDefs, duplicate.fields).main,
        })
        return
      }
    }
    setFormError(null)
    setDuplicateWarning(null)
    savingRef.current = true
    setSaving(true)
    try {
      if (editingItemId) {
        await updateItem(editingItemId, {
          status: form.status,
          fields: trimmedFields,
          originalFields: form.originalFields,
          notes: trimmedNotes,
        })
        setEditingItemId(null)
        setForm(emptyFormState())
        setMode('search')
      } else {
        await addItem(user, collectionId, { status: form.status, fields: trimmedFields, notes: trimmedNotes })
        setForm(emptyFormState())
        setFocusToken((token) => token + 1)
        const addedName = summarizeItemFields(fieldDefs, trimmedFields).main
        setToast({ id: Date.now(), message: addedName ? `Added: ${addedName}` : 'Item added' })
      }
    } catch (err) {
      console.error(err)
      setFormError(
        editingItemId ? 'Could not save changes. Please try again.' : 'Could not add item. Please try again.'
      )
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function handleFormSubmit(event) {
    event.preventDefault()
    handleSaveItem()
  }

  function handleFormKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      if (activeDuplicateWarning) return
      handleSaveItem()
    }
  }

  function handleCancelDelete() {
    setDeleteConfirmId(null)
    setDeleteError(null)
  }

  async function handleConfirmDelete(itemId) {
    setDeleteError(null)
    setDeletingId(itemId)
    try {
      await deleteItem(itemId)
      setDeleteConfirmId(null)
    } catch (err) {
      console.error(err)
      setDeleteError('Could not delete item. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  if (collectionError) {
    return (
      <div>
        <p className="not-found-message">{collectionError}</p>
        <BackButton onClick={onBack} />
      </div>
    )
  }

  if (collectionData === null) {
    if (!collectionLoaded) {
      return null
    }
    return (
      <div>
        <p className="not-found-message">This collection could not be found.</p>
        <BackButton onClick={onBack} />
      </div>
    )
  }

  return (
    <div className="collection-view-screen">
      <div className="collection-view-sticky">
      <div className="collection-view-header">
        {collectionData.emoji && (
          <span className="collection-view-emoji">{collectionData.emoji}</span>
        )}
        <CollectionName name={collectionData.name} />
        <button
          type="button"
          className="collection-view-manage-button"
          onClick={() => onManage(collectionId)}
          aria-label="Manage collection"
        >
          <GearIcon />
        </button>
        {showWriteControls && (
          <div className="collection-view-mode-toggle" role="group" aria-label="Search or add items">
            <button
              type="button"
              aria-pressed={mode === 'search'}
              className={`collection-view-mode-button${mode === 'search' ? ' collection-view-mode-button--active' : ''}`}
              onClick={handleSwitchToSearchTab}
            >
              <SearchIcon /> Search
            </button>
            <button
              type="button"
              aria-pressed={mode === 'add'}
              className={`collection-view-mode-button${mode === 'add' ? ' collection-view-mode-button--active' : ''}`}
              onClick={handleSwitchToAdd}
            >
              <PlusIcon /> Add
            </button>
          </div>
        )}
      </div>

      {toast && (
        <Toast
          key={toast.id}
          className="collection-view-toast"
          message={toast.message}
          onDismiss={dismissToast}
        />
      )}

      {isViewer && <ReadOnlyBanner />}

      {mode === 'search' && (
        <div className="collection-view-filter-row">
          <div className="collection-view-search">
            <input
              type="text"
              className="collection-view-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              aria-label="Search items"
            />
            {query !== '' && (
              <button
                type="button"
                className="collection-view-clear-button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="collection-view-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              className={`collection-view-tab${activeTab === 'all' ? ' collection-view-tab--active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'have'}
              className={`collection-view-tab collection-view-tab--have${activeTab === 'have' ?' collection-view-tab--active' : ''}`}
              onClick={() => setActiveTab('have')}
            >
              Have
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'iso'}
              className={`collection-view-tab collection-view-tab--iso${activeTab === 'iso' ?' collection-view-tab--active' : ''}`}
              onClick={() => setActiveTab('iso')}
            >
              ISO
            </button>
          </div>
        </div>
      )}
      </div>

      {mode === 'add' && (
        <form
          className="collection-view-add-form"
          onSubmit={handleFormSubmit}
          onKeyDown={handleFormKeyDown}
        >
          {fieldDefs.length === 0 && (
            <p className="collection-view-empty">
              This collection has no fields defined yet. You can still add an item using notes
              below.
            </p>
          )}

          {fieldDefs.map((fieldDef, index) => (
            <div className="collection-view-add-field" key={fieldDef.name}>
              <label className="collection-view-add-label" htmlFor={`add-field-${index}`}>
                {fieldDef.name}
                {isMainField(fieldDefs, index) && ' *'}
              </label>
              {fieldDef.type === 'dropdown' ? (
                <Select
                  id={`add-field-${index}`}
                  className="collection-view-add-select"
                  options={buildSelectOptions(fieldDef.options, form.fields[fieldDef.name] ?? '')}
                  value={form.fields[fieldDef.name] ?? ''}
                  onChange={(newValue) => handleFieldChange(fieldDef.name, newValue)}
                  ariaLabel={fieldDef.name}
                />
              ) : fieldDef.type === 'text' && fieldDef.suggestOptions ? (
                <SuggestInput
                  id={`add-field-${index}`}
                  items={items}
                  fieldName={fieldDef.name}
                  value={form.fields[fieldDef.name] ?? ''}
                  onChange={(newValue) => handleFieldChange(fieldDef.name, newValue)}
                  inputRef={index === 0 ? firstFieldRef : undefined}
                />
              ) : (
                <input
                  id={`add-field-${index}`}
                  type={fieldDef.type === 'number' ? 'number' : 'text'}
                  className="collection-view-add-input"
                  value={form.fields[fieldDef.name] ?? ''}
                  onChange={(event) => handleFieldChange(fieldDef.name, event.target.value)}
                  ref={index === 0 ? firstFieldRef : undefined}
                />
              )}
            </div>
          ))}

          <div className="collection-view-add-field">
            <span className="collection-view-add-label">Status</span>
            <div className="collection-view-status-radio" role="radiogroup" aria-label="Have or ISO">
              <label className="collection-view-status-option collection-view-status-option--have">
                <input
                  type="radio"
                  name="item-status"
                  value="have"
                  checked={form.status === 'have'}
                  onChange={() => setForm((prev) => ({ ...prev, status: 'have' }))}
                  ref={fieldDefs.length === 0 ? firstFieldRef : undefined}
                />
                Have
              </label>
              <label className="collection-view-status-option collection-view-status-option--iso">
                <input
                  type="radio"
                  name="item-status"
                  value="iso"
                  checked={form.status === 'iso'}
                  onChange={() => setForm((prev) => ({ ...prev, status: 'iso' }))}
                />
                ISO
              </label>
            </div>
          </div>

          <div className="collection-view-add-field">
            <label className="collection-view-add-label" htmlFor="add-item-notes">
              Notes
            </label>
            <textarea
              id="add-item-notes"
              className="collection-view-add-textarea"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={2}
            />
          </div>

          {formError && <p className="collection-view-error">{formError}</p>}

          {activeDuplicateWarning && (
            <div
              className="collection-view-duplicate-warning"
              role="alert"
              tabIndex={-1}
              ref={duplicateWarningRef}
            >
              <p>Possible duplicate: "{activeDuplicateWarning.itemName}" is already in this collection.</p>
            </div>
          )}

          <div className="collection-view-add-actions">
            {activeDuplicateWarning ? (
              <>
                <button
                  type="button"
                  className="collection-view-cancel-edit-button"
                  onClick={() => setDuplicateWarning(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="collection-view-cancel-edit-button"
                  onClick={() => handleSaveItem({ skipDuplicateCheck: true })}
                >
                  {editingItemId ? 'Save anyway' : 'Add anyway'}
                </button>
              </>
            ) : (
              editingItemId && (
                <button
                  type="button"
                  className="collection-view-cancel-edit-button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
              )
            )}
            <button
              type="submit"
              className="collection-view-save-button"
              disabled={saving || Boolean(activeDuplicateWarning)}
            >
              {saving ? 'Saving…' : editingItemId ? 'Update item' : 'Save item'}
            </button>
          </div>

          {!editingItemId && (
            <p className="collection-view-add-hint">
              Ctrl+Enter or "Save item" saves and starts the next item.
            </p>
          )}
        </form>
      )}

      {mode === 'search' && (
        <>
          {itemsError && <p className="collection-view-error">{itemsError}</p>}
          {deleteError && <p className="collection-view-error">{deleteError}</p>}

          {items !== null && !itemsError && tabItems.length === 0 && (
            <p className="collection-view-empty">
              {activeTab === 'iso' && 'No ISO items yet.'}
              {activeTab === 'have' && 'No Have items yet.'}
              {activeTab === 'all' && 'No items yet.'}
            </p>
          )}

          {items !== null && !itemsError && tabItems.length > 0 && displayedItems.length === 0 && (
            <p className="collection-view-empty">No items match your search.</p>
          )}

          {displayedItems.length > 0 && (
            <ul className="collection-view-list">
              {displayedItems.map((item) => {
                const { main: fieldsSummary, rest: secondaryFields } = summarizeItemFields(
                  fieldDefs,
                  item.fields
                )
                return (
                  <li
                    key={item.id}
                    className={`collection-view-item-row collection-view-item-row--${item.status}`}
                  >
                    <div className="collection-view-item-row-main">
                      <span className="collection-view-item-row-fields">{fieldsSummary}</span>
                      <span className="collection-view-item-row-status">
                        {item.status === 'have' ? 'Have' : 'ISO'}
                      </span>
                    </div>
                    {secondaryFields.length > 0 && (
                      <ul className="collection-view-item-row-secondary">
                        {secondaryFields.map((field) => (
                          <li className="collection-view-item-row-chip" key={field.name}>
                            {field.text}
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.notes && <p className="collection-view-item-row-notes">{item.notes}</p>}
                    {showWriteControls && (
                      <div className="collection-view-item-row-actions">
                        <button
                          type="button"
                          className="collection-view-item-edit-button"
                          onClick={() => handleEditClick(item)}
                          aria-label="Edit item"
                        >
                          <EditIcon />
                        </button>
                        {deleteConfirmId === item.id ? (
                          <>
                            <button
                              type="button"
                              className="collection-view-item-delete-confirm-button"
                              onClick={() => handleConfirmDelete(item.id)}
                              disabled={deletingId === item.id}
                            >
                              {deletingId === item.id ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              className="collection-view-item-delete-cancel-button"
                              onClick={handleCancelDelete}
                              disabled={deletingId === item.id}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="collection-view-item-delete-button"
                            onClick={() => setDeleteConfirmId(item.id)}
                            aria-label="Delete item"
                          >
                            <DeleteIcon />
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {pendingDiscardAction && (
        <ConfirmDialog
          title="Discard changes?"
          message="You have unsaved changes in this item. Discard them?"
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onConfirm={handleConfirmDiscard}
          onCancel={handleKeepEditing}
        />
      )}
    </div>
  )
}
