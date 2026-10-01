// Layout engine for the decorative icon background. Pure functions only (no
// DOM), so the whole placement can be unit-tested and replays identically
// for the same inputs.
//
// The approach, and why it isn't Poisson-disk:
//  - The number of icons is decided up front from the free area (one
//    honeycomb cell per icon), so coverage is always proportional to the
//    screen instead of being whatever a growth process happens to reach.
//  - Seed points come from Mitchell's best-candidate sampling, then a few
//    rounds of Lloyd relaxation move each icon to the centroid of the area
//    it's nearest to. Lloyd is what evens things out: an icon with a big
//    empty patch beside it is pulled into that patch, and two crowded icons
//    push apart. Stopping after a few rounds (instead of converging) keeps
//    the result organic rather than settling into a honeycomb grid.
//  - The area is sampled on a fine grid with avoided content removed, so
//    icons flow right up to any shape of content (circles included) at the
//    same spacing they keep from each other.
//  - Icon kind and color are chosen per icon to be as far as possible from
//    the nearest icon that already has that kind/color, so no kind clumps.
//  - Relayouts (resize, content appearing/disappearing) keep surviving
//    icons where they were and only add icons in newly opened space, so
//    nothing reshuffles in front of the user. Two exceptions: icons right
//    next to content that just appeared ease back to the same gap a fresh
//    layout would leave instead of hugging its edge, and after a resize the
//    icons near the screen edges settle together with the new ones, so
//    edges trimmed and extended over and over (a window drag) stay about as
//    even as a fresh layout instead of piling up gaps. A settling icon keeps
//    its kind, so it never moves next to another icon of the same kind.

// Icon spacing (px between neighboring icons in an ideal honeycomb) scales
// with the device's screen: a phone gets proportionally smaller, closer icons
// instead of a few desktop-sized ones stranded around its content, so every
// screen looks equally full. Keyed off the physical screen rather than the
// window so resizing a desktop window never changes the look.
const SPACING_MIN = 100
const SPACING_MAX = 156
const SPACING_BASE = 80
const SPACING_PER_SCREEN_PX = 0.07

// Icon size range, as fractions of the spacing.
const SIZE_MIN_RATIO = 0.19
const SIZE_MAX_RATIO = 0.31

// Sample-grid resolution: samples per spacing along each axis.
const SAMPLES_PER_SPACING = 12
const RELAX_ROUNDS = 3
// How far past the viewport edge (in spacings) icons may sit, so edge icons
// are sometimes cut off and the pattern reads as continuing off-screen.
const EDGE_BLEED = 0.35
// Clearance between an icon's center and avoided content, as a fraction of
// the largest icon size (a little more than its radius).
const AVOID_CLEARANCE_RATIO = 0.6
// Beyond this many spacings, a same-kind neighbor no longer counts against a
// kind, and the least-used kind wins instead (keeps the mix balanced).
const SAME_KIND_REACH = 3
// Same-kind icons must never look grouped (an explicit requirement), so an
// icon that settles never moves within this many spacings of one of its own
// kind. It keeps its kind because swapping its glyph mid-glide would be
// jarring, so the move is what gives way.
const SAME_KIND_GAP = 1.35
const BEST_CANDIDATE_TRIES = 24
// Survivors within this many spacings of newly appeared content may move.
const NEW_CONTENT_REACH = 1
// After a resize, survivors within this many spacings of an edge may move.
// Each resize crops or extends the pattern at the edges; if the icons there
// stayed pinned, the crops of a window drag would stack up into gaps over a
// spacing wide. About two rows deep (1.5) evens the edges out better than
// one row deep (1) does.
const RESIZE_EDGE_REACH = 1.5

const ROTATION_RANGE = 16 // degrees either way
const FLOAT_DURATION_MIN = 6 // seconds
const FLOAT_DURATION_MAX = 10

export function iconSpacing(screenWidth, screenHeight) {
  const shortSide = Math.min(screenWidth, screenHeight)
  return Math.min(SPACING_MAX, Math.max(SPACING_MIN, SPACING_BASE + shortSide * SPACING_PER_SCREEN_PX))
}

export function avoidClearance(spacing) {
  return spacing * SIZE_MAX_RATIO * AVOID_CLEARANCE_RATIO
}

// Free area each icon gets: one cell of a honeycomb at this spacing.
function areaPerIcon(spacing) {
  return (spacing * spacing * Math.sqrt(3)) / 2
}

