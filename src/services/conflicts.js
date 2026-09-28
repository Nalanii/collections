// Thrown by updateItem / updateCollection when the doc was changed (or deleted) by
// someone else since the editor opened it and saving would overwrite their change.
// Nothing is written when this is thrown.
//
// `reason` is 'changed' or 'deleted'. For 'changed', `latest` is the doc as it is
// saved now (`{ id, ...data }`) and `conflictingKeys` lists what both sides changed:
// item paths like `['fields', 'Title']` / `['status']`, or collection parts
// ('name', 'emoji', 'fieldDefs').
export class ConflictError extends Error {
  constructor({ reason, latest = null, conflictingKeys = [] }) {
    super(
      reason === 'deleted'
        ? 'This was deleted by someone else while you were editing.'
        : 'This was changed by someone else while you were editing.'
    )
    this.name = 'ConflictError'
    this.reason = reason
    this.latest = latest
    this.conflictingKeys = conflictingKeys
  }
}

export function isConflictError(err) {
  return err instanceof ConflictError
}
