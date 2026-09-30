export function isDefaultTitle(title: string) {
  return /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(title)
}

type Role = "user" | "assistant"

export type StartedAt = { readonly role: Role; readonly id: string; readonly time?: { created: number } }

/**
 * Index of user message creation times by id, first entry wins for a repeated id.
 * This is the O(1) replacement for the per-assistant-message
 * `messages().find((x) => x.role === "user" && x.id === parentID)` scan, which made
 * rendering a long transcript quadratic. The result is byte-equivalent to that scan.
 */
export function userStartedAtByID(messages: readonly StartedAt[]) {
  const result = new Map<string, number | undefined>()
  for (const message of messages) {
    if (message.role !== "user" || result.has(message.id)) continue
    result.set(message.id, message.time?.created)
  }
  return result
}

/** A turn is final once the provider reported a finish that is neither ongoing nor unknown. */
export function isFinalTurn(finish: string | undefined) {
  if (!finish) return false
  return !["tool-calls", "unknown"].includes(finish)
}

/**
 * Duration of an assistant turn, matching the previous inline implementation:
 * zero unless the message is final, completed, and has a resolvable parent start.
 */
export function assistantDuration(input: {
  readonly startedAt: number | undefined
  readonly completed: number | undefined
  readonly final: boolean
}) {
  if (!input.final) return 0
  if (!input.completed) return 0
  if (input.startedAt === undefined) return 0
  return input.completed - input.startedAt
}
