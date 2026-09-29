import { memberDisplayName } from '../utils/memberDisplayName'
import { ConfirmDialog } from './ConfirmDialog'

export function TransferOwnershipDialog({ member, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      title="Transfer ownership?"
      message={`${memberDisplayName(member)} will become the owner of this collection. You will become an editor and will no longer be able to delete it or remove members. As the new owner, ${memberDisplayName(member)} could also remove you from the collection, and you would lose access entirely. You can't undo this yourself; only ${memberDisplayName(member)} could transfer ownership back.`}
      acknowledgement="I understand these consequences"
      confirmLabel="Transfer"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
