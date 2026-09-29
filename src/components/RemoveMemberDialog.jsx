import { memberDisplayName } from '../utils/memberDisplayName'
import { ConfirmDialog } from './ConfirmDialog'

export function RemoveMemberDialog({ member, isSelf, onConfirm, onCancel }) {
  if (isSelf) {
    return (
      <ConfirmDialog
        title="Leave collection?"
        message="You will lose access to this collection and will need a new invite to rejoin."
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
  }
  return (
    <ConfirmDialog
      title="Revoke access?"
      message={`${memberDisplayName(member)} will lose access to this collection and will need a new invite to rejoin.`}
      confirmLabel="Revoke"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
