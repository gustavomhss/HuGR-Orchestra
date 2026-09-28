import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { asc, eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { EventV2Bridge } from "@/event-v2-bridge"
import { MessageV2 } from "@/session/message-v2"
import { SessionID } from "@/session/schema"
import { readValidation, type ReviewReceipt } from "./validation-record"

export class AuthorizationRejectedError extends Schema.TaggedErrorClass<AuthorizationRejectedError>()(
  "MaestroAuthorizationRejected",
  { reason: Schema.String },
) {}

export type AuthorizationInput = {
  sessionID: string
  validationRecordID: string
  approvalMessageID: string
}

export type AuthorizationReceipt = Schema.Schema.Type<typeof MaestroEvent.Authorization.Granted.data> & { id: string }

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function messageText(message: SessionV1.WithParts) {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("").trim().toLowerCase()
}

function eventID(input: AuthorizationInput) {
  return EventV2.ID.make(`evt_maestro_authorization_${hash(`${input.sessionID}\0${input.validationRecordID}\0${input.approvalMessageID}`)}`)
}

export const readAuthorization = Effect.fn("MaestroAuthorization.read")(function* (id: string) {
  const { db } = yield* Database.Service
  const row = yield* db
    .select()
    .from(EventTable)
    .where(eq(EventTable.id, EventV2.ID.make(id)))
    .get()
    .pipe(Effect.orDie)
  if (!row || row.type !== EventV2.versionedType(MaestroEvent.Authorization.Granted.type, 1)) return undefined
  return { id: row.id, ...Schema.decodeUnknownSync(MaestroEvent.Authorization.Granted.data)(row.data) }
})

export const grantAuthorization = Effect.fn("MaestroAuthorization.grant")(function* (input: AuthorizationInput) {
  const validation = yield* readValidation(input.validationRecordID)
  if (!validation) return yield* new AuthorizationRejectedError({ reason: "validation-not-found" })
  if (validation.sessionID !== input.sessionID) return yield* new AuthorizationRejectedError({ reason: "session-mismatch" })
  if (validation.outcome !== "VALID") return yield* new AuthorizationRejectedError({ reason: "validation-not-valid" })
  const review = yield* findReview(input.sessionID, input.validationRecordID, validation.workCardHash)
  if (!review || review.verdict !== "APPROVE") return yield* new AuthorizationRejectedError({ reason: "review-not-approved" })
  const messages = yield* MessageV2.stream(SessionID.make(input.sessionID))
  const message = messages.find((candidate) => candidate.info.id === input.approvalMessageID)
  if (!message || message.info.role !== "user") return yield* new AuthorizationRejectedError({ reason: "reply-not-direct-user" })
  if (message.parts.some((part) => "synthetic" in part && part.synthetic === true)) {
    return yield* new AuthorizationRejectedError({ reason: "reply-synthetic" })
  }
  if (messageText(message) !== "approve" && messageText(message) !== "aprovo") {
    return yield* new AuthorizationRejectedError({ reason: "reply-not-approval" })
  }
  const wanted = {
    sessionID: input.sessionID,
    projectID: validation.projectID,
    approvalMessageID: input.approvalMessageID,
    validationRecordID: input.validationRecordID,
    workCardHash: validation.workCardHash,
    routedMemberID: validation.routedMemberID,
    rosterHash: validation.rosterHash,
    grantHash: validation.grantHash,
    reviewPolicyHash: validation.reviewPolicyHash,
    actor: validation.actor,
    reviewerID: "lucy" as const,
    taskIntentHash: hash(`${validation.workCardHash}\0${validation.routedMemberID}`),
    methodVersion: "authorization-v1",
  }
  const id = eventID(input)
  const existing = yield* readAuthorization(id)
  if (existing) return existing
  const events = yield* EventV2Bridge.Service
  return yield* events.publish(MaestroEvent.Authorization.Granted, wanted, { id }).pipe(
    Effect.map((event) => ({ id: event.id, ...event.data })),
  )
})

function findReview(sessionID: string, validationRecordID: string, workCardHash: string) {
  return Effect.gen(function* () {
    const { db } = yield* Database.Service
    const rows = yield* db
      .select({ id: EventTable.id, type: EventTable.type, data: EventTable.data })
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, sessionID))
      .orderBy(asc(EventTable.seq))
      .all()
      .pipe(Effect.orDie)
    for (const row of rows.reverse()) {
      if (row.type === EventV2.versionedType(MaestroEvent.Review.Received.type, 1) && row.data) {
        const review = Schema.decodeUnknownSync(MaestroEvent.Review.Received.data)(row.data) as ReviewReceipt
        if (review.validationRecordID === validationRecordID && review.workCardHash === workCardHash) return review
      }
    }
    return undefined
  })
}

export * as Authorization from "./authorization"
