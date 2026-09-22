import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import cassetteSvg from '../assets/icons/cassette.svg?raw'
import cardSvg from '../assets/icons/card.svg?raw'
import coinSvg from '../assets/icons/coin.svg?raw'
import dollSvg from '../assets/icons/doll.svg?raw'
import dvdSvg from '../assets/icons/dvd.svg?raw'
import legoSvg from '../assets/icons/lego.svg?raw'
import stampSvg from '../assets/icons/stamp.svg?raw'
import teddySvg from '../assets/icons/teddy.svg?raw'
import vinylSvg from '../assets/icons/vinyl.svg?raw'
import './DecorBackground.css'

const ICONS = [vinylSvg, dvdSvg, cardSvg, cassetteSvg, stampSvg, coinSvg, legoSvg, teddySvg, dollSvg]

// Deterministic pseudo-random (integer hash) so a given layout always
// produces the same positions. Uses Math.imul to keep every multiplication
// inside safe 32-bit integer range — plain `x * x * k` overflows float64's
// 53-bit precision for larger seeds, which silently collides different
// seeds onto the same output.
function pseudoRandom(seed) {
  let t = (seed + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function inZone(x, y, zone) {
  return !!zone && x > zone.left && x < zone.right && y > zone.top && y < zone.bottom
}

// Bridson's Poisson-disk sampling: unlike best-candidate (which only
// *prefers* far-apart points but can still settle for a mediocre one when
// its sample runs dry), this enforces a hard minimum distance between every
// pair of icons and keeps growing the pattern outward from existing points
// until the whole area is saturated. That combination — a hard floor on
// closeness, plus growing until no more room is left — is what rules out
// both tight clusters and dead gaps by construction, not just by bias.
// Working in real measured pixels (rather than percent-of-an-assumed-size)
// means the content's no-go zone is exactly as big as the content actually
// renders at, at whatever width the page happens to be — no per-breakpoint
// guessing that goes stale the moment the content's fraction of the screen
// changes.
function buildPositions(minDist, zone, width, height, seedBase, maxPoints) {
  const cellSize = minDist / Math.SQRT2
  const gridW = Math.max(1, Math.ceil(width / cellSize))
  const gridH = Math.max(1, Math.ceil(height / cellSize))
  const grid = new Array(gridW * gridH).fill(-1)
  const points = []
  const active = []
  let calls = 0
  const rand = () => pseudoRandom(seedBase + calls++ * 92821 + 1)

  function cellOf(x, y) {
    const gx = Math.min(gridW - 1, Math.max(0, Math.floor(x / cellSize)))
    const gy = Math.min(gridH - 1, Math.max(0, Math.floor(y / cellSize)))
    return { gx, gy }
  }

  function farEnoughFromExisting(x, y) {
    const { gx, gy } = cellOf(x, y)
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const nx = gx + ox
        const ny = gy + oy
        if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue
        const idx = grid[ny * gridW + nx]
        if (idx === -1) continue
        const p = points[idx]
        if (Math.hypot(p.x - x, p.y - y) < minDist) return false
      }
    }
    return true
  }

  function tryAdd(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false
    if (inZone(x, y, zone)) return false
    if (!farEnoughFromExisting(x, y)) return false
    const idx = points.length
    points.push({ x, y })
    active.push(idx)
    const { gx, gy } = cellOf(x, y)
    grid[gy * gridW + gx] = idx
    return true
  }

  // Seed with a bounded search for a first valid point — needed because the
  // very first random draw can land inside the exclusion zone.
  for (let tries = 0; points.length === 0 && tries < 500; tries++) {
    tryAdd(rand() * width, rand() * height)
  }

  const candidatesPerActive = 30
  while (active.length > 0 && points.length < maxPoints) {
    const activeSlot = Math.floor(rand() * active.length)
    const p = points[active[activeSlot]]
    let placed = false
    for (let i = 0; i < candidatesPerActive; i++) {
      const angle = rand() * Math.PI * 2
      const radius = minDist * (1 + rand())
      if (tryAdd(p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius)) {
        placed = true
        break
      }
    }
    if (!placed) active.splice(activeSlot, 1)
  }

  return points
}

