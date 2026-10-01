import { describe, expect, it } from 'vitest'
import { avoidClearance, createRandom, iconSpacing, isAvoided, layoutDecor } from './decorLayout'

const KIND_COUNT = 9
const COLOR_COUNT = 4

// The three screen classes the layout has to look right on: phone, laptop, desktop.
const SCREENS = [
  { name: 'phone 375x812', width: 375, height: 812, spacing: 106 },
  { name: 'laptop 1280x800', width: 1280, height: 800, spacing: 136 },
  { name: 'desktop 1920x1080', width: 1920, height: 1080, spacing: 156 },
]

const ELLIPSE = { shape: 'ellipse', left: 500, top: 150, right: 780, bottom: 430 }
const RECT_BELOW = { shape: 'rect', left: 464, top: 454, right: 816, bottom: 650 }
const RECT_CENTER = { shape: 'rect', left: 440, top: 200, right: 840, bottom: 600 }

function layout(width, height, spacing, extra = {}) {
  return layoutDecor({ width, height, spacing, kindCount: KIND_COUNT, colorCount: COLOR_COUNT, ...extra })
}

// Layouts are never mutated by the tests, so identical inputs can share a result.
const plainCache = new Map()
function plainLayout({ width, height, spacing }) {
  const key = `${width}x${height}@${spacing}`
  if (!plainCache.has(key)) plainCache.set(key, layout(width, height, spacing))
  return plainCache.get(key)
}

function nearestNeighborDistances(icons) {
  return icons.map((icon, i) => {
    let best = Infinity
    icons.forEach((other, j) => {
      if (i !== j) best = Math.min(best, Math.hypot(other.x - icon.x, other.y - icon.y))
    })
    return best
  })
}

function distanceToNearestIcon(icons, x, y) {
  let best = Infinity
  for (const icon of icons) best = Math.min(best, Math.hypot(icon.x - x, icon.y - y))
  return best
}

function largestEmptyCircle(icons, width, height, step) {
  let largest = 0
  for (let y = 0; y <= height; y += step) {
    for (let x = 0; x <= width; x += step) {
      largest = Math.max(largest, distanceToNearestIcon(icons, x, y))
    }
  }
  return largest
}

function sameKindPairsWithin(icons, distance) {
  let pairs = 0
  for (let i = 0; i < icons.length; i++) {
    for (let j = i + 1; j < icons.length; j++) {
      if (icons[i].kind === icons[j].kind && Math.hypot(icons[i].x - icons[j].x, icons[i].y - icons[j].y) < distance) {
        pairs++
      }
    }
  }
  return pairs
}

function byId(icons) {
  return new Map(icons.map((icon) => [icon.id, icon]))
}

function appearanceOf(icon) {
  const { kind, color, size, rotation, duration, delay } = icon
  return { kind, color, size, rotation, duration, delay }
}

function lookOf(icon) {
  return { x: icon.x, y: icon.y, ...appearanceOf(icon) }
}

describe('iconSpacing', () => {
  it('scales with the short side of a phone screen', () => {
    expect(iconSpacing(375, 812)).toBeCloseTo(80 + 375 * 0.07, 10)
  })

  it('gives the same spacing in landscape as in portrait', () => {
    expect(iconSpacing(812, 375)).toBe(iconSpacing(375, 812))
  })

  it('lands on about 155.6 for a 1080p desktop', () => {
    expect(iconSpacing(1920, 1080)).toBeCloseTo(155.6, 5)
  })

  it('clamps to the maximum on very large screens', () => {
    expect(iconSpacing(3840, 2160)).toBe(156)
  })

  it('clamps to the minimum on tiny screens', () => {
    expect(iconSpacing(0, 0)).toBe(100)
  })
})

describe('createRandom', () => {
  it('replays the same sequence for the same seed', () => {
    const a = createRandom(42)
    const b = createRandom(42)
    const first = Array.from({ length: 5 }, () => a())
    const second = Array.from({ length: 5 }, () => b())
    expect(second).toEqual(first)
  })

  it('only returns values in [0, 1)', () => {
    const random = createRandom(7)
    for (let i = 0; i < 2000; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('gives different sequences for different seeds', () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)())
  })
})

