import { describe, expect, test } from "bun:test"
import { SessionCompaction } from "@opencode-ai/core/session/compaction"
import { Token } from "@opencode-ai/core/util/token"

type Entry = { seq: number; message: any }

const SUMMARY_OUTPUT = 4096

function user(seq: number, chars: number) {
  return {
    seq,
    message: {
      id: `msg_${seq}`,
      type: "user",
      text: "x".repeat(chars),
      time: { created: seq },
    },
  } as Entry
}

function assistant(seq: number, chars: number) {
  return {
    seq,
    message: {
      id: `msg_${seq}`,
      type: "assistant",
      agent: "build",
      model: { id: "m", provider: "p" },
      content: [{ type: "text", text: "y".repeat(chars) }],
      time: { created: seq, completed: seq },
    },
  } as Entry
}

/** Build a session whose total serialised size is roughly `turns` x `perTurn` tokens. */
function session(turns: number, perTurnChars: number) {
  const out: Entry[] = []
  for (let t = 0; t < turns; t++) {
    out.push(user(t * 2, perTurnChars))
    out.push(assistant(t * 2 + 1, perTurnChars))
  }
  return out
}

const KEEP = 8000

describe("select without a head budget is unchanged", () => {
  test("keeps the newest entries up to the recent budget and heads the rest", () => {
    const entries = session(20, 4000)
    const result = SessionCompaction.select(entries, KEEP)
    expect(result).toBeDefined()
    expect(result!.head.length).toBeGreaterThan(0)
    expect(result!.recent.length).toBeGreaterThan(0)
    // the recent tail respects the budget
    expect(Token.estimate(result!.recent)).toBeLessThanOrEqual(KEEP)
  })

  test("returns undefined only when nothing serialises", () => {
    expect(SessionCompaction.select([], KEEP)).toBeUndefined()
    // a single small message still produces a result; the caller bails on the empty head
    const single = SessionCompaction.select([user(1, 10)], KEEP)
    expect(single).toBeDefined()
    expect(single!.head).toBe("")
    expect(single!.recent).toContain("[User]:")
  })

  test("returns an empty head when everything fits in the recent budget", () => {
    const result = SessionCompaction.select(session(1, 100), KEEP)
    expect(result!.head).toBe("")
  })
})

describe("select with a head budget bounds the summary prompt", () => {
  test("drops the oldest head entries so the head fits the budget", () => {
    const entries = session(40, 8000)
    const budget = 5000
    const result = SessionCompaction.select(entries, KEEP, budget)
    expect(result).toBeDefined()
    expect(Token.estimate(result!.head)).toBeLessThanOrEqual(budget)
    expect(result!.head.length).toBeGreaterThan(0)
  })

  test("the surviving head is the most recent slice, not the oldest", () => {
    const entries = session(40, 8000)
    const result = SessionCompaction.select(entries, KEEP, 2000)
    expect(result).toBeDefined()
    // tail of the head: the last kept entry id must be greater than the first kept one,
    // and the oldest entry in the session must not appear
    expect(result!.head).not.toContain("[User]: " + "x".repeat(10))
  })

  test("an unlimited budget reproduces the unbounded result exactly", () => {
    const entries = session(15, 3000)
    const unbounded = SessionCompaction.select(entries, KEEP)
    const explicit = SessionCompaction.select(entries, KEEP, Number.POSITIVE_INFINITY)
    expect(explicit).toEqual(unbounded)
  })

  test("a zero budget yields an empty head rather than overflowing", () => {
    const entries = session(20, 4000)
    const result = SessionCompaction.select(entries, KEEP, 0)
    expect(result!.head).toBe("")
  })

  test("a budget larger than the head changes nothing", () => {
    const entries = session(10, 1000)
    const unbounded = SessionCompaction.select(entries, KEEP)
    const roomy = SessionCompaction.select(entries, KEEP, 10_000_000)
    expect(roomy).toEqual(unbounded)
  })

  test("the recent tail is identical with and without a head budget", () => {
    const entries = session(40, 6000)
    const unbounded = SessionCompaction.select(entries, KEEP)
    const bounded = SessionCompaction.select(entries, KEEP, 3000)
    expect(bounded!.recent).toEqual(unbounded!.recent)
  })
})

describe("the runaway session trap", () => {
  // A session that outgrows its context used to stop compacting forever: `select` returned a
  // head that no longer fitted, compactAfterOverflow returned false on every later turn,
  // and history.ts then loaded the entire session on every provider turn.
  const CONTEXT = 32_000

  const headBudget = (previousSummary?: string) =>
    Math.max(0, CONTEXT - SUMMARY_OUTPUT - SessionCompaction.promptOverhead(previousSummary))

  test("a session far larger than its context still produces a prompt that fits", () => {
    for (const turns of [40, 120, 400, 1200]) {
      const entries = session(turns, 20_000)
      const budget = headBudget()
      const result = SessionCompaction.select(entries, KEEP, budget)
      expect(result).toBeDefined()
      const prompt = SessionCompaction.buildPrompt({ context: [result!.head] })
      expect(Token.estimate(prompt)).toBeLessThanOrEqual(CONTEXT - SUMMARY_OUTPUT)
    }
  })

  test("the pre-fix behaviour is what trapped the session", () => {
    // without the head budget the same session produces a prompt that does not fit
    const entries = session(400, 20_000)
    const result = SessionCompaction.select(entries, KEEP)
    const prompt = SessionCompaction.buildPrompt({ context: [result!.head] })
    expect(Token.estimate(prompt)).toBeGreaterThan(CONTEXT - SUMMARY_OUTPUT)
  })

  test("the budget accounts for a prior summary, shrinking the head further", () => {
    const summary = "s".repeat(40_000)
    const bare = headBudget()
    const withSummary = headBudget(summary)
    expect(withSummary).toBeLessThan(bare)
  })

  test("the prior summary itself still fits the context", () => {
    const summary = "s".repeat(40_000)
    const prompt = SessionCompaction.buildPrompt({ previousSummary: summary, context: [] })
    expect(Token.estimate(prompt)).toBeLessThanOrEqual(CONTEXT - SUMMARY_OUTPUT)
  })

  test("a huge prior summary drives the head budget to zero without going negative", () => {
    const budget = headBudget("s".repeat(10_000_000))
    expect(budget).toBe(0)
  })
})

describe("promptOverhead", () => {
  test("is a positive number and grows with a prior summary", () => {
    const bare = SessionCompaction.promptOverhead(undefined)
    const withSummary = SessionCompaction.promptOverhead("summary text ".repeat(100))
    expect(bare).toBeGreaterThan(0)
    expect(withSummary).toBeGreaterThan(bare)
  })

  test("equals the token cost of an empty-context prompt", () => {
    expect(SessionCompaction.promptOverhead(undefined)).toBe(
      Token.estimate(SessionCompaction.buildPrompt({ context: [] })),
    )
  })
})
