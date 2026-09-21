import { useEffect, useMemo, useRef, useState } from 'react'
import { subscribeToCollection, subscribeToMembers } from '../services/collections'
import { addItem, deleteItem, subscribeToItems, updateItem } from '../services/items'
import { searchItems } from '../utils/itemSearch'
import { getMemberRole, isViewerRole } from '../utils/permissions'
import { ReadOnlyBanner } from './ReadOnlyBanner'
import './CollectionView.css'

const EMPTY_FIELD_DEFS = []

function BackChevronIcon() {
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
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.36 3.64l-1.13 1.13M4.77 11.23l-1.13 1.13M12.36 12.36l-1.13-1.13M4.77 4.77L3.64 3.64"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function emptyFormState() {
  return { fields: {}, originalFields: {}, status: 'have', notes: '' }
}

export function CollectionView({ collectionId, user, onBack, onManage = () => {} }) {
  const [collectionData, setCollectionData] = useState(null)
  const [collectionLoaded, setCollectionLoaded] = useState(false)
  const [collectionError, setCollectionError] = useState(null)
  const [items, setItems] = useState(null)
  const [itemsError, setItemsError] = useState(null)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  const [mode, setMode] = useState('search')
  const [form, setForm] = useState(emptyFormState)
  const [editingItemId, setEditingItemId] = useState(null)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [members, setMembers] = useState(null)
  const firstFieldRef = useRef(null)

  useEffect(() => {
    setCollectionData(null)
    setCollectionError(null)
    setCollectionLoaded(false)
    const unsubscribe = subscribeToCollection(collectionId, (data, err) => {
      if (err) {
        console.error(err)
        setCollectionError('Could not load this collection. Please try again.')
        return
      }
      setCollectionData(data)
      setCollectionLoaded(true)
    })
    return unsubscribe
  }, [collectionId])

  useEffect(() => {
    setItems(null)
    setItemsError(null)
    const unsubscribe = subscribeToItems(collectionId, (data, err) => {
      if (err) {
        console.error(err)
        setItemsError('Could not load items. Please try again.')
        return
      }
      setItems(data)
    })
    return unsubscribe
  }, [collectionId])

  useEffect(() => {
    setMembers(null)
    const unsubscribe = subscribeToMembers(collectionId, (data, err) => {
      if (err) {
        console.error(err)
      }
      setMembers(data)
    })
    return unsubscribe
  }, [collectionId])

  useEffect(() => {
    if (mode === 'add') {
      firstFieldRef.current?.focus()
    }
  }, [mode, focusToken])

  useEffect(() => {
    if (isViewer && mode !== 'search') {
      setMode('search')
      setEditingItemId(null)
      setFormError(null)
    }
  }, [isViewer, mode])

  const fieldDefs = collectionData?.fieldDefs ?? EMPTY_FIELD_DEFS
  const rolesLoaded = members !== null
  const myRole = getMemberRole(members, user.uid)
  const isViewer = rolesLoaded && isViewerRole(myRole)
  const showWriteControls = rolesLoaded && !isViewer

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

  function handleSwitchToAdd() {
    setEditingItemId(null)
    setForm(emptyFormState())
    setFormError(null)
    setMode('add')
    setFocusToken((token) => token + 1)
  }

  function handleSwitchToSearch() {
    setMode('search')
  }

  function handleFieldChange(fieldName, value) {
    setForm((prev) => ({ ...prev, fields: { ...prev.fields, [fieldName]: value } }))
  }

  function handleEditClick(item) {
    setForm({
      fields: Object.fromEntries(
        fieldDefs.map((fieldDef) => [
          fieldDef.name,
          item.fields?.[fieldDef.name] != null ? String(item.fields[fieldDef.name]) : '',
        ])
      ),
      originalFields: item.fields ?? {},
      status: item.status,
      notes: item.notes ?? '',
    })
    setEditingItemId(item.id)
    setFormError(null)
    setMode('add')
    setFocusToken((token) => token + 1)
  }

  function handleCancelEdit() {
    setEditingItemId(null)
    setForm(emptyFormState())
    setFormError(null)
    setMode('search')
  }

  async function handleSaveItem() {
    if (saving) {
      return
    }
    const trimmedFields = Object.fromEntries(
      fieldDefs.map((fieldDef) => [fieldDef.name, (form.fields[fieldDef.name] ?? '').trim()])
    )
    const trimmedNotes = form.notes.trim()
    const hasAnyValue = Object.values(trimmedFields).some((value) => value !== '')
    if (!hasAnyValue) {
      setFormError('Fill in at least one field.')
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      if (editingItemId) {
        await updateItem(editingItemId, {
          status: form.status,
          fields: { ...form.originalFields, ...trimmedFields },
          notes: trimmedNotes,
        })
        setEditingItemId(null)
        setForm(emptyFormState())
        setMode('search')
      } else {
        await addItem(user, collectionId, { status: form.status, fields: trimmedFields, notes: trimmedNotes })
        setForm(emptyFormState())
        setFocusToken((token) => token + 1)
      }
    } catch (err) {
      console.error(err)
      setFormError(
        editingItemId ? 'Could not save changes. Please try again.' : 'Could not add item. Please try again.'
      )
    } finally {
      setSaving(false)
    }
  }

  function handleFormSubmit(event) {
    event.preventDefault()
    handleSaveItem()
  }

  function handleFormKeyDown(event) {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault()
      handleSaveItem()
    }
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
      <div className="collection-view-screen">
        <p className="collection-view-error">{collectionError}</p>
        <button type="button" className="collection-view-back-button" onClick={onBack}>
          <BackChevronIcon /> Back
        </button>
      </div>
    )
  }

  if (collectionData === null) {
    if (!collectionLoaded) {
      return null
    }
    return (
      <div className="collection-view-screen">
        <p className="collection-view-error">This collection could not be found.</p>
        <button type="button" className="collection-view-back-button" onClick={onBack}>
          <BackChevronIcon /> Back
        </button>
      </div>
    )
  }

  return (
    <div className="collection-view-screen">
      <div className="collection-view-header">
        <button
          type="button"
          className="collection-view-back-button"
          onClick={onBack}
          aria-label="Back to collections"
        >
          <BackChevronIcon />
        </button>
        <span className="collection-view-emoji">{collectionData.emoji}</span>
        <span className="collection-view-name">{collectionData.name}</span>
        <button
          type="button"
          className="collection-view-manage-button"
          onClick={() => onManage(collectionId)}
          aria-label="Manage collection"
        >
          <GearIcon />
        </button>
      </div>

      {isViewer && <ReadOnlyBanner />}

      {showWriteControls && (
        <div className="collection-view-mode-toggle" role="tablist" aria-label="Search or add items">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'search'}
            className={`collection-view-mode-button${mode === 'search' ? ' collection-view-mode-button--active' : ''}`}
            onClick={handleSwitchToSearch}
          >
            <SearchIcon /> Search
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'add'}
            className={`collection-view-mode-button${mode === 'add' ? ' collection-view-mode-button--active' : ''}`}
            onClick={handleSwitchToAdd}
          >
            <PlusIcon /> Add
          </button>
        </div>
      )}

      {mode === 'add' && (
        <form
          className="collection-view-add-form"
          onSubmit={handleFormSubmit}
          onKeyDown={handleFormKeyDown}
        >
          {fieldDefs.map((fieldDef, index) => (
            <div className="collection-view-add-field" key={fieldDef.name}>
              <label className="collection-view-add-label" htmlFor={`add-field-${fieldDef.name}`}>
                {fieldDef.name}
              </label>
              <input
                id={`add-field-${fieldDef.name}`}
                type={fieldDef.type === 'number' ? 'number' : 'text'}
                className="collection-view-add-input"
                value={form.fields[fieldDef.name] ?? ''}
                onChange={(event) => handleFieldChange(fieldDef.name, event.target.value)}
                ref={index === 0 ? firstFieldRef : undefined}
              />
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

          <div className="collection-view-add-actions">
            {editingItemId && (
              <button
                type="button"
                className="collection-view-cancel-edit-button"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                Cancel
              </button>
            )}
            <button type="submit" className="collection-view-save-button" disabled={saving}>
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
              className={`collection-view-tab${activeTab === 'have' ? ' collection-view-tab--active' : ''}`}
              onClick={() => setActiveTab('have')}
            >
              Have
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'iso'}
              className={`collection-view-tab${activeTab === 'iso' ? ' collection-view-tab--active' : ''}`}
              onClick={() => setActiveTab('iso')}
            >
              ISO
            </button>
          </div>

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
                const fieldsSummary = fieldDefs
                  .map((fieldDef) => item.fields?.[fieldDef.name])
                  .filter((value) => value !== undefined && value !== null && value !== '')
                  .join(' · ')
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
                              onClick={() => setDeleteConfirmId(null)}
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
    </div>
  )
}