// mulberry32: small, fast, seedable PRNG.
export function createRandom(seed) {
  let state = seed >>> 0
  return function random() {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Exported so the component compares measured zones exactly the way the
// engine decides which content is new.
export function sameZone(a, b) {
  return a.shape === b.shape && a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom
}

// Avoid shapes are { shape: 'rect' | 'ellipse', left, top, right, bottom } in
// the same px space as the layout. A rect keeps `clearance` from every edge
// (so its corners come out rounded); an ellipse keeps it from its outline.
export function isAvoided(x, y, avoid, clearance) {
  for (const zone of avoid) {
    if (zone.shape === 'ellipse') {
      const rx = (zone.right - zone.left) / 2 + clearance
      const ry = (zone.bottom - zone.top) / 2 + clearance
      const nx = (x - (zone.left + zone.right) / 2) / rx
      const ny = (y - (zone.top + zone.bottom) / 2) / ry
      if (nx * nx + ny * ny < 1) return true
    } else {
      const dx = Math.max(zone.left - x, 0, x - zone.right)
      const dy = Math.max(zone.top - y, 0, y - zone.bottom)
      if (dx * dx + dy * dy < clearance * clearance) return true
    }
  }
  return false
}

function buildSamples(domain, step, avoid, clearance) {
  const xs = []
  const ys = []
  for (let y = domain.top + step / 2; y < domain.bottom; y += step) {
    for (let x = domain.left + step / 2; x < domain.right; x += step) {
      if (!isAvoided(x, y, avoid, clearance)) {
        xs.push(x)
        ys.push(y)
      }
    }
  }
  return { xs, ys, count: xs.length }
}

function nearestDistance(points, x, y, skip = -1) {
  let best = Infinity
  for (let i = 0; i < points.length; i++) {
    if (i === skip) continue
    const d = Math.hypot(points[i].x - x, points[i].y - y)
    if (d < best) best = d
  }
  return best
}

// Bucket grid for fast nearest-point queries during relaxation.
function buildPointIndex(points, domain, cellSize) {
  const cols = Math.max(1, Math.ceil((domain.right - domain.left) / cellSize))
  const rows = Math.max(1, Math.ceil((domain.bottom - domain.top) / cellSize))
  const buckets = Array.from({ length: cols * rows }, () => [])
  const cellOf = (v, origin, max) => Math.min(max - 1, Math.max(0, Math.floor((v - origin) / cellSize)))
  points.forEach((p, i) => {
    buckets[cellOf(p.y, domain.top, rows) * cols + cellOf(p.x, domain.left, cols)].push(i)
  })

  return function nearest(x, y) {
    const gx = cellOf(x, domain.left, cols)
    const gy = cellOf(y, domain.top, rows)
    let best = -1
    let bestD2 = Infinity
    const maxRing = Math.max(cols, rows)
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let cy = gy - ring; cy <= gy + ring; cy++) {
        if (cy < 0 || cy >= rows) continue
        const edgeRow = cy === gy - ring || cy === gy + ring
        for (let cx = gx - ring; cx <= gx + ring; cx++) {
          if (cx < 0 || cx >= cols) continue
          // Only the ring's outline is new; its inside was searched already.
          if (!edgeRow && cx !== gx - ring && cx !== gx + ring) continue
          for (const i of buckets[cy * cols + cx]) {
            const dx = points[i].x - x
            const dy = points[i].y - y
            const d2 = dx * dx + dy * dy
            if (d2 < bestD2) {
              bestD2 = d2
              best = i
            }
          }
        }
      }
      // Anything not yet visited is at least `ring` whole cells away.
      if (best !== -1 && Math.sqrt(bestD2) <= ring * cellSize) break
    }
    return best
  }
}

// Mitchell's best-candidate: of a handful of random free spots, keep the one
// farthest from every existing icon.
function addBestCandidates(points, count, samples, random, make) {
  for (let n = 0; n < count; n++) {
    let bestSample = -1
    let bestDist = -1
    for (let t = 0; t < BEST_CANDIDATE_TRIES; t++) {
      const s = Math.floor(random() * samples.count)
      const d = nearestDistance(points, samples.xs[s], samples.ys[s])
      if (d > bestDist) {
        bestDist = d
        bestSample = s
      }
    }
    points.push(make(samples.xs[bestSample], samples.ys[bestSample]))
  }
}

