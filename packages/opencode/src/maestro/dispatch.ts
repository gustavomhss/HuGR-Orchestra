import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { and, eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { EventV2Bridge } from "@/event-v2-bridge"
import { readAuthorization } from "./authorization"

export class DispatchRejectedError extends Schema.TaggedErrorClass<DispatchRejectedError>()("MaestroDispatchRejected", {
  reason: Schema.String,
}) {}

export type DispatchReservation = Schema.Schema.Type<typeof MaestroEvent.Dispatch.Reserved.data> & { id: string }

export const reserveDispatch = Effect.fn("MaestroDispatch.reserve")(function* (input: {
  sessionID: string
  authorizationID: string
}) {
  const authorization = yield* readAuthorization(input.authorizationID)
  if (!authorization) return yield* new DispatchRejectedError({ reason: "authorization-not-found" })
  if (authorization.sessionID !== input.sessionID) return yield* new DispatchRejectedError({ reason: "session-mismatch" })
  const { db } = yield* Database.Service
  const existing = yield* db
    .select({ id: EventTable.id, data: EventTable.data })
    .from(EventTable)
    .where(
      and(
        eq(EventTable.aggregate_id, input.sessionID),
        eq(EventTable.type, EventV2.versionedType(MaestroEvent.Dispatch.Reserved.type, 1)),
      ),
    )
    .get()
    .pipe(Effect.orDie)
  if (existing) return { id: existing.id, ...Schema.decodeUnknownSync(MaestroEvent.Dispatch.Reserved.data)(existing.data) }
  const suffix = createHash("sha256").update(input.authorizationID, "utf8").digest("hex")
  const id = EventV2.ID.make(`evt_maestro_dispatch_${suffix}`)
  const wanted = {
    sessionID: authorization.sessionID,
    authorizationID: input.authorizationID,
    childSessionID: `ses_maestro_dispatch_${suffix}`,
    projectID: authorization.projectID,
    routedMemberID: authorization.routedMemberID,
    taskIntentHash: authorization.taskIntentHash,
  }
  const events = yield* EventV2Bridge.Service
  return yield* events.publish(MaestroEvent.Dispatch.Reserved, wanted, { id }).pipe(
    Effect.map((event) => ({ id: event.id, ...event.data })),
  )
})

export * as Dispatch from "./dispatch"
