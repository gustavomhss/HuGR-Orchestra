import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"
import {
  normalizeSessionMessages,
  normalizeTouchedSessionMessages,
} from "./session-message"

const SID = "ses_diff"

const user = (id: string, text = "do the thing"): SessionMessageInfo =>
  ({ id, type: "user", text, time: { created: 1 } }) as unknown as SessionMessageInfo

const assistant = (id: string, opts: Partial<Record<string, unknown>> = {}): SessionMessageInfo =>
  ({
    id,
    type: "assistant",
    agent: "build",
    model: { id: "m1", provider: "p1" },
    content: [{ type: "text", text: "answer" }],
    time: { created: 2, completed: 3 },
    ...opts,
  }) as unknown as SessionMessageInfo

const shell = (id: string): SessionMessageInfo =>
  ({ id, type: "shell", command: "ls", time: { created: 4 }, output: { output: "a\nb" } }) as unknown as SessionMessageInfo

const synthetic = (id: string, description: string): SessionMessageInfo =>
  ({ id, type: "synthetic", description, time: { created: 5 } }) as unknown as SessionMessageInfo

const agentSwitched = (id: string, agent: string): SessionMessageInfo =>
  ({ id, type: "agent-switched", agent, time: { created: 6 } }) as unknown as SessionMessageInfo

const modelSwitched = (id: string): SessionMessageInfo =>
  ({ id, type: "model-switched", model: { id: "m2", provider: "p2" }, time: { created: 7 } }) as unknown as SessionMessageInfo

const compaction = (id: string): SessionMessageInfo =>
  ({ id, type: "compaction", reason: "auto", summary: "s", time: { created: 8 } }) as unknown as SessionMessageInfo

const toolAssistant = (id: string, partID: string): SessionMessageInfo =>
  assistant(id, {
    content: [
      { type: "text", text: "thinking" },
      {
        type: "tool",
        id: partID,
        name: "read",
        state: {
          status: "completed",
          input: { filePath: "/repo/a.ts" },
          output: "out",
          content: [],
          title: "read",
          metadata: {},
        },
        time: { created: 2, ran: 2, completed: 3 },
      },
    ],
  })

const cases: [string, SessionMessageInfo[]][] = [
  ["single user", [user("u1")]],
  ["user + assistant", [user("u1"), assistant("a1")]],
  ["multi-step same parent", [user("u1"), assistant("a1"), assistant("a2"), assistant("a3")]],
  [
    "multi turn",
    Array.from({ length: 6 }, (_, i) => [user(`u${i}`), assistant(`a${i}`)]).flat() as SessionMessageInfo[],
  ],
  ["agent switch then user", [agentSwitched("s1", "plan"), user("u1")]],
  ["model switch then user", [modelSwitched("m1"), user("u1")]],
  ["agent switch mid-turn", [user("u1"), agentSwitched("s1", "plan"), assistant("a1")]],
  ["synthetic with description", [synthetic("sy1", "context here"), assistant("a1")]],
  ["synthetic without description", [synthetic("sy1", "   "), assistant("a1")]],
  ["shell", [shell("sh1")]],
  ["shell then user", [shell("sh1"), user("u1"), assistant("a1")]],
  ["user then shell", [user("u1"), shell("sh1")]],
  ["compaction", [user("u1"), assistant("a1"), compaction("c1")]],
  ["compaction no parent", [compaction("c1")]],
  ["assistant with no parent", [assistant("a1")]],
  ["assistant after shell clears parent", [shell("sh1"), assistant("a1")]],
  ["tool assistant", [user("u1"), toolAssistant("a1", "call1")]],
  [
    "mixed kitchen sink",
    [
      agentSwitched("s1", "plan"),
      user("u1"),
      assistant("a1"),
      toolAssistant("a2", "call2"),
      modelSwitched("m2"),
      synthetic("sy1", "extra"),
      assistant("a3"),
      shell("sh1"),
      user("u2"),
      compaction("c1"),
      assistant("a4"),
    ],
  ],
  [
    "many turns",
    Array.from({ length: 40 }, (_, i) => [user(`u${i}`), toolAssistant(`a${i}`, `call${i}`)]).flat() as SessionMessageInfo[],
  ],
]

