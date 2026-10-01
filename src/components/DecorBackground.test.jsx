// @vitest-environment jsdom
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { DecorBackground, DecorProvider, useDecorAvoid } from './DecorBackground'

const SCREEN = { width: 1280, height: 800 }
const AVOID_RECT = { left: 440, top: 200, right: 840, bottom: 600 }
// Longer than the component's resize settle delay.
const SETTLE_MS = 200

// jsdom has no layout, so every measurement is faked: the background layer
// measures as `layer` (the screen size unless a test resizes it), elements
// carrying data-rect measure as that rect, and anything else is 0x0.
let layer

function withSize(rect) {
  return { ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }
}

function fakeRect(el) {
  if (el.dataset.rect) return withSize(JSON.parse(el.dataset.rect))
  if (el.classList.contains('decor-background')) {
    return withSize({ left: 0, top: 0, right: layer.width, bottom: layer.height })
  }
  return withSize({ left: 0, top: 0, right: 0, bottom: 0 })
}

// jsdom has no ResizeObserver either. Tracks every observer so a test can
// fire the ones still connected (the component re-creates its observer
// whenever the registered zones change).
class FakeResizeObserver {
  static instances = []

  constructor(callback) {
    this.callback = callback
    this.targets = []
    this.connected = true
    FakeResizeObserver.instances.push(this)
  }

  observe(target) {
    this.targets.push(target)
  }

  disconnect() {
    this.connected = false
  }

  static fire() {
    act(() => {
      for (const observer of FakeResizeObserver.instances) {
        if (observer.connected) observer.callback([])
      }
    })
  }

  static liveTargets() {
    return FakeResizeObserver.instances.filter((o) => o.connected).flatMap((o) => o.targets)
  }
}

function Avoider({ rect = AVOID_RECT, shape }) {
  const ref = useRef(null)
  useDecorAvoid(ref, shape)
  return <div ref={ref} data-rect={JSON.stringify(rect)} />
}

function Page({ avoiding, rect }) {
  return (
    <DecorProvider>
      <DecorBackground />
      {avoiding && <Avoider rect={rect} />}
    </DecorProvider>
  )
}

// Icons are placed by their offset from the layer's center; this turns that
// back into layer coordinates. `key` is the raw style, to spot any change.
function iconPosition(icon) {
  const x = icon.style.getPropertyValue('--icon-x')
  const y = icon.style.getPropertyValue('--icon-y')
  return { x: parseFloat(x) + layer.width / 2, y: parseFloat(y) + layer.height / 2, key: `${x},${y}` }
}

function iconPositions(container) {
  return [...container.querySelectorAll('.decor-icon')].map(iconPosition)
}

function insideRect(rect) {
  return ({ x, y }) => x > rect.left && x < rect.right && y > rect.top && y < rect.bottom
}

const insideAvoidRect = insideRect(AVOID_RECT)

