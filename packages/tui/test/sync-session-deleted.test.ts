import { describe, expect, test } from "bun:test"
import { releaseDeletedSession } from "../src/context/sync"

// session.deleted previously spliced the session out of `session` and stopped, leaving the
// message, part, todo, session_diff, session_status, permission and question entries for that
// session resident for the process lifetime. These tests call the real production helper.
//
// They deliberately exercise a plain object rather than a createStore proxy: the TUI test
// script does not pass --conditions=solid, and the server build of solid's store treats delete
// as a no-op, which would make these assertions vacuous.

type Store = {
  message: Record<string, { id: string }[]>
  part: Record<string, unknown>
  todo: Record<string, unknown>
  session_diff: Record<string, unknown>
  session_status: Record<string, unknown>
  permission: Record<string, unknown>
  question: Record<string, unknown>
}

function fixture(): Store {
  return {
    message: { ses_a: [{ id: "m1" }, { id: "m2" }], ses_b: [{ id: "m3" }] },
    part: { m1: [{ id: "p1" }], m2: [{ id: "p2" }], m3: [{ id: "p3" }] },
    todo: { ses_a: [1], ses_b: [2] },
    session_diff: { ses_a: [1], ses_b: [2] },
    session_status: { ses_a: "idle", ses_b: "busy" },
    permission: { ses_a: [1], ses_b: [2] },
    question: { ses_a: [1], ses_b: [2] },
  }
}

const PER_SESSION = ["message", "todo", "session_diff", "session_status", "permission", "question"] as const

describe("releaseDeletedSession", () => {
  test("the deleted session loses every per-session key and its parts", () => {
    const store = fixture()
    releaseDeletedSession(store, "ses_a")
    for (const key of PER_SESSION) expect(Object.keys(store[key])).not.toContain("ses_a")
    expect(store.part.m1).toBeUndefined()
    expect(store.part.m2).toBeUndefined()
  })

  test("a surviving session keeps everything, including its parts", () => {
    const store = fixture()
    releaseDeletedSession(store, "ses_a")
    expect(store.message.ses_b).toEqual([{ id: "m3" }])
    expect(store.part.m3).toEqual([{ id: "p3" }])
    expect(store.todo.ses_b).toEqual([2])
    expect(store.session_diff.ses_b).toEqual([2])
    expect(store.session_status.ses_b).toBe("busy")
    expect(store.permission.ses_b).toEqual([2])
    expect(store.question.ses_b).toEqual([2])
  })

  test("deleting one session does not touch another session's parts", () => {
    const store = fixture()
    releaseDeletedSession(store, "ses_b")
    expect(store.part.m3).toBeUndefined()
    expect(store.part.m1).toEqual([{ id: "p1" }])
    expect(store.part.m2).toEqual([{ id: "p2" }])
  })

  test("a session that was never synced changes nothing", () => {
    const store = fixture()
    releaseDeletedSession(store, "ses_missing")
    expect(store.message.ses_a).toEqual([{ id: "m1" }, { id: "m2" }])
    expect(store.part.m1).toEqual([{ id: "p1" }])
    expect(store.todo.ses_a).toEqual([1])
  })

  test("a session with an empty message list still releases its keys", () => {
    const store = fixture()
    store.message.ses_a = []
    store.part.m1 = undefined as never
    delete store.part.m1
    delete store.part.m2
    releaseDeletedSession(store, "ses_a")
    for (const key of PER_SESSION) expect(Object.keys(store[key])).not.toContain("ses_a")
  })

  test("repeated application is stable", () => {
    const store = fixture()
    releaseDeletedSession(store, "ses_a")
    const parts = Object.keys(store.part).sort()
    releaseDeletedSession(store, "ses_a")
    expect(Object.keys(store.part).sort()).toEqual(parts)
  })

  test("releasing every session empties the per-session maps", () => {
    const store = fixture()
    releaseDeletedSession(store, "ses_a")
    releaseDeletedSession(store, "ses_b")
    for (const key of PER_SESSION) expect(Object.keys(store[key])).toHaveLength(0)
    expect(Object.keys(store.part)).toHaveLength(0)
  })
})