// Roughly one icon per this many square px — density stays visually
// consistent from a narrow phone up through an ultra-wide desktop instead of
// jumping between fixed per-breakpoint counts. Poisson-disk spacing (below)
// is derived from this so the average density matches what it always has.
const AREA_PER_ICON = 21000

// For Bridson's algorithm the *density* is an emergent result of the minimum
// spacing, not a direct input — a random Poisson-disk packing settles at
// roughly 1.1x the area of the disk implied by that spacing (well short of
// hexagonal-max packing). Solving that back out for the desired area-per-icon
// gives the spacing to pass in.
const MIN_ICON_DIST = Math.sqrt(AREA_PER_ICON / 1.1)

function DecorIcon({ svg, x, y, size }) {
  return (
    <span
      className="decor-icon"
      style={{ left: `${x}px`, top: `${y}px`, '--icon-size': `${size}px` }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// Size is rolled from a seed unrelated to the icon-selection index or any
// small period, so it doesn't lock each icon to a fixed size the way a CSS
// nth-child rule would if its modulus shared a factor with ICONS.length.
function iconSize(i) {
  const roll = pseudoRandom(i * 2654435761 + 104729)
  return 30 + roll * 20
}

// Picking ICONS[i % ICONS.length] directly would repeat the same icon
// whenever a run of indices shares a factor with ICONS.length. Hashing the
// index first decorrelates icon choice from position entirely.
function iconFor(i) {
  return ICONS[Math.floor(pseudoRandom(i * 40503 + 19) * ICONS.length) % ICONS.length]
}

// Content padded by a fixed px margin (enough to clear an icon's own
// radius) rather than a percentage, since the margin an icon needs is a
// fixed physical size regardless of how wide the viewport is.
const ZONE_MARGIN = 30

// hostRef/contentRef are optional: when a caller just wants a full-bleed
// decorative background with no content to avoid (e.g. the signed-in home
// screen), it can render <DecorBackground /> with neither prop and this
// falls back to its own parent element as the host, with no exclusion zone.
export function DecorBackground({ hostRef, contentRef }) {
  const rootRef = useRef(null)
  const [layout, setLayout] = useState(null)

  useLayoutEffect(() => {
    const host = hostRef?.current ?? rootRef.current?.parentElement
    if (!host) return

    function measure() {
      const hostRect = host.getBoundingClientRect()
      const width = hostRect.width
      const height = hostRect.height
      const content = contentRef?.current
      const zone = content
        ? (() => {
            const c = content.getBoundingClientRect()
            return {
              left: c.left - hostRect.left - ZONE_MARGIN,
              top: c.top - hostRect.top - ZONE_MARGIN,
              right: c.right - hostRect.left + ZONE_MARGIN,
              bottom: c.bottom - hostRect.top + ZONE_MARGIN,
            }
          })()
        : null
      // Round to the nearest 20px so a 1px resize jiggle during a window
      // drag doesn't reshuffle every icon's position.
      const round = (v) => Math.round(v / 20) * 20
      setLayout((prev) => {
        const next = {
          width: round(width),
          height: round(height),
          zone: zone && {
            left: round(zone.left),
            top: round(zone.top),
            right: round(zone.right),
            bottom: round(zone.bottom),
          },
        }
        if (
          prev &&
          prev.width === next.width &&
          prev.height === next.height &&
          JSON.stringify(prev.zone) === JSON.stringify(next.zone)
        ) {
          return prev
        }
        return next
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    // Also watch the content itself: a web font finishing its swap can
    // reflow the subtitle pill to a different size without the host
    // resizing at all, which would otherwise leave the exclusion zone
    // stale (and icons already placed inside it).
    const content = contentRef?.current
    if (content) observer.observe(content)
    return () => observer.disconnect()
  }, [hostRef, contentRef])

  const icons = useMemo(() => {
    if (!layout || layout.width <= 0 || layout.height <= 0) return []
    return buildPositions(MIN_ICON_DIST, layout.zone, layout.width, layout.height, 7, 120).map((pos, i) => ({
      key: i,
      svg: iconFor(i),
      size: iconSize(i),
      ...pos,
    }))
  }, [layout])

  return (
    <div className="decor-background" aria-hidden="true" ref={rootRef}>
      {icons.map((icon) => (
        <DecorIcon key={icon.key} svg={icon.svg} x={icon.x} y={icon.y} size={icon.size} />
      ))}
    </div>
  )
}
