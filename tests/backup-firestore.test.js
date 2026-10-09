import { describe, expect, it } from 'vitest'
import { createLimiter, dumpCollection } from '../scripts/backup-firestore.js'

// In-memory fakes. tree: { collId: { docId: { data: {...} | null, subs: { ... } } } }
// data null = phantom parent. stats tracks RPCs in flight (each awaits a short delay).
// A node's optional `delay` (ms) overrides the default RPC latency for its own
// listCollections() and for getAll() chunks that start with it, so tests can make
// completion order differ from request order.
function makeFirestore(stats) {
  const firestore = {
    async getAll(...refs) {
      stats.getAllSizes.push(refs.length)
      await stats.rpc(refs[0].node.delay)
      stats.getAllDone.push(refs[0].id)
      return refs.map((ref) => ({ exists: ref.node.data !== null, data: () => ref.node.data }))
    },
  }
  const makeCol = (id, docs) => ({
    id,
    firestore,
    async listDocuments() {
      await stats.rpc()
      return Object.entries(docs).map(([docId, node]) => makeDoc(docId, node))
    },
  })
  const makeDoc = (id, node) => ({
    id,
    node,
    async listCollections() {
      await stats.rpc(node.delay)
      stats.listDone.push(id)
      return Object.entries(node.subs ?? {}).map(([subId, subDocs]) => makeCol(subId, subDocs))
    },
  })
  return { makeCol }
}

// Default: each RPC settles on its own timer. With { batched: true }, all pending
// RPCs settle together on a shared interval tick (like several gRPC completions
// handled in one socket read); call stats.stop() when done.
function makeStats(delay = 1, { batched = false } = {}) {
  let pending = []
  const pump = batched
    ? setInterval(() => {
        const batch = pending
        pending = []
        batch.forEach((resolve) => resolve())
      }, 1)
    : null
  const stats = {
    getAllSizes: [],
    getAllDone: [], // first ref id of each getAll chunk, in completion order
    listDone: [], // doc ids, in listCollections() completion order
    inFlight: 0,
    maxInFlight: 0,
    stop: () => clearInterval(pump),
    async rpc(ms = delay) {
      stats.inFlight += 1
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight)
      await new Promise((resolve) => (batched ? pending.push(resolve) : setTimeout(resolve, ms)))
      stats.inFlight -= 1
    },
  }
  return stats
}

