import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { readAuthorization } from "./authorization"

export class DispatchRejectedError extends Schema.TaggedErrorClass<DispatchRejectedError>()("MaestroDispatchRejected", {
  reason: Schema.String,
}) {}

export type DispatchReservation = Schema.Schema.Type<typeof MaestroEvent.Dispatch.ReservedV2.data> & { id: string }

export const reserveDispatch = Effect.fn("MaestroDispatch.reserve")(function* (input: {
  sessionID: string
  authorizationID: string
  permission: readonly { permission: string; pattern: string; action: "allow" | "deny" | "ask" }[]
}) {
  const authorization = yield* readAuthorization(input.authorizationID)
  if (!authorization) return yield* new DispatchRejectedError({ reason: "authorization-not-found" })
  if (authorization.sessionID !== input.sessionID) return yield* new DispatchRejectedError({ reason: "session-mismatch" })
  const suffix = createHash("sha256").update(input.authorizationID, "utf8").digest("hex")
  const id = EventV2.ID.make(`evt_maestro_dispatch_${suffix}`)
  const { db } = yield* Database.Service
  const existing = yield* db
    .select({ id: EventTable.id, type: EventTable.type, data: EventTable.data })
    .from(EventTable)
    .where(eq(EventTable.id, id))
    .get()
    .pipe(Effect.orDie)
  const wanted = {
    sessionID: authorization.sessionID,
    authorizationID: input.authorizationID,
    childSessionID: `ses_maestro_dispatch_${suffix}`,
    projectID: authorization.projectID,
    routedMemberID: authorization.routedMemberID,
    taskIntentHash: authorization.taskIntentHash,
    permission: [...input.permission],
  }
  if (existing) {
    if (existing.type !== EventV2.versionedType(MaestroEvent.Dispatch.ReservedV2.type, 2)) {
      return yield* new DispatchRejectedError({ reason: "reservation-missing-permission-snapshot" })
    }
    const recorded = { id: existing.id, ...Schema.decodeUnknownSync(MaestroEvent.Dispatch.ReservedV2.data)(existing.data) }
    if (isDeepStrictEqual(recorded, { id, ...wanted })) return recorded
    return yield* new DispatchRejectedError({ reason: "reservation-binding-mismatch" })
  }
  const events = yield* EventV2Bridge.Service
  return yield* events.publish(MaestroEvent.Dispatch.ReservedV2, wanted, { id }).pipe(
    Effect.map((event) => ({ id: event.id, ...event.data })),
  )
})

export * as Dispatch from "./dispatch"
