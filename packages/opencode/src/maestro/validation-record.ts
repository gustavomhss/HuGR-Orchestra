import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"

type ValidationData = Schema.Schema.Type<typeof MaestroEvent.Validation.Recorded.data>
type ReviewData = Schema.Schema.Type<typeof MaestroEvent.Review.Received.data>

export type ValidationCheck = { id: string; status: "PASS" | "FAIL" | "HOLD"; detail: string }
export type ReviewFinding = { path: string; line: number; message: string }

export type RecordValidationInput = {
  sessionID: string
  projectID: string
  workCardID: string
  workCard: string
  routedMemberID: string
  validatorID: string
  validatorVersion: string
  checks: readonly ValidationCheck[]
  outcome: "VALID" | "INVALID" | "HOLD"
}

export type RecordReviewInput = {
  sessionID: string
  validationRecordID: string
  workCard: string
  reviewerID: string
  verdict: "APPROVE" | "FIX_FIRST" | "REJECT"
  findings: readonly ReviewFinding[]
}

export class ValidationRejectedError extends Schema.TaggedErrorClass<ValidationRejectedError>()("MaestroValidationRejected", {
  reason: Schema.String,
}) {}

export class ValidationConflictError extends Schema.TaggedErrorClass<ValidationConflictError>()("MaestroValidationConflict", {
  sessionID: Schema.String,
  recordID: Schema.String,
}) {}

export class ReviewConflictError extends Schema.TaggedErrorClass<ReviewConflictError>()("MaestroReviewConflict", {
  sessionID: Schema.String,
  reviewID: Schema.String,
}) {}

const roster = ["general", "lucy", "maestro"] as const
const routedMembers = ["general"] as const
const reviewPolicy = "maestro-review-policy-v1:lucy"

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function canonical(value: unknown) {
  return JSON.stringify(value)
}

const rosterHash = hash(canonical(roster))
const grantHash = hash(canonical({ grantor: "maestro", routedMembers }))
const reviewPolicyHash = hash(reviewPolicy)

function validationEventID(input: Pick<ValidationData, "sessionID" | "projectID" | "workCardID" | "workCardHash" | "routedMemberID" | "rosterHash" | "grantHash" | "reviewPolicyHash" | "validatorID" | "validatorVersion">) {
  return EventV2.ID.make(
    `evt_maestro_validation_${hash(
      canonical({
        sessionID: input.sessionID,
        projectID: input.projectID,
        workCardID: input.workCardID,
        workCardHash: input.workCardHash,
        routedMemberID: input.routedMemberID,
        rosterHash: input.rosterHash,
        grantHash: input.grantHash,
        reviewPolicyHash: input.reviewPolicyHash,
        validatorID: input.validatorID,
        validatorVersion: input.validatorVersion,
      }),
    )}`,
  )
}

function reviewEventID(input: Pick<ReviewData, "sessionID" | "validationRecordID" | "workCardHash" | "reviewerID">) {
  return EventV2.ID.make(
    `evt_maestro_review_${hash(
      canonical({
        sessionID: input.sessionID,
        validationRecordID: input.validationRecordID,
        workCardHash: input.workCardHash,
        reviewerID: input.reviewerID,
      }),
    )}`,
  )
}

/** Synchronous boundary parser. Authority hashes never come from caller input. */
function parseValidation(input: RecordValidationInput): ValidationData | ValidationRejectedError {
  if (input.validatorID !== "maestro") return new ValidationRejectedError({ reason: "validator-not-maestro" })
  if (!roster.includes(input.routedMemberID as (typeof roster)[number])) {
    return new ValidationRejectedError({ reason: "member-unknown" })
  }
  if (input.routedMemberID === "maestro") return new ValidationRejectedError({ reason: "member-maestro" })
  if (!routedMembers.includes(input.routedMemberID as (typeof routedMembers)[number])) {
    return new ValidationRejectedError({ reason: "member-not-routed" })
  }
  if (input.checks.length === 0) return new ValidationRejectedError({ reason: "checks-empty" })
  if (input.checks.some((check) => check.id.length === 0 || check.detail.length === 0)) {
    return new ValidationRejectedError({ reason: "check-malformed" })
  }
  if (input.checks.some((check, index) => index > 0 && input.checks[index - 1]!.id >= check.id)) {
    return new ValidationRejectedError({ reason: "checks-not-deterministic" })
  }
  try {
    return Schema.decodeUnknownSync(MaestroEvent.Validation.Recorded.data)({
      ...input,
      checks: [...input.checks],
      workCardHash: hash(input.workCard),
      rosterHash,
      grantHash,
      reviewPolicyHash,
    })
  } catch {
    return new ValidationRejectedError({ reason: "validation-malformed" })
  }
}