beforeEach(() => {
  layer = { ...SCREEN }
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  // getBoundingClientRect lives on Element.prototype; spying there lets
  // restoreAllMocks put it back exactly.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return fakeRect(this)
  })
  vi.spyOn(window.screen, 'width', 'get').mockReturnValue(SCREEN.width)
  vi.spyOn(window.screen, 'height', 'get').mockReturnValue(SCREEN.height)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DecorBackground', () => {
  it('renders a decorative layer of styled icons', () => {
    const { container } = render(<Page />)

    const background = container.querySelector('.decor-background')
    expect(background).not.toBeNull()
    expect(background.getAttribute('aria-hidden')).toBe('true')

    const icons = container.querySelectorAll('.decor-icon')
    expect(icons.length).toBeGreaterThan(20)
    for (const icon of icons) {
      expect(icon.className).toMatch(/decor-icon--color-\d/)
      expect(icon.style.getPropertyValue('--icon-x')).toMatch(/^-?[\d.]+px$/)
      expect(icon.style.getPropertyValue('--icon-y')).toMatch(/^-?[\d.]+px$/)
      expect(icon.style.getPropertyValue('--icon-size')).toMatch(/^[\d.]+px$/)
    }
  })

  it('keeps icons clear of registered content', () => {
    const { container } = render(<Page avoiding />)

    const positions = iconPositions(container)
    expect(positions.length).toBeGreaterThan(20)
    expect(positions.filter(insideAvoidRect)).toEqual([])
  })

  it('observes the background and every registered element', () => {
    const { container } = render(<Page avoiding />)

    const targets = FakeResizeObserver.liveTargets()
    expect(targets).toContain(container.querySelector('.decor-background'))
    expect(targets).toContain(container.querySelector('[data-rect]'))
  })

  it('fills freed space when content unregisters without moving anything else', () => {
    const { container, rerender } = render(<Page avoiding />)
    const before = iconPositions(container)
    expect(before.length).toBeGreaterThan(20)

    rerender(<Page />)
    const after = iconPositions(container)

    const afterKeys = new Set(after.map((p) => p.key))
    expect(before.filter((p) => !afterKeys.has(p.key))).toEqual([])
    expect(after.length).toBeGreaterThan(before.length)
    expect(after.some(insideAvoidRect)).toBe(true)
  })

  it('keeps far-away icons mounted and in place when content appears', () => {
    const { container, rerender } = render(<Page />)
    // Icons this far from the content are nowhere near settling, so they must
    // be the very same nodes afterwards, not remounted (which would replay
    // their fade-in) or moved.
    const distanceFromRect = (icon) => {
      const { x, y } = iconPosition(icon)
      return Math.hypot(
        Math.max(AVOID_RECT.left - x, 0, x - AVOID_RECT.right),
        Math.max(AVOID_RECT.top - y, 0, y - AVOID_RECT.bottom),
      )
    }
    const node = [...container.querySelectorAll('.decor-icon')].find((icon) => distanceFromRect(icon) > 300)
    expect(node).toBeDefined()
    const { key } = iconPosition(node)

    rerender(<Page avoiding />)

    expect(node.isConnected).toBe(true)
    expect(iconPosition(node).key).toBe(key)
  })

  it('does not move icons on a no-op rerender or an unchanged resize', () => {
    const { container, rerender } = render(<Page avoiding />)
    const before = iconPositions(container).map((p) => p.key)
    expect(before.length).toBeGreaterThan(20)

    rerender(<Page avoiding />)
    expect(iconPositions(container).map((p) => p.key)).toEqual(before)

    FakeResizeObserver.fire()
    expect(iconPositions(container).map((p) => p.key)).toEqual(before)
  })

  describe('resizing', () => {
    // Left of AVOID_RECT, over icons in both the 1280 and 1000 wide layouts.
    const MOVED_RECT = { left: 20, top: 200, right: 420, bottom: 600 }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('waits for the layer to stop resizing before relaying out', () => {
      const { container } = render(<Page />)
      const before = iconPositions(container).map((p) => p.key)
      expect(before.length).toBeGreaterThan(20)

      layer = { width: 1000, height: 800 }
      FakeResizeObserver.fire()
      expect(iconPositions(container).map((p) => p.key)).toEqual(before)

      act(() => {
        vi.advanceTimersByTime(SETTLE_MS)
      })
      expect(iconPositions(container).length).toBeLessThan(before.length)
    })

    it('measures content afresh once the resize settles', () => {
      const { container, rerender } = render(<Page avoiding />)

      // The content moves while the layer is still resizing; the settled
      // relayout has to avoid where it is now, not where it was.
      layer = { width: 1000, height: 800 }
      FakeResizeObserver.fire()
      rerender(<Page avoiding rect={MOVED_RECT} />)
      act(() => {
        vi.advanceTimersByTime(SETTLE_MS)
      })

      const positions = iconPositions(container)
      expect(positions.length).toBeGreaterThan(20)
      expect(positions.filter(insideRect(MOVED_RECT))).toEqual([])
    })

    it('relays out at once when content moves but the layer keeps its size', () => {
      const { container, rerender } = render(<Page avoiding />)
      expect(iconPositions(container).some(insideRect(MOVED_RECT))).toBe(true)

      // As when the content's observer entry fires: the layer is the same
      // size, and no timers are advanced.
      rerender(<Page avoiding rect={MOVED_RECT} />)
      FakeResizeObserver.fire()

      expect(iconPositions(container).filter(insideRect(MOVED_RECT))).toEqual([])
    })
  })
})

describe('useDecorAvoid', () => {
  it('is a no-op outside a provider', () => {
    expect(() => render(<Avoider />)).not.toThrow()
  })
})
