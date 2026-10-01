import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react'
import cassetteSvg from '../assets/icons/cassette.svg?raw'
import cardSvg from '../assets/icons/card.svg?raw'
import coinSvg from '../assets/icons/coin.svg?raw'
import dollSvg from '../assets/icons/doll.svg?raw'
import dvdSvg from '../assets/icons/dvd.svg?raw'
import legoSvg from '../assets/icons/lego.svg?raw'
import stampSvg from '../assets/icons/stamp.svg?raw'
import teddySvg from '../assets/icons/teddy.svg?raw'
import vinylSvg from '../assets/icons/vinyl.svg?raw'
import { iconSpacing, layoutDecor, sameZone } from './decorLayout'
import './DecorBackground.css'

const ICONS = [vinylSvg, dvdSvg, cardSvg, cassetteSvg, stampSvg, coinSvg, legoSvg, teddySvg, dollSvg]
// Matches the .decor-icon--color-N rules in DecorBackground.css.
const COLOR_COUNT = 4
// A window drag resizes the layer every frame. Relaying out once it pauses
// for this long, instead of on every frame, settles the edges once rather
// than piling up dozens of small crops; icons are positioned from the
// layer's center, so they stay put meanwhile.
const RESIZE_SETTLE_MS = 150

const NO_ZONES = []
const DecorRegisterContext = createContext(null)
const DecorZonesContext = createContext(NO_ZONES)

// Holds the elements icons should stay clear of. It sits above both the
// background and every page, so a page can mark its key content with
// useDecorAvoid without the background knowing about any particular page.
// Register and the zone list are separate contexts so registering doesn't
// re-render the page that registered.
export function DecorProvider({ children }) {
  const [zones, setZones] = useState(NO_ZONES)
  const register = useCallback((zone) => {
    setZones((current) => [...current, zone])
    return () => setZones((current) => current.filter((z) => z !== zone))
  }, [])

  return (
    <DecorRegisterContext.Provider value={register}>
      <DecorZonesContext.Provider value={zones}>{children}</DecorZonesContext.Provider>
    </DecorRegisterContext.Provider>
  )
}

// Keeps icons clear of the element in `ref` for as long as the calling
// component is mounted. shape: 'rect' (rounded-corner clearance) or
// 'ellipse' (for round content, so its bounding box corners stay usable).
// The hook has to read this file's private contexts, so it lives beside them.
// oxlint-disable-next-line react/only-export-components
export function useDecorAvoid(ref, shape = 'rect') {
  const register = useContext(DecorRegisterContext)
  // Layout effect so the zone is in place before the first paint, and icons
  // never flash on top of content that's just appeared.
  useLayoutEffect(() => {
    if (!register) return undefined
    return register({ ref, shape })
  }, [register, ref, shape])
}

function measureZones(zones, origin) {
  const avoid = []
  for (const { ref, shape } of zones) {
    const el = ref.current
    if (!el) continue
    const box = el.getBoundingClientRect()
    // display: none (e.g. a hidden theme variant) measures as an empty box.
    if (box.width === 0 && box.height === 0) continue
    avoid.push({
      shape,
      left: Math.round(box.left - origin.left),
      top: Math.round(box.top - origin.top),
      right: Math.round(box.right - origin.left),
      bottom: Math.round(box.bottom - origin.top),
    })
  }
  return avoid
}

function sameZones(a, b) {
  return a.length === b.length && a.every((zone, i) => sameZone(zone, b[i]))
}

// One fixed, viewport-sized layer rendered once at the app shell, behind
// every screen. Because it never unmounts, moving between pages never
// re-scatters it. Content that registers with useDecorAvoid gets icons kept
// clear of it; when that content comes or goes the rest of the pattern stays
// put, icons fade in only where space opened, and the few right beside newly
// appeared content glide back to a natural gap. A resize keeps the pattern
// centered and, once it pauses, trims or fills in the edges.
export function DecorBackground() {
  const rootRef = useRef(null)
  const zones = useContext(DecorZonesContext)
  const [layout, setLayout] = useState(null)
  // The last layout applied, readable from observer and timer callbacks
  // without waiting for a render.
  const layoutRef = useRef(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    let settleTimer

    // Measures the layer and every zone as they are right now, so a
    // delayed relayout never works from sizes that have since changed. That
    // also covers any relayout still waiting on the timer, so it's dropped.
    function relayout() {
      clearTimeout(settleTimer)
      const box = root.getBoundingClientRect()
      const width = Math.round(box.width)
      const height = Math.round(box.height)
      if (width <= 0 || height <= 0) return
      const avoid = measureZones(zones, box)
      const spacing = iconSpacing(window.screen.width, window.screen.height)
      const previous = layoutRef.current
      if (
        previous &&
        previous.width === width &&
        previous.height === height &&
        previous.spacing === spacing &&
        sameZones(previous.avoid, avoid)
      ) {
        return
      }
      const next = layoutDecor({
        width,
        height,
        spacing,
        avoid,
        previous,
        kindCount: ICONS.length,
        colorCount: COLOR_COUNT,
      })
      layoutRef.current = next
      setLayout(next)
    }

    // A change in the layer's own size waits for the resize to pause. Any
    // other change (registered content moving or resizing) relays out at
    // once, so icons never paint over content in its new spot.
    function measure() {
      const box = root.getBoundingClientRect()
      const applied = layoutRef.current
      if (applied && (Math.round(box.width) !== applied.width || Math.round(box.height) !== applied.height)) {
        clearTimeout(settleTimer)
        settleTimer = setTimeout(relayout, RESIZE_SETTLE_MS)
      } else {
        relayout()
      }
    }

    // Straight away rather than through measure(): this is either the first
    // layout or registered content changing (which re-runs this effect), and
    // that content must be avoided before the next paint even mid-resize.
    relayout()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    // Content can change size without the viewport changing (a web font
    // swapping in, an error message appearing), which moves its zone.
    for (const { ref } of zones) {
      if (ref.current) observer.observe(ref.current)
    }
    return () => {
      observer.disconnect()
      clearTimeout(settleTimer)
    }
  }, [zones])

  return (
    <div className="decor-background" aria-hidden="true" ref={rootRef}>
      {layout?.icons.map((icon) => (
        <span
          key={icon.id}
          className={`decor-icon decor-icon--color-${icon.color}`}
          style={{
            // Offsets from the layer's center, where the engine anchors the
            // pattern on resize: a resize changes none of them (so nothing
            // glides), and CSS keeps icons centered until the relayout runs.
            '--icon-x': `${(icon.x - layout.width / 2).toFixed(1)}px`,
            '--icon-y': `${(icon.y - layout.height / 2).toFixed(1)}px`,
            '--icon-size': `${icon.size.toFixed(1)}px`,
            '--icon-rotate': `${icon.rotation.toFixed(1)}deg`,
            '--float-duration': `${icon.duration.toFixed(2)}s`,
            '--float-delay': `${icon.delay.toFixed(2)}s`,
          }}
          dangerouslySetInnerHTML={{ __html: ICONS[icon.kind] }}
        />
      ))}
    </div>
  )
}
