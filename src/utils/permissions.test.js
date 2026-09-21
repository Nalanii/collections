import { describe, expect, it } from 'vitest'
import { canWrite, getMemberRole, isViewerRole } from './permissions'

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

describe('canWrite', () => {
  it('returns true for owner', () => {
    expect(canWrite('owner')).toBe(true)
  })

  it('returns true for editor', () => {
    expect(canWrite('editor')).toBe(true)
  })

  it('returns false for viewer', () => {
    expect(canWrite('viewer')).toBe(false)
  })

  it('returns false for null or undefined', () => {
    expect(canWrite(null)).toBe(false)
    expect(canWrite(undefined)).toBe(false)
  })
})
