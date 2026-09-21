// Finds the current user's role from a `subscribeToMembers` members array.
// Returns `null` when `members` hasn't loaded yet or the uid isn't a
// member (rather than throwing), so callers can treat "not yet known" and
// "not a member" the same way: don't grant write affordances.
export function getMemberRole(members, uid) {
  if (members == null) {
    return null
  }
  const match = members.find((member) => member.uid === uid)
  return match ? match.role : null
}

export function isViewerRole(role) {
  return role === 'viewer'
}

export function canWrite(role) {
  return role === 'owner' || role === 'editor'
}
