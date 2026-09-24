import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Toast } from './Toast'

describe('Toast', () => {
  it('renders the message as a polite status live region', () => {
    const html = renderToStaticMarkup(<Toast message="Item added" onDismiss={() => {}} />)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Item added')
  })

  it('applies a custom className for placement', () => {
    const html = renderToStaticMarkup(<Toast message="Hi" className="my-placement" onDismiss={() => {}} />)
    expect(html).toContain('toast toast-success my-placement')
  })
})