/** Synchronous boundary parser. Review findings must match verdict shape. */
function parseReview(input: RecordReviewInput, record: ValidationData): ReviewData | ValidationRejectedError {
  if (record.routedMemberID === input.reviewerID) return new ValidationRejectedError({ reason: "reviewer-self" })
  if (input.reviewerID !== "lucy") return new ValidationRejectedError({ reason: "reviewer-not-lucy" })
  if (record.workCardHash !== hash(input.workCard)) return new ValidationRejectedError({ reason: "work-card-mismatch" })
  if (input.verdict === "APPROVE" && input.findings.length !== 0) {
    return new ValidationRejectedError({ reason: "approve-has-findings" })
  }
  if (input.verdict !== "APPROVE" && input.findings.length === 0) {
    return new ValidationRejectedError({ reason: "review-findings-required" })
  }
  try {
    return Schema.decodeUnknownSync(MaestroEvent.Review.Received.data)({
      ...input,
      workCardHash: record.workCardHash,
      findings: [...input.findings],
    })
  } catch {
    return new ValidationRejectedError({ reason: "review-malformed" })
  }
}

export const readValidation = Effect.fn("MaestroValidation.read")(function* (input: { sessionID: string; recordID: string }) {
  const { db } = yield* Database.Service
  const row = yield* db.select().from(EventTable).where(eq(EventTable.id, EventV2.ID.make(input.recordID))).get().pipe(Effect.orDie)
  if (!row || row.type !== EventV2.versionedType(MaestroEvent.Validation.Recorded.type, 1)) return undefined
  const record = Schema.decodeUnknownSync(MaestroEvent.Validation.Recorded.data)(row.data)
  if (record.sessionID !== input.sessionID) return undefined
  return { id: row.id, ...record }
})

export const verifyValidation = Effect.fn("MaestroValidation.verify")(function* (input: {
  sessionID: string
  recordID: string
  workCard: string
}) {
  const record = yield* readValidation(input)
  if (!record) return { status: "HOLD", reason: "validation-missing" } as const
  if (record.workCardHash !== hash(input.workCard)) return { status: "HOLD", reason: "work-card-mismatch" } as const
  return { status: record.outcome, record } as const
})

export const recordValidation = Effect.fn("MaestroValidation.record")(function* (input: RecordValidationInput) {
  const wanted = parseValidation(input)
  if (wanted instanceof ValidationRejectedError) return yield* wanted
  const id = validationEventID(wanted)
  const existing = yield* readValidation({ sessionID: wanted.sessionID, recordID: id })
  if (existing) {
    if (isDeepStrictEqual({ ...existing, id: "" }, { ...wanted, id: "" })) return existing
    return yield* new ValidationConflictError({ sessionID: wanted.sessionID, recordID: id })
  }
  const events = yield* EventV2Bridge.Service
  const recorded = yield* events.publish(MaestroEvent.Validation.Recorded, wanted, { id })
  return { id: recorded.id, ...recorded.data }
})

export const recordReview = Effect.fn("MaestroReview.record")(function* (input: RecordReviewInput) {
  const validation = yield* readValidation({ sessionID: input.sessionID, recordID: input.validationRecordID })
  if (!validation) return yield* new ValidationRejectedError({ reason: "validation-missing" })
  const wanted = parseReview(input, validation)
  if (wanted instanceof ValidationRejectedError) return yield* wanted
  const id = reviewEventID(wanted)
  const { db } = yield* Database.Service
  const row = yield* db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
  if (row) {
    if (row.type === EventV2.versionedType(MaestroEvent.Review.Received.type, 1)) {
      const existing = Schema.decodeUnknownSync(MaestroEvent.Review.Received.data)(row.data)
      if (isDeepStrictEqual(existing, wanted)) return { id: row.id, ...existing }
    }
    return yield* new ReviewConflictError({ sessionID: wanted.sessionID, reviewID: id })
  }
  const events = yield* EventV2Bridge.Service
  const recorded = yield* events.publish(MaestroEvent.Review.Received, wanted, { id })
  return { id: recorded.id, ...recorded.data }
})

export * as ValidationRecord from "./validation-record"
