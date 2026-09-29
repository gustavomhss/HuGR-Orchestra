import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { readPlanRevision } from "./plan-revision"

type ContextData = Schema.Schema.Type<typeof MaestroEvent.Context.Recorded.data>

export class ContextConflictError extends Schema.TaggedErrorClass<ContextConflictError>()("MaestroContextConflict", {
  sessionID: Schema.String,
  planRevisionID: Schema.String,
}) {}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function hash(value: unknown) {
  return createHash("sha256").update(stable(value), "utf8").digest("hex")
}

function id(sessionID: string, planRevisionID: string) {
  return EventV2.ID.make(`evt_maestro_context_${hash({ sessionID, planRevisionID })}`)
}

export const readContext = Effect.fn("MaestroContext.read")(function* (contextID: string) {
  if (!contextID.startsWith("evt_")) return undefined
  const { db } = yield* Database.Service
  const row = yield* db
    .select()
    .from(EventTable)
    .where(eq(EventTable.id, EventV2.ID.make(contextID)))
    .get()
    .pipe(Effect.orDie)
  if (!row || row.type !== EventV2.versionedType(MaestroEvent.Context.Recorded.type, 1)) return undefined
  return Schema.decodeUnknownSync(MaestroEvent.Context.Recorded.data)(row.data)
})

export const recordContext = Effect.fn("MaestroContext.record")(function* (planRevisionID: string, sessionID: string) {
  const plan = yield* readPlanRevision(planRevisionID)
  if (!plan || plan.sessionID !== sessionID) return yield* new ContextConflictError({ sessionID, planRevisionID })
  const sessions = yield* Session.Service
  const session = yield* sessions.get(SessionID.make(sessionID))
  const git = yield* Git.Service
  const head = yield* git.run(["rev-parse", "HEAD"], { cwd: session.directory })
  if (head.exitCode !== 0) return yield* new ContextConflictError({ sessionID, planRevisionID })
  const headSHA = head.text().trim()
  const branch = (yield* git.branch(session.directory)) ?? "DETACHED"
  const changedPaths = (yield* git.status(session.directory)).map((item) => item.file).sort()
  const evidence = { directory: session.directory, branch, headSHA, changedPaths }
  const next: ContextData = {
    id: id(sessionID, planRevisionID),
    sessionID,
    planRevisionID,
    projectID: session.projectID,
    directory: session.directory,
    mode: "UNGROUNDED",
    branch,
    headSHA,
    changedPaths,
    currentEvidenceIdentityHash: hash(evidence),
    contextHash: hash({ planRevisionID, evidence }),
    status: "CURRENT",
    createdAt: Date.now(),
  }
  const existing = yield* readContext(next.id)
  if (existing) {
    if (isDeepStrictEqual(existing, next)) return existing
    return yield* new ContextConflictError({ sessionID, planRevisionID })
  }
  const events = yield* EventV2Bridge.Service
  return (yield* events.publish(MaestroEvent.Context.Recorded, next, { id: EventV2.ID.make(next.id) })).data
})