function sameKindWithin(points, p, x, y, distance) {
  return points.some((q) => q !== p && q.kind === p.kind && Math.hypot(q.x - x, q.y - y) < distance)
}

// Lloyd relaxation over the free-area samples. Only points with
// `movable(point)` move; the rest still claim their share of the area, so
// new icons settle evenly between icons that stay put. Points with
// `keepsKind(point)` already show their kind (see SAME_KIND_GAP), so they
// skip any move that would put them too close to an icon of that kind.
function relax(points, samples, domain, spacing, rounds, movable, keepsKind) {
  const n = points.length
  const kindGap = spacing * SAME_KIND_GAP
  for (let round = 0; round < rounds; round++) {
    const nearest = buildPointIndex(points, domain, spacing)
    const sumX = new Float64Array(n)
    const sumY = new Float64Array(n)
    const hits = new Uint32Array(n)
    for (let s = 0; s < samples.count; s++) {
      const i = nearest(samples.xs[s], samples.ys[s])
      sumX[i] += samples.xs[s]
      sumY[i] += samples.ys[s]
      hits[i]++
    }
    for (let i = 0; i < n; i++) {
      const p = points[i]
      if (hits[i] === 0 || !movable(p)) continue
      const x = sumX[i] / hits[i]
      const y = sumY[i] / hits[i]
      // Moves apply one at a time, so this sees every other icon where it
      // is right now, and no order of moves within a round can pair two up.
      if (keepsKind(p) && sameKindWithin(points, p, x, y, kindGap)) continue
      p.x = x
      p.y = y
    }
  }
}

// A centroid of a region that wraps around avoided content can land inside
// it; snap any such icon to the nearest free sample.
function snapOutOfAvoided(points, samples, avoid, clearance, movable) {
  for (const p of points) {
    if (!movable(p) || !isAvoided(p.x, p.y, avoid, clearance)) continue
    let best = -1
    let bestD2 = Infinity
    for (let s = 0; s < samples.count; s++) {
      const dx = samples.xs[s] - p.x
      const dy = samples.ys[s] - p.y
      const d2 = dx * dx + dy * dy
      if (d2 < bestD2) {
        bestD2 = d2
        best = s
      }
    }
    if (best !== -1) {
      p.x = samples.xs[best]
      p.y = samples.ys[best]
    }
  }
}

// Pick, for each new point, the option whose nearest existing holder is
// farthest away (capped at `reach`), breaking ties toward the least-used
// option and then at random.
function assignSpread(points, isNew, key, optionCount, reach, random) {
  const counts = new Array(optionCount).fill(0)
  for (const p of points) if (!isNew(p)) counts[p[key]]++
  for (const p of points) {
    if (!isNew(p)) continue
    const nearestSame = new Array(optionCount).fill(reach)
    for (const q of points) {
      if (q === p || q[key] === undefined) continue
      const d = Math.hypot(q.x - p.x, q.y - p.y)
      if (d < nearestSame[q[key]]) nearestSame[q[key]] = d
    }
    const offset = Math.floor(random() * optionCount)
    let best = -1
    for (let k = 0; k < optionCount; k++) {
      const option = (k + offset) % optionCount
      if (
        best === -1 ||
        nearestSame[option] > nearestSame[best] ||
        (nearestSame[option] === nearestSame[best] && counts[option] < counts[best])
      ) {
        best = option
      }
    }
    p[key] = best
    counts[best]++
  }
}

