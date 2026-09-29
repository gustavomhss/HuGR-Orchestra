import { describe, expect, test } from "bun:test"
import { pruneDeadPartTombstones } from "../context/server-session"

// Verbatim copy of the touched-application in server-session.ts reconcileFetched:
//   for (const id of options.touched ?? emptyIDs) {
//     const item = live.get(id)
//     if (item) result.set(id, item)
//   }
// The safety argument for the prune is that an entry only matters when the part is
// present in the store, so every assertion here compares the reconcile outcome with and
// without the prune across exhaustive id combinations.
function reconcileFetched<T extends { id: string }>(
  fetched: T[],
  current: readonly T[],
  options: { touched?: ReadonlySet<string> } = {},
) {
  const result = new Map(fetched.map((item) => [item.id, item]))
  const live = new Map(current.map((item) => [item.id, item]))
  for (const id of options.touched ?? []) {
    const item = live.get(id)
    if (item) result.set(id, item)
  }
  return [...result.values()]
}

type World = { pending: Map<string, Set<string>>; store: Record<string, string[]>; covered: Set<string> }

function makeWorld(tombstones: [string, string[]][], store: Record<string, string[]>, covered: string[]): World {
  return {
    pending: new Map(tombstones.map(([messageID, parts]) => [messageID, new Set(parts)])),
    store,
    covered: new Set(covered),
  }
}

function liveOf(world: World) {
  return (messageID: string) => new Set(world.store[messageID] ?? [])
}

function outcome(world: World, messageIDs: string[]) {
  return messageIDs.flatMap((messageID) => {
    const fetched = (world.store[messageID] ?? []).map((id) => ({ id }))
    const current = (world.store[messageID] ?? []).map((id) => ({ id }))
    return reconcileFetched(fetched, current, { touched: world.pending.get(messageID) })
  })
}

const MESSAGE_IDS = ["m1", "m2", "m3"]
const PART_IDS = ["p1", "p2", "p3"]

// every combination of tombstone membership and store membership, per message
const COMBOS: [string[], string[]][] = []
for (const bits of [0, 1, 2, 3]) {
  const tombstoned = PART_IDS.filter((_, index) => bits & (1 << index))
  for (const storeBits of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const stored = PART_IDS.filter((_, index) => storeBits & (1 << index))
    COMBOS.push([tombstoned, stored])
  }
}

describe("pruneDeadPartTombstones never changes a reconcile outcome", () => {
  test("exhaustive tombstone x store combinations", () => {
    let checked = 0
    for (const [tombstoned, stored] of COMBOS) {
      for (const covered of [[], ["m1"], ["m1", "m2"], ["m1", "m2", "m3"]]) {
        const build = () => makeWorld([["m1", tombstoned]], { m1: stored }, covered)
        const before = outcome(build(), ["m1"])
        const world = build()
        pruneDeadPartTombstones(world.pending, liveOf(world), world.covered)
        const after = outcome(world, ["m1"])
        expect(after).toEqual(before)
        checked++
      }
    }
    expect(checked).toBe(COMBOS.length * 4)
    expect(checked).toBe(128)
  })

  test("all three messages at once", () => {
    const world = makeWorld(
      [
        ["m1", ["p1", "p2"]],
        ["m2", ["p3"]],
        ["m3", ["p1"]],
      ],
      { m1: ["p1"], m2: ["p2"], m3: [] },
      ["m1", "m2", "m3"],
    )
    const before = outcome(world, MESSAGE_IDS)
    pruneDeadPartTombstones(world.pending, liveOf(world), world.covered)
    const after = outcome(world, MESSAGE_IDS)
    expect(after).toEqual(before)
  })
})

describe("pruneDeadPartTombstones reclaims only what is provably dead", () => {
  test("drops tombstoned parts absent from the store", () => {
    const world = makeWorld([["m1", ["gone", "alsoGone"]]], { m1: [] }, ["m1"])
    pruneDeadPartTombstones(world.pending, liveOf(world), world.covered)
    expect(world.pending.has("m1")).toBe(false)
  })

  test("keeps tombstoned parts still present in the store", () => {
    const world = makeWorld([["m1", ["alive", "gone"]]], { m1: ["alive"] }, ["m1"])
    pruneDeadPartTombstones(world.pending, liveOf(world), world.covered)
    expect(world.pending.get("m1")).toEqual(new Set(["alive"]))
  })

  test("leaves messages the complete page did not cover untouched", () => {
    const world = makeWorld([["m1", ["gone"]]], { m1: [] }, [])
    pruneDeadPartTombstones(world.pending, liveOf(world), world.covered)
    expect(world.pending.get("m1")).toEqual(new Set(["gone"]))
  })

  test("a message with no store entry is treated as having no live parts", () => {
    const world = makeWorld([["absent", ["gone"]]], {}, ["absent"])
    pruneDeadPartTombstones(world.pending, liveOf(world), world.covered)
    expect(world.pending.has("absent")).toBe(false)
  })

  test("returns the same map instance so the caller can observe emptiness", () => {
    const world = makeWorld([["m1", ["gone"]]], { m1: [] }, ["m1"])
    expect(pruneDeadPartTombstones(world.pending, liveOf(world), world.covered)).toBe(world.pending)
  })

  test("repeated application is stable", () => {
    const world = makeWorld([["m1", ["alive", "gone"]]], { m1: ["alive"] }, ["m1"])
    pruneDeadPartTombstones(world.pending, liveOf(world), world.covered)
    const first = world.pending.get("m1")
    pruneDeadPartTombstones(world.pending, liveOf(world), world.covered)
    expect(world.pending.get("m1")).toBe(first)
    expect(world.pending.get("m1")).toEqual(new Set(["alive"]))
  })

  test("empty input is a no-op", () => {
    const world = makeWorld([], {}, [])
    pruneDeadPartTombstones(world.pending, liveOf(world), world.covered)
    expect(world.pending.size).toBe(0)
  })
})
