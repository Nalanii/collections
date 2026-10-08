// Single source of truth for item status. Firestore rules don't validate
// `status`, so stored values can be anything; anything that isn't a known
// status (after trim + lowercase) is treated as Have everywhere.

export const ITEM_STATUSES = [
  { value: 'have', label: 'Have' },
  { value: 'iso', label: 'ISO' },
]

export const DEFAULT_ITEM_STATUS = 'have'

function canonical(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isKnownStatus(value) {
  const text = canonical(value)
  return ITEM_STATUSES.some((status) => status.value === text)
}

export function normalizeStatus(value) {
  const text = canonical(value)
  return ITEM_STATUSES.find((status) => status.value === text)?.value ?? DEFAULT_ITEM_STATUS
}

export function statusLabel(value) {
  const normalized = normalizeStatus(value)
  return ITEM_STATUSES.find((status) => status.value === normalized).label
}
