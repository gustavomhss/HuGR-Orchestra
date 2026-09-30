import { describe, expect, test } from "bun:test"
import type { AssistantMessage, UserMessage } from "@opencode-ai/sdk/v2"
import { assistantDuration, isFinalTurn, userStartedAtByID } from "../../src/util/session"

// The two functions below are verbatim copies of the implementation this change
// replaced, captured before the edit. Every test compares the new helpers against
// them, so the test fails if the optimisation ever diverges from the original.

type Stored = UserMessage | AssistantMessage

function originalFinal(message: AssistantMessage) {
  return message.finish && !["tool-calls", "unknown"].includes(message.finish)
}

function originalDuration(message: AssistantMessage, messages: Stored[]) {
  if (!originalFinal(message)) return 0
  if (!message.time.completed) return 0
  const user = messages.find((x) => x.role === "user" && x.id === message.parentID)
  if (!user || !user.time) return 0
  return message.time.completed - user.time.created
}

const user = (id: string, created = 1000, extra: Partial<UserMessage> = {}): UserMessage =>
  ({
    id,
    sessionID: "ses_1",
    role: "user",
    time: { created },
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
    ...extra,
  }) as UserMessage

const assistant = (
  id: string,
  parentID: string,
  opts: { created?: number; completed?: number; finish?: string } = {},
): AssistantMessage =>
  ({
    id,
    sessionID: "ses_1",
    role: "assistant",
    parentID,
    agent: "build",
    mode: "build",
    modelID: "claude-sonnet-4-20250514",
    providerID: "anthropic",
    path: { cwd: "", root: "" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: opts.created ?? 1000, completed: opts.completed },
    finish: opts.finish,
  }) as AssistantMessage

const FINISHES = [undefined, "stop", "tool-calls", "unknown", "length", "error"] as const

const shapes: [string, Stored[]][] = [
  ["empty", []],
  ["user only", [user("u1")]],
  ["single turn", [user("u1", 1000), assistant("a1", "u1", { completed: 9000, finish: "stop" })]],
  [
    "many turns",
    Array.from({ length: 30 }, (_, i) => [user(`u${i}`, i * 1000), assistant(`a${i}`, `u${i}`, { completed: i * 1000 + 500, finish: "stop" })]).flat() as Stored[],
  ],
  [
    "multi-step same parent",
    [user("u1", 1000), assistant("a1", "u1", { completed: 2000, finish: "tool-calls" }), assistant("a2", "u1", { completed: 3000, finish: "stop" })],
  ],
  ["assistant with unknown parent", [user("u1"), assistant("a1", "ghost", { completed: 5000, finish: "stop" })]],
  ["assistant with no completed time", [user("u1"), assistant("a1", "u1", { finish: "stop" })]],
  ["user after assistant", [assistant("a0", "u0", { completed: 10, finish: "stop" }), user("u1", 2000)]],
  ["duplicate user ids", [user("u1", 100), assistant("a1", "u1", { completed: 900, finish: "stop" }), user("u1", 700)]],
  [
    "interleaved turns and orphans",
    [
      assistant("a0", "gone", { completed: 10, finish: "stop" }),
      user("u1", 1000),
      assistant("a1", "u1", { completed: 1500, finish: "tool-calls" }),
      user("u2", 2000),
      assistant("a2", "u1", { completed: 2500, finish: "stop" }),
    ],
  ],
]

describe("userStartedAtByID is equivalent to the original per-message find", () => {
  for (const [name, messages] of shapes) {
    test(name, () => {
      const index = userStartedAtByID(messages)
      for (const message of messages) {
        if (message.role !== "assistant") continue
        const expected = messages.find((x) => x.role === "user" && x.id === message.parentID)
        const expectedStarted = expected && expected.time ? expected.time.created : undefined
        expect(index.get(message.parentID)).toEqual(expectedStarted)
      }
    })
  }
})

describe("assistantDuration is equivalent to the original inline duration", () => {
  for (const [name, messages] of shapes) {
    for (const finish of FINISHES) {
      test(`${name} / finish=${String(finish)}`, () => {
        const index = userStartedAtByID(messages)
        for (const message of messages) {
          if (message.role !== "assistant") continue
          const candidate = { ...message, finish } as AssistantMessage
          const expected = originalDuration(candidate, messages)
          const actual = assistantDuration({
            startedAt: index.get(message.parentID),
            completed: candidate.time.completed,
            final: isFinalTurn(finish),
          })
          expect(actual).toEqual(expected)
        }
      })
    }
  }
})

describe("edge cases", () => {
  test("isFinalTurn rejects the ongoing and unknown finishes", () => {
    expect(isFinalTurn(undefined)).toBe(false)
    expect(isFinalTurn("tool-calls")).toBe(false)
    expect(isFinalTurn("unknown")).toBe(false)
    expect(isFinalTurn("stop")).toBe(true)
    expect(isFinalTurn("length")).toBe(true)
  })

  test("missing parent resolves to zero, not NaN", () => {
    expect(assistantDuration({ startedAt: undefined, completed: 500, final: true })).toBe(0)
  })

  test("zero duration when start equals completion", () => {
    expect(assistantDuration({ startedAt: 500, completed: 500, final: true })).toBe(0)
  })

  test("user id present but created is zero is honoured", () => {
    const index = userStartedAtByID([user("u1", 0)])
    expect(index.get("u1")).toBe(0)
    expect(assistantDuration({ startedAt: index.get("u1"), completed: 900, final: true })).toBe(900)
  })

  test("a user with a missing time is not treated as started", () => {
    const index = userStartedAtByID([{ role: "user", id: "u1" } as unknown as UserMessage])
    expect(index.get("u1")).toBeUndefined()
  })
})