describe('dumpCollection', () => {
  it('preserves listDocuments order and the entry shape when RPCs finish out of order', async () => {
    const stats = makeStats()
    // earlier docs get slower listCollections(), so completion order is reversed
    const col = makeFirestore(stats).makeCol('c', {
      z: { data: { n: 1 }, delay: 60 },
      a: { data: { n: 2 }, delay: 30 },
      m: { data: { n: 3 }, delay: 0 },
    })
    const { docs, count } = await dumpCollection(col)
    expect(stats.listDone).toEqual(['m', 'a', 'z'])
    expect(docs.map((d) => d.id)).toEqual(['z', 'a', 'm'])
    expect(Object.keys(docs[0])).toEqual(['id', 'exists', 'data', 'subcollections'])
    expect(docs[1]).toEqual({ id: 'a', exists: true, data: { n: 2 }, subcollections: {} })
    expect(count).toBe(3)
  })

  it('keeps phantom parents (exists false, data null) with their subcollections', async () => {
    const stats = makeStats()
    const col = makeFirestore(stats).makeCol('c', {
      ghost: { data: null, subs: { kids: { k1: { data: { v: 1 } } } } },
    })
    const { docs, count } = await dumpCollection(col)
    expect(docs).toEqual([
      {
        id: 'ghost',
        exists: false,
        data: null,
        subcollections: { kids: [{ id: 'k1', exists: true, data: { v: 1 }, subcollections: {} }] },
      },
    ])
    expect(count).toBe(1)
  })

  it('walks nested subcollections in order and sums counts', async () => {
    const stats = makeStats()
    const col = makeFirestore(stats).makeCol('c', {
      p1: {
        data: { a: 1 },
        subs: {
          // slow m1 makes `members` finish after `invites`, yet it must stay first
          members: { m1: { data: { r: 'x' }, delay: 60, subs: { deep: { d1: { data: { d: 1 } }, d2: { data: null } } } } },
          invites: { i1: { data: { r: 'y' } }, i2: { data: { r: 'z' } } },
        },
      },
      p2: { data: { a: 2 } },
    })
    const { docs, count } = await dumpCollection(col)
    expect(Object.keys(docs[0].subcollections)).toEqual(['members', 'invites'])
    expect(docs[0].subcollections.invites.map((d) => d.id)).toEqual(['i1', 'i2'])
    const m1 = docs[0].subcollections.members[0]
    expect(m1.subcollections.deep.map((d) => [d.id, d.exists])).toEqual([
      ['d1', true],
      ['d2', false],
    ])
    // p1, m1, d1, i1, i2, p2 exist; d2 is a phantom
    expect(count).toBe(6)
  })

  it('reads more than 300 docs with several getAll calls of at most 300 refs', async () => {
    const stats = makeStats()
    const tree = {}
    for (let i = 0; i < 750; i++) tree[`d${i}`] = { data: { i } }
    // earlier chunks are slower, so the chunks complete in reverse order
    tree.d0.delay = 60
    tree.d300.delay = 30
    tree.d600.delay = 0
    const { docs, count } = await dumpCollection(makeFirestore(stats).makeCol('c', tree))
    expect(stats.getAllDone).toEqual(['d600', 'd300', 'd0'])
    expect(stats.getAllSizes.sort((a, b) => b - a)).toEqual([300, 300, 150])
    expect(docs.map((d) => d.data.i)).toEqual(Array.from({ length: 750 }, (_, i) => i))
    expect(count).toBe(750)
  })

  it('does not call getAll for an empty collection', async () => {
    const stats = makeStats()
    const { docs, count } = await dumpCollection(makeFirestore(stats).makeCol('c', {}))
    expect(docs).toEqual([])
    expect(count).toBe(0)
    expect(stats.getAllSizes).toEqual([])
  })

  it('never exceeds the in-flight RPC limit across the recursive walk', async () => {
    const stats = makeStats(2)
    const tree = {}
    for (let i = 0; i < 60; i++) {
      tree[`d${i}`] = { data: { i }, subs: { s: { c: { data: { j: i }, subs: { t: { e: { data: {} } } } } } } }
    }
    const limit = createLimiter(5)
    const { count } = await dumpCollection(makeFirestore(stats).makeCol('c', tree), limit)
    expect(count).toBe(60 * 3)
    expect(stats.maxInFlight).toBeLessThanOrEqual(5)
    expect(stats.maxInFlight).toBeGreaterThan(1)
  })

  it('keeps the in-flight bound when many RPCs settle in the same tick', async () => {
    const stats = makeStats(1, { batched: true })
    // 6 docs per collection, 2 subcollections per doc, 3 levels
    let total = 0
    const makeTree = (depth) => {
      const tree = {}
      for (let i = 0; i < 6; i++) {
        total += 1
        tree[`d${i}`] = { data: {}, subs: depth > 0 ? { s: makeTree(depth - 1), t: makeTree(depth - 1) } : {} }
      }
      return tree
    }
    try {
      const { count } = await dumpCollection(makeFirestore(stats).makeCol('c', makeTree(2)), createLimiter(4))
      expect(count).toBe(total)
      expect(stats.maxInFlight).toBeLessThanOrEqual(4)
      expect(stats.maxInFlight).toBe(4)
    } finally {
      stats.stop()
    }
  })

  // Regression guard: deeper than MAX_IN_FLIGHT only completes if no slot is held
  // while awaiting child dumps. (A 1-doc chain never has >1 RPC in flight, so
  // this says nothing about the bound itself.)
  it('does not deadlock when nesting is deeper than the limit', async () => {
    const stats = makeStats(1)
    let node = { e: { data: {} } }
    for (let i = 0; i < 30; i++) node = { d: { data: {}, subs: { s: node } } }
    const { count } = await dumpCollection(makeFirestore(stats).makeCol('c', node), createLimiter(2))
    expect(count).toBe(31)
  })

  it('rejects when an RPC fails', async () => {
    const stats = makeStats()
    const col = makeFirestore(stats).makeCol('c', { a: { data: {} } })
    col.firestore.getAll = async () => {
      throw new Error('boom')
    }
    await expect(dumpCollection(col)).rejects.toThrow('boom')
  })
})

describe('createLimiter', () => {
  it('runs at most max tasks at once and returns results', async () => {
    const limit = createLimiter(2)
    let active = 0
    let peak = 0
    const task = (v) => async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active -= 1
      return v
    }
    const out = await Promise.all([1, 2, 3, 4, 5].map((v) => limit(task(v))))
    expect(out).toEqual([1, 2, 3, 4, 5])
    expect(peak).toBe(2)
  })

  // Holders release in the same tick and a freed caller re-enters limit() at once;
  // a limiter that frees the slot before the woken waiter takes it lets the
  // re-entrant call barge in and exceeds max.
  it('never admits more than max when releases and new calls share a tick', async () => {
    const max = 2
    const limit = createLimiter(max)
    let active = 0
    let peak = 0
    const task = (wait) => async () => {
      active += 1
      peak = Math.max(peak, active)
      await wait
      active -= 1
    }
    let gate
    const shared = new Promise((resolve) => (gate = resolve))
    const a = (async () => {
      await limit(task(shared))
      await limit(task(Promise.resolve())) // re-enters right after release
    })()
    const b = limit(task(shared))
    const w1 = limit(task(new Promise((resolve) => setTimeout(resolve, 5))))
    const w2 = limit(task(new Promise((resolve) => setTimeout(resolve, 5))))
    gate() // a and b finish in the same microtask drain
    await Promise.all([a, b, w1, w2])
    expect(peak).toBe(max)
  })

  it('admits waiters in FIFO order', async () => {
    const limit = createLimiter(1)
    const order = []
    let gate
    const held = limit(() => new Promise((resolve) => (gate = resolve)))
    const rest = [1, 2, 3].map((n) => limit(async () => order.push(n)))
    gate()
    await Promise.all([held, ...rest])
    expect(order).toEqual([1, 2, 3])
  })

  it('releases the slot when a task throws', async () => {
    const limit = createLimiter(1)
    await expect(
      limit(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    await expect(limit(async () => 'ok')).resolves.toBe('ok')
  })
})