// width/height: the area to fill, in px.
// spacing: from iconSpacing(); sets both icon density and icon size.
// avoid: content shapes icons must stay clear of (see isAvoided).
// previous: the last result for this background, if any. Surviving icons
//   keep their look and stay put, except those near newly appeared content
//   or (after a resize) near an edge, which settle along with the new icons
//   (never next to an icon of their own kind); only new space gets new
//   icons. If it was laid out at a different spacing its icons are all
//   replaced, but its nextId still carries over so new ids never repeat
//   old ones.
// Returns { width, height, spacing, avoid, nextId, icons: [{ id, x, y, kind,
//   color, size, rotation, duration, delay }] }.
export function layoutDecor({
  width,
  height,
  spacing,
  kindCount,
  colorCount,
  avoid = [],
  previous = null,
  seed = 1,
}) {
  const clearance = avoidClearance(spacing)
  const bleed = spacing * EDGE_BLEED
  const domain = { left: -bleed, top: -bleed, right: width + bleed, bottom: height + bleed }
  const step = spacing / SAMPLES_PER_SPACING
  const samples = buildSamples(domain, step, avoid, clearance)
  const target = Math.round((samples.count * step * step) / areaPerIcon(spacing))

  let nextId = previous?.nextId ?? 0
  const random = createRandom(seed * 7919 + nextId)
  const inDomain = (p) => p.x >= domain.left && p.x < domain.right && p.y >= domain.top && p.y < domain.bottom
  const reusable = previous && previous.spacing === spacing ? previous : null

  // Anchor surviving icons to the center, so a resize trims or extends the
  // pattern evenly on both sides instead of shoving it all one way.
  const shiftX = reusable ? (width - reusable.width) / 2 : 0
  const shiftY = reusable ? (height - reusable.height) / 2 : 0
  const points = (reusable?.icons ?? [])
    .map((icon) => ({ ...icon, x: icon.x + shiftX, y: icon.y + shiftY }))
    .filter((p) => inDomain(p) && !isAvoided(p.x, p.y, avoid, clearance))

  // Too many survivors (e.g. freed space shrank): drop the most crowded.
  while (points.length > target && points.length > 0) {
    let crowded = 0
    let crowdedDist = Infinity
    points.forEach((p, i) => {
      const d = nearestDistance(points, p.x, p.y, i)
      if (d < crowdedDist) {
        crowdedDist = d
        crowded = i
      }
    })
    points.splice(crowded, 1)
  }

  // Content that just appeared cut its icons out with a hard edge, leaving
  // survivors hugging it. Let the survivors nearest new content settle
  // along with any new icons, so the gap around it matches the gap a fresh
  // layout leaves. Unchanged content never disturbs its neighbors.
  const previousAvoid = reusable?.avoid ?? []
  const newZones = avoid.filter((zone) => !previousAvoid.some((old) => sameZone(old, zone)))
  const settling = new Set(
    newZones.length > 0
      ? points.filter((p) => isAvoided(p.x, p.y, newZones, clearance + spacing * NEW_CONTENT_REACH))
      : [],
  )
  // A resize crops the pattern at the edges (or opens empty strips there).
  // Let the icons near the edges settle with any new ones so the edges come
  // out as even as a fresh layout, instead of each crop leaving its gap.
  if (reusable && (width !== reusable.width || height !== reusable.height)) {
    const edgeReach = spacing * RESIZE_EDGE_REACH
    for (const p of points) {
      if (
        p.x - domain.left < edgeReach ||
        domain.right - p.x < edgeReach ||
        p.y - domain.top < edgeReach ||
        domain.bottom - p.y < edgeReach
      ) {
        settling.add(p)
      }
    }
  }

  const added = new Set()
  if (samples.count > 0 && points.length < target) {
    addBestCandidates(points, target - points.length, samples, random, (x, y) => {
      const p = { id: nextId++, x, y }
      added.add(p)
      return p
    })
  }
  const isNew = (p) => added.has(p)
  const movable = (p) => added.has(p) || settling.has(p)
  // New icons get their kind after relaxing, so only settling survivors
  // bring one along that their moves must respect.
  const keepsKind = (p) => settling.has(p)

  if (added.size > 0 || settling.size > 0) {
    relax(points, samples, domain, spacing, RELAX_ROUNDS, movable, keepsKind)
    snapOutOfAvoided(points, samples, avoid, clearance, movable)
  }
  if (added.size > 0) {
    assignSpread(points, isNew, 'kind', kindCount, spacing * SAME_KIND_REACH, random)
    assignSpread(points, isNew, 'color', colorCount, spacing * SAME_KIND_REACH, random)
    for (const p of added) {
      p.size = spacing * (SIZE_MIN_RATIO + random() * (SIZE_MAX_RATIO - SIZE_MIN_RATIO))
      p.rotation = (random() * 2 - 1) * ROTATION_RANGE
      p.duration = FLOAT_DURATION_MIN + random() * (FLOAT_DURATION_MAX - FLOAT_DURATION_MIN)
      // Negative delay starts each icon partway through its float, so they
      // never bob in unison.
      p.delay = -random() * p.duration
    }
  }

  return { width, height, spacing, avoid, nextId, icons: points }
}
