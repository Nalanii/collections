import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { memberDisplayName } from '../utils/memberDisplayName'
import { RemoveMemberDialog } from './RemoveMemberDialog'

// RemoveMemberDialog is a plain function component returning a ConfirmDialog element,
// so its confirm/cancel wiring can be exercised without a DOM.
function setup({ member, isSelf }) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const element = RemoveMemberDialog({ member, isSelf, onConfirm, onCancel })
  return { element, onConfirm, onCancel }
}

describe('RemoveMemberDialog', () => {
  const self = { uid: 'me', email: 'me@example.com', role: 'editor' }
  const other = { uid: 'u2', displayName: 'Sam Lee', email: 'sam@example.com', role: 'viewer' }

  it('asks to leave with Leave / Stay labels', () => {
    const { element } = setup({ member: self, isSelf: true })
    expect(element.props.title).toBe('Leave collection?')
    expect(element.props.message).toContain('lose access')
    expect(element.props.message).toContain('new invite')
    expect(element.props.confirmLabel).toBe('Leave')
    expect(element.props.cancelLabel).toBe('Stay')
  })

  it('confirming leave calls onConfirm only', () => {
    const { element, onConfirm, onCancel } = setup({ member: self, isSelf: true })
    element.props.onConfirm()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancelling leave calls onCancel only', () => {
    const { element, onConfirm, onCancel } = setup({ member: self, isSelf: true })
    element.props.onCancel()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('asks to revoke and names the member', () => {
    const { element } = setup({ member: other, isSelf: false })
    expect(element.props.title).toBe('Revoke access?')
    expect(element.props.message).toContain('Sam Lee')
    expect(element.props.confirmLabel).toBe('Revoke')
    expect(element.props.cancelLabel).toBe('Cancel')
  })

  it('confirming revoke calls onConfirm only', () => {
    const { element, onConfirm, onCancel } = setup({ member: other, isSelf: false })
    element.props.onConfirm()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancelling revoke calls onCancel only', () => {
    const { element, onConfirm, onCancel } = setup({ member: other, isSelf: false })
    element.props.onCancel()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('renders the dialog markup with the member name', () => {
    const html = renderToStaticMarkup(
      <RemoveMemberDialog member={other} isSelf={false} onConfirm={() => {}} onCancel={() => {}} />
    )
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('Sam Lee')
  })
})

describe('memberDisplayName', () => {
  it('falls back from displayName to email to uid', () => {
    expect(memberDisplayName({ uid: 'u', email: 'e@x.com', displayName: 'D' })).toBe('D')
    expect(memberDisplayName({ uid: 'u', email: 'e@x.com' })).toBe('e@x.com')
    expect(memberDisplayName({ uid: 'u' })).toBe('u')
  })
})