describe('isAvoided', () => {
  const rect = { shape: 'rect', left: 0, top: 0, right: 100, bottom: 100 }

  it('avoids the inside of a rect and its clearance band', () => {
    expect(isAvoided(50, 50, [rect], 10)).toBe(true)
    expect(isAvoided(105, 50, [rect], 10)).toBe(true)
    expect(isAvoided(111, 50, [rect], 10)).toBe(false)
  })

  it('rounds the corners of a rect instead of squaring them off', () => {
    // ~7.07 from the corner: inside the clearance circle.
    expect(isAvoided(105, 105, [rect], 10)).toBe(true)
    // ~11.3 from the corner: inside the square band but outside the circle.
    expect(isAvoided(108, 108, [rect], 10)).toBe(false)
  })

  it('avoids an ellipse by its outline, not its bounding box', () => {
    const ellipse = { ...rect, shape: 'ellipse' }
    expect(isAvoided(50, 50, [ellipse], 0)).toBe(true)
    expect(isAvoided(98, 50, [ellipse], 0)).toBe(true)
    // Inside the bounding box but outside the circle, so no dead corners.
    expect(isAvoided(95, 95, [ellipse], 0)).toBe(false)
  })
})

describe('layoutDecor', () => {
  describe('determinism', () => {
    it('returns identical results for identical inputs', () => {
      const inputs = { avoid: [ELLIPSE, RECT_BELOW], seed: 3 }
      expect(layout(1280, 800, 136, inputs)).toEqual(layout(1280, 800, 136, inputs))
    })
  })

  describe('proportional fill', () => {
    const spacing = 156
    const domainArea = (width, height) => {
      const bleed = spacing * 0.35
      return (width + 2 * bleed) * (height + 2 * bleed)
    }
    const cellArea = (spacing * spacing * Math.sqrt(3)) / 2

    it('places one icon per honeycomb cell of the bled-out area', () => {
      const result = layout(1920, 1080, spacing)
      const expected = domainArea(1920, 1080) / cellArea
      expect(Math.abs(result.icons.length - expected) / expected).toBeLessThan(0.05)
    })

    it('gives a smaller screen proportionally fewer icons', () => {
      const large = layout(1920, 1080, spacing)
      const small = layout(1280, 800, spacing)
      expect(small.icons.length).toBeLessThan(large.icons.length)

      const countRatio = small.icons.length / large.icons.length
      const areaRatio = domainArea(1280, 800) / domainArea(1920, 1080)
      expect(Math.abs(countRatio / areaRatio - 1)).toBeLessThan(0.15)
    })
  })

  describe.each(SCREENS)('even spread on $name', (screen) => {
    const { width, height, spacing } = screen

    it('never crowds two icons together', () => {
      const { icons } = plainLayout(screen)
      expect(Math.min(...nearestNeighborDistances(icons))).toBeGreaterThanOrEqual(0.45 * spacing)
    })

    it('spaces icons evenly: no clumps, but not random either', () => {
      const distances = nearestNeighborDistances(plainLayout(screen).icons)
      const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length
      const variance = distances.reduce((sum, d) => sum + (d - mean) ** 2, 0) / distances.length
      expect(Math.sqrt(variance) / mean).toBeLessThan(0.2)
    })

    it('leaves no dead patch bigger than one spacing', () => {
      expect(largestEmptyCircle(plainLayout(screen).icons, width, height, 10)).toBeLessThan(spacing)
    })

    it('never groups kinds together and keeps the mix balanced', () => {
      const { icons } = plainLayout(screen)
      expect(sameKindPairsWithin(icons, 1.35 * spacing)).toBe(0)

      const kindCounts = new Array(KIND_COUNT).fill(0)
      for (const icon of icons) kindCounts[icon.kind]++
      expect(Math.min(...kindCounts)).toBeGreaterThan(0)
      expect(Math.max(...kindCounts)).toBeLessThanOrEqual(2 * Math.min(...kindCounts))
    })
  })

  describe('avoid zones', () => {
    const spacing = 136
    const clearance = avoidClearance(spacing)

    it('keeps every icon out of the avoided shapes', () => {
      const { icons } = layout(1280, 800, spacing, { avoid: [ELLIPSE, RECT_BELOW] })
      expect(icons.length).toBeGreaterThan(0)
      for (const icon of icons) {
        expect(isAvoided(icon.x, icon.y, [ELLIPSE, RECT_BELOW], clearance)).toBe(false)
      }
    })

    it('leaves no dead corners around round content', () => {
      // The widest gap to an icon from a ring just outside the circle's clearance.
      const worstRingGap = (avoid) => {
        const { icons } = layout(1280, 800, spacing, { avoid })
        const centerX = 640
        const centerY = 290
        const ringRadius = 140 + clearance + 2
        let worst = 0
        for (let degrees = 0; degrees < 360; degrees += 5) {
          const angle = (degrees * Math.PI) / 180
          const x = centerX + ringRadius * Math.cos(angle)
          const y = centerY + ringRadius * Math.sin(angle)
          worst = Math.max(worst, distanceToNearestIcon(icons, x, y))
        }
        return worst
      }

      expect(worstRingGap([ELLIPSE])).toBeLessThan(0.75 * spacing)
      // The same box avoided as a rect keeps its corners empty, leaving a
      // visibly bigger gap there: this is what the ellipse shape is for.
      expect(worstRingGap([{ ...ELLIPSE, shape: 'rect' }])).toBeGreaterThanOrEqual(0.75 * spacing)
    })
  })

  describe('icon attributes', () => {
    const spacing = 156
    const result = layout(1920, 1080, spacing)

    it('keeps size, rotation and float timing in range', () => {
      for (const icon of result.icons) {
        expect(icon.size).toBeGreaterThanOrEqual(0.19 * spacing)
        expect(icon.size).toBeLessThanOrEqual(0.31 * spacing)
        expect(icon.rotation).toBeGreaterThanOrEqual(-16)
        expect(icon.rotation).toBeLessThanOrEqual(16)
        expect(icon.duration).toBeGreaterThanOrEqual(6)
        expect(icon.duration).toBeLessThanOrEqual(10)
        expect(icon.delay).toBeGreaterThanOrEqual(-icon.duration)
        expect(icon.delay).toBeLessThanOrEqual(0)
      }
    })

    it('picks kind and color as integers within their counts', () => {
      for (const icon of result.icons) {
        expect(Number.isInteger(icon.kind)).toBe(true)
        expect(icon.kind).toBeGreaterThanOrEqual(0)
        expect(icon.kind).toBeLessThan(KIND_COUNT)
        expect(Number.isInteger(icon.color)).toBe(true)
        expect(icon.color).toBeGreaterThanOrEqual(0)
        expect(icon.color).toBeLessThan(COLOR_COUNT)
      }
    })

    it('gives every icon a unique id below nextId', () => {
      const ids = result.icons.map((icon) => icon.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(result.nextId).toBeGreaterThan(id)
    })
  })

  describe('relayout with a previous result', () => {
    const spacing = 136
    const clearance = avoidClearance(spacing)

    it('keeps far-away icons unmoved and every survivor looking the same when content appears', () => {
      const a = layout(1280, 800, spacing)
      const b = layout(1280, 800, spacing, { previous: a, avoid: [RECT_CENTER] })
      const before = byId(a.icons)
      const after = byId(b.icons)
      // Icons this close to new content are allowed to settle away from it.
      const settleReach = clearance + spacing

      for (const icon of b.icons) {
        expect(isAvoided(icon.x, icon.y, [RECT_CENTER], clearance)).toBe(false)
        const original = before.get(icon.id)
        if (!original) continue
        // Only position may change for a survivor, never its look or float timing.
        expect(appearanceOf(icon)).toEqual(appearanceOf(original))
        if (!isAvoided(original.x, original.y, [RECT_CENTER], settleReach)) {
          expect(icon.x).toBe(original.x)
          expect(icon.y).toBe(original.y)
        }
      }

      const outside = a.icons.filter((icon) => !isAvoided(icon.x, icon.y, [RECT_CENTER], clearance))
      for (const icon of a.icons) {
        if (isAvoided(icon.x, icon.y, [RECT_CENTER], clearance)) expect(after.has(icon.id)).toBe(false)
      }
      // A few of the most crowded may be dropped to match the smaller free area.
      const survivors = outside.filter((icon) => after.has(icon.id))
      expect(survivors.length / outside.length).toBeGreaterThanOrEqual(0.9)
    })

    // The auth splash giving way to the sign-in card: a small mark is replaced
    // by a round hero over a form, in the middle of a 1080p screen.
    describe('when a splash is replaced by the sign-in card', () => {
      const screen = { width: 1920, height: 1080, spacing: 156 }
      const splash = [{ shape: 'rect', left: 920, top: 500, right: 1000, bottom: 580 }]
      const hero = { shape: 'ellipse', left: 820, top: 311, right: 1100, bottom: 591 }
      const form = { shape: 'rect', left: 784, top: 615, right: 1136, bottom: 839 }
      const signin = [hero, form]
      const a = layout(screen.width, screen.height, screen.spacing, { avoid: splash })
      const b = layout(screen.width, screen.height, screen.spacing, { avoid: signin, previous: a })

      // How far an icon's center is from the content outline (0 inside a rect).
      const heroRadius = (hero.right - hero.left) / 2
      const heroGap = (icon) =>
        Math.hypot(icon.x - (hero.left + hero.right) / 2, icon.y - (hero.top + hero.bottom) / 2) - heroRadius
      const formGap = (icon) =>
        Math.hypot(
          Math.max(form.left - icon.x, 0, icon.x - form.right),
          Math.max(form.top - icon.y, 0, icon.y - form.bottom),
        )

      it('settles icons away from the new content instead of leaving them hugging it', () => {
        const gaps = b.icons.map((icon) => Math.min(heroGap(icon), formGap(icon)))
        // Hard-cutting icons out of the new zone alone leaves survivors ~0.22
        // spacings from the content; a fresh layout keeps ~0.37.
        expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.33 * screen.spacing)
      })

      it('disturbs nothing when relaid out again with unchanged content', () => {
        const c = layout(screen.width, screen.height, screen.spacing, { avoid: signin, previous: b })
        expect(c.icons).toEqual(b.icons)
      })
    })

    it('returns the avoid shapes it was given', () => {
      const avoid = [ELLIPSE, RECT_BELOW]
      expect(layout(1280, 800, spacing, { avoid }).avoid).toEqual(avoid)
    })

    it('fills newly freed space without moving anything that was already placed', () => {
      const a = layout(1280, 800, spacing, { avoid: [RECT_CENTER] })
      const b = layout(1280, 800, spacing, { previous: a })
      const after = byId(b.icons)

      for (const icon of a.icons) {
        expect(after.has(icon.id)).toBe(true)
        expect(lookOf(after.get(icon.id))).toEqual(lookOf(icon))
      }
      expect(b.icons.length).toBeGreaterThan(a.icons.length)

      const filledOldRect = b.icons.filter(
        (icon) =>
          icon.id >= a.nextId &&
          icon.x >= RECT_CENTER.left &&
          icon.x <= RECT_CENTER.right &&
          icon.y >= RECT_CENTER.top &&
          icon.y <= RECT_CENTER.bottom,
      )
      expect(filledOldRect.length).toBeGreaterThan(0)

      expect(Math.min(...nearestNeighborDistances(b.icons))).toBeGreaterThanOrEqual(0.4 * spacing)
      expect(sameKindPairsWithin(b.icons, 1.35 * spacing)).toBe(0)
    })

    it('anchors a resize to the center of the pattern and settles only icons near the edges', () => {
      const a = layout(1280, 800, spacing)
      const b = layout(1080, 800, spacing, { previous: a })
      const before = byId(a.icons)
      // Icons within 1.5 spacings of the bled-out edges (0.35 spacings past
      // the screen) may settle after a resize; everything else stays put.
      const margin = (1.5 - 0.35) * spacing
      const awayFromEdges = (x, y) => x > margin && x < 1080 - margin && y > margin && y < 800 - margin

      const survivors = b.icons.filter((icon) => before.has(icon.id))
      let anchored = 0
      let settled = 0
      for (const icon of survivors) {
        const original = before.get(icon.id)
        const x = original.x - 100
        if (awayFromEdges(x, original.y)) {
          expect(icon.x).toBe(x)
          expect(icon.y).toBe(original.y)
          anchored++
        } else if (icon.x !== x || icon.y !== original.y) {
          settled++
        }
      }
      expect(anchored).toBeGreaterThan(0)
      expect(settled).toBeGreaterThan(0)
    })

    // A desktop window dragged narrower and back again relays out at every
    // step; each step crops or extends the edges, and those must not add up.
    it('stays even after a window drag and back', () => {
      const screen = { width: 1920, height: 1080, spacing: 156 }
      const widths = []
      for (let width = screen.width - 20; width >= 1300; width -= 20) widths.push(width)
      for (let width = 1300 + 20; width <= screen.width; width += 20) widths.push(width)

      let result = layout(screen.width, screen.height, screen.spacing)
      for (const width of widths) {
        result = layout(width, screen.height, screen.spacing, { previous: result })
      }

      const { icons } = result
      expect(result.width).toBe(screen.width)
      expect(largestEmptyCircle(icons, screen.width, screen.height, 10)).toBeLessThan(screen.spacing)
      expect(Math.min(...nearestNeighborDistances(icons))).toBeGreaterThanOrEqual(0.45 * screen.spacing)
      expect(sameKindPairsWithin(icons, 1.35 * screen.spacing)).toBe(0)
    })

    it('starts fresh when the spacing changes', () => {
      const a = layout(1280, 800, 136)
      const b = layout(1280, 800, 106, { previous: a })

      expect(b.icons.length).toBeGreaterThan(0)
      for (const icon of b.icons) {
        expect(icon.id).toBeGreaterThanOrEqual(a.nextId)
        expect(icon.size).toBeGreaterThanOrEqual(0.19 * 106)
        expect(icon.size).toBeLessThanOrEqual(0.31 * 106)
      }
    })
  })
})
