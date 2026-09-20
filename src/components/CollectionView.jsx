import { useEffect, useMemo, useState } from 'react'
import { subscribeToCollection } from '../services/collections'
import { subscribeToItems } from '../services/items'
import { searchItems } from '../utils/itemSearch'
import './CollectionView.css'

const EMPTY_FIELD_DEFS = []

export function CollectionView({ collectionId, onBack }) {
  const [collectionData, setCollectionData] = useState(null)
  const [collectionLoaded, setCollectionLoaded] = useState(false)
  const [collectionError, setCollectionError] = useState(null)
  const [items, setItems] = useState(null)
  const [itemsError, setItemsError] = useState(null)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')

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

  const fieldDefs = collectionData?.fieldDefs ?? EMPTY_FIELD_DEFS

  const tabItems = useMemo(() => {
    if (items == null) {
      return []
    }
    return activeTab === 'iso' ? items.filter((item) => item.status === 'iso') : items
  }, [items, activeTab])

  const displayedItems = useMemo(
    () => searchItems(tabItems, fieldDefs, query),
    [tabItems, fieldDefs, query]
  )

  if (collectionError) {
    return (
      <div className="collection-view-screen">
        <p className="collection-view-error">{collectionError}</p>
        <button type="button" className="collection-view-back-button" onClick={onBack}>
          ‹ Back
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
          ‹ Back
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
          ‹
        </button>
        <span className="collection-view-emoji">{collectionData.emoji}</span>
        <span className="collection-view-name">{collectionData.name}</span>
      </div>

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
          aria-selected={activeTab === 'iso'}
          className={`collection-view-tab${activeTab === 'iso' ? ' collection-view-tab--active' : ''}`}
          onClick={() => setActiveTab('iso')}
        >
          ISO
        </button>
      </div>

      {itemsError && <p className="collection-view-error">{itemsError}</p>}

      {items !== null && !itemsError && tabItems.length === 0 && (
        <p className="collection-view-empty">
          {activeTab === 'iso' ? 'No ISO items yet.' : 'No items yet.'}
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
