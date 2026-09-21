import { describe, expect, it } from 'vitest'
import { getMemberRole, isViewerRole } from './permissions'

const members = [
  { uid: 'owner-uid', role: 'owner' },
  { uid: 'editor-uid', role: 'editor' },
  { uid: 'viewer-uid', role: 'viewer' },
]

describe('getMemberRole', () => {
  it('returns null when members is null', () => {
    expect(getMemberRole(null, 'owner-uid')).toBe(null)
  })

  it('returns null when members is undefined', () => {
    expect(getMemberRole(undefined, 'owner-uid')).toBe(null)
  })

  it('returns null when no member matches the uid', () => {
    expect(getMemberRole(members, 'nobody')).toBe(null)
  })

  it("returns the matching member's role", () => {
    expect(getMemberRole(members, 'viewer-uid')).toBe('viewer')
    expect(getMemberRole(members, 'editor-uid')).toBe('editor')
    expect(getMemberRole(members, 'owner-uid')).toBe('owner')
  })
})

describe('isViewerRole', () => {
  it('returns true for viewer', () => {
    expect(isViewerRole('viewer')).toBe(true)
  })

  it('returns false for owner', () => {
    expect(isViewerRole('owner')).toBe(false)
  })

  it('returns false for editor', () => {
    expect(isViewerRole('editor')).toBe(false)
  })

  it('returns false for null or undefined', () => {
    expect(isViewerRole(null)).toBe(false)
    expect(isViewerRole(undefined)).toBe(false)
  })
})
