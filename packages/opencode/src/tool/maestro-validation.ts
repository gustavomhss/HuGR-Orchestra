import { Effect, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { recordReview, recordValidation } from "@/maestro/validation-record"
import { PositiveInt } from "@opencode-ai/schema/schema"
import * as Tool from "./tool"

const Checks = Schema.Array(
  Schema.Struct({
    id: Schema.NonEmptyString,
    status: Schema.Literals(["PASS", "FAIL", "HOLD"]),
    detail: Schema.NonEmptyString,
  }),
).check(Schema.isMinLength(1))

const ValidationParameters = Schema.Struct({
  workCardID: Schema.NonEmptyString,
  workCard: Schema.NonEmptyString,
  routedMemberID: Schema.NonEmptyString,
  validatorVersion: Schema.NonEmptyString,
  checks: Checks,
  outcome: Schema.Literals(["VALID", "INVALID", "HOLD"]),
})

const ReviewParameters = Schema.Struct({
  validationRecordID: Schema.NonEmptyString,
  workCard: Schema.NonEmptyString,
  verdict: Schema.Literals(["APPROVE", "FIX_FIRST", "REJECT"]),
  findings: Schema.Array(
    Schema.Struct({ path: Schema.NonEmptyString, line: PositiveInt, message: Schema.NonEmptyString }),
  ),
})

export const MaestroRecordValidationTool = Tool.define(
  "maestro_record_validation",
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const sessions = yield* Session.Service
    return {
      description: "Record immutable Maestro validation receipt for one routed work card.",
      parameters: ValidationParameters,
      execute: (params: Schema.Schema.Type<typeof ValidationParameters>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agent)
          if (agent?.id !== "maestro" || agent.native !== true) {
            return yield* Effect.fail(new Error("Validation recording requires native Maestro"))
          }
          const session = yield* sessions.get(ctx.sessionID)
          const record = yield* recordValidation({ ...params, sessionID: ctx.sessionID, projectID: session.projectID, validatorID: agent.id })
          return {
            title: `Validation ${record.outcome}`,
            metadata: { validationRecordID: record.id, workCardHash: record.workCardHash, outcome: record.outcome },
            output: `${record.id} ${record.workCardHash} ${record.outcome}`,
          }
        }).pipe(
          Effect.provideService(Agent.Service, agents),
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Session.Service, sessions),
          Effect.orDie,
        ),
    }
  }),
)

export const MaestroRecordReviewTool = Tool.define(
  "maestro_record_review",
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Record immutable Lucy review receipt for one validation work card.",
      parameters: ReviewParameters,
      execute: (params: Schema.Schema.Type<typeof ReviewParameters>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agent)
          if (agent?.id !== "lucy" || agent.native !== true) return yield* Effect.fail(new Error("Review recording requires native Lucy"))
          const record = yield* recordReview({ ...params, sessionID: ctx.sessionID, reviewerID: "lucy" })
          return {
            title: `Review ${record.verdict}`,
            metadata: { reviewID: record.id, workCardHash: record.workCardHash, verdict: record.verdict },
            output: `${record.id} ${record.workCardHash} ${record.verdict}`,
          }
        }).pipe(
          Effect.provideService(Agent.Service, agents),
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.orDie,
        ),
    }
  }),
)