function ids(values: readonly { id: string }[]) {
  return values.map((value) => value.id)
}

describe("normalizeTouchedSessionMessages matches the full rebuild", () => {
  for (const [name, source] of cases) {
    test(name, () => {
      const full = normalizeSessionMessages(SID, source)
      const all = new Set(source.map((message) => message.id))
      // every id the full rebuild emits must be reproducible when all are touched
      const every = normalizeTouchedSessionMessages(SID, source, all)
      expect(ids(every.messages)).toEqual(ids(full.messages))
      expect(every.messages).toEqual(full.messages)
      expect([...every.parts.entries()].map(([id]) => id).sort()).toEqual([...full.parts.entries()].map(([id]) => id).sort())
      expect(every.parts).toEqual(full.parts)
    })
  }
})

describe("touched subsets are identical to the corresponding slice of the full rebuild", () => {
  for (const [name, source] of cases) {
    test(name, () => {
      const full = normalizeSessionMessages(SID, source)
      const fullByID = new Map(full.messages.map((message) => [message.id, message]))
      for (const message of source) {
        const touched = new Set([message.id])
        const partial = normalizeTouchedSessionMessages(SID, source, touched)
        // a shell entry legitimately emits two ids; anything else emits one or none
        const expectedIDs =
          message.type === "shell" ? [message.id, `${message.id}:assistant`] : [message.id]
        const expected = expectedIDs.map((id) => fullByID.get(id)).filter((value) => value !== undefined)
        if (expected.length === 0) {
          expect(partial.messages).toEqual([])
          continue
        }
        expect(partial.messages).toHaveLength(expected.length)
        expect(partial.messages).toEqual(expected)
        for (const id of expectedIDs) if (full.parts.has(id)) expect(partial.parts.get(id)).toEqual(full.parts.get(id))
      }
    })
  }
})

describe("touching an assistant also reproduces its parent user override", () => {
  test("parent agent and model come from the assistant, matching the full rebuild", () => {
    const source = [user("u1"), agentSwitched("s1", "review"), assistant("a1")]
    const full = normalizeSessionMessages(SID, source)
    const fullUser = full.messages.find((message) => message.id === "u1")!
    const touched = new Set(["u1", "a1"])
    const partial = normalizeTouchedSessionMessages(SID, source, touched)
    const partialUser = partial.messages.find((message) => message.id === "u1")!
    expect(partialUser).toEqual(fullUser)
    expect(partialUser.agent).toBe(fullUser.agent)
  })

  test("touching only the parent still reproduces the assistant override", () => {
    const source = [user("u1"), agentSwitched("s1", "review"), assistant("a1")]
    const full = normalizeSessionMessages(SID, source)
    const fullUser = full.messages.find((message) => message.id === "u1")!
    const partial = normalizeTouchedSessionMessages(SID, source, new Set(["u1"]))
    expect(partial.messages[0]).toEqual(fullUser)
  })
})

describe("empty and degenerate input", () => {
  test("empty source", () => {
    const result = normalizeTouchedSessionMessages(SID, [], new Set(["nope"]))
    expect(result.messages).toEqual([])
    expect(result.parts.size).toBe(0)
  })

  test("empty touched set returns nothing and allocates no work", () => {
    const result = normalizeTouchedSessionMessages(SID, cases[18]![1], new Set())
    expect(result.messages).toEqual([])
    expect(result.parts.size).toBe(0)
  })

  test("touched id absent from source", () => {
    const result = normalizeTouchedSessionMessages(SID, [user("u1")], new Set(["ghost"]))
    expect(result.messages).toEqual([])
  })
})
