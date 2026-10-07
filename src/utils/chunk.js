// Firestore caps a batch/transaction at 500 writes.
export const MAX_BATCH_WRITES = 500

// Splits `list` into consecutive slices of at most `size` items, keeping input order.
export function chunk(list, size = MAX_BATCH_WRITES) {
  const chunks = []
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size))
  return chunks
}
