import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OfflineBannerView } from './OfflineBanner'

function render(props) {
  return renderToStaticMarkup(
    <OfflineBannerView online={true} pendingCount={0} rejections={[]} onDismiss={() => {}} {...props} />
  )
}

describe('OfflineBannerView', () => {
  it('renders nothing when online with nothing pending', () => {
    expect(render({})).toBe('')
  })

  it('keeps the original text offline with no pending changes', () => {
    const html = render({ online: false })
    expect(html).toContain("Changes will sync when you&#x27;re back online.")
    expect(html).not.toMatch(/\d+ change/)
  })

  it('uses singular wording for one pending change', () => {
    expect(render({ online: false, pendingCount: 1 })).toContain("1 change will sync when you&#x27;re back online.")
  })

  it('uses plural wording for several pending changes', () => {
    expect(render({ online: false, pendingCount: 2 })).toContain("2 changes will sync when you&#x27;re back online.")
  })

  it('shows a syncing status after reconnecting while changes are pending', () => {
    const html = render({ pendingCount: 3 })
    expect(html).toContain('role="status"')
    expect(html).toContain('Syncing 3 changes…')
    expect(render({ pendingCount: 1 })).toContain('Syncing 1 change…')
  })

  it('shows a dismissible banner per rejected write', () => {
    const html = render({ rejections: [{ id: 1, message: 'Reverted A' }, { id: 2, message: 'Reverted B' }] })
    expect(html).toContain('Reverted A')
    expect(html).toContain('Reverted B')
    expect(html.match(/aria-label="Dismiss message"/g)).toHaveLength(2)
  })
})
