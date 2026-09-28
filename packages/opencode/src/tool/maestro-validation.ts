import { Effect, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { recordReview, recordValidation } from "@/maestro/validation-record"
import { Database } from "@opencode-ai/core/database/database"
import * as Tool from "./tool"

const Check = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["PASS", "FAIL", "HOLD"]),
  detail: Schema.String,
})

const ValidationParameters = Schema.Struct({
  projectID: Schema.String,
  workCardID: Schema.String,
  workCard: Schema.String,
  routedMemberID: Schema.String,
  validatorVersion: Schema.String,
  checks: Schema.Array(Check),
})

const ReviewParameters = Schema.Struct({
  validationRecordID: Schema.String,
  workCard: Schema.String,
  reviewMethodVersion: Schema.String,
  verdict: Schema.Literals(["APPROVE", "FIX_FIRST", "REJECT"]),
  findings: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      line: Schema.Number,
      message: Schema.String,
    }),
  ),
  artifact: Schema.Struct({
    baseSHA: Schema.NonEmptyString,
    headSHA: Schema.NonEmptyString,
    worktree: Schema.NonEmptyString,
    changedPaths: Schema.Array(Schema.NonEmptyString),
    encoding: Schema.Literal("base64"),
    bytes: Schema.NonEmptyString,
  }),
  checks: Schema.Array(Check),
})

export const MaestroRecordValidationTool = Tool.define(
  "maestro_record_validation",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const agents = yield* Agent.Service
    return {
      description: "Record validation evidence for one routed work card. Maestro only.",
      parameters: ValidationParameters,
      strictParameters: {
        projectID: true,
        workCardID: true,
        workCard: true,
        routedMemberID: true,
        validatorVersion: true,
        checks: [{ id: true, status: true, detail: true }],
      },
      execute: (params: Schema.Schema.Type<typeof ValidationParameters>, ctx) =>
        Effect.gen(function* () {
          const agent = ctx.agentID ? yield* agents.get(ctx.agentID) : undefined
          if (agent?.id !== "maestro" || agent.native !== true) {
            return yield* Effect.fail(new Error("Validation recording requires Maestro"))
          }
          const record = yield* recordValidation({ ...params, sessionID: ctx.sessionID, validatorID: "maestro" })
          return {
            title: `Validation ${record.outcome}`,
            metadata: { validationRecordID: record.id, outcome: record.outcome },
            output: `${record.outcome}: ${record.id}`,
          }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Agent.Service, agents),
          Effect.orDie,
        ),
    }
  }),
)

export const MaestroRecordReviewTool = Tool.define(
  "maestro_record_review",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const agents = yield* Agent.Service
    const git = yield* Git.Service
    return {
      description: "Record cold review evidence for one validation record. Lucy only.",
      parameters: ReviewParameters,
      strictParameters: {
        validationRecordID: true,
        workCard: true,
        reviewMethodVersion: true,
        verdict: true,
        findings: [{ path: true, line: true, message: true }],
        artifact: {
          baseSHA: true,
          headSHA: true,
          worktree: true,
          changedPaths: [true],
          encoding: true,
          bytes: true,
        },
        checks: [{ id: true, status: true, detail: true }],
      },
      execute: (params: Schema.Schema.Type<typeof ReviewParameters>, ctx) =>
        Effect.gen(function* () {
          const agent = ctx.agentID ? yield* agents.get(ctx.agentID) : undefined
          if (agent?.id !== "lucy" || agent.native !== true) {
            return yield* Effect.fail(new Error("Review recording requires Lucy"))
          }
          const record = yield* recordReview({ ...params, sessionID: ctx.sessionID, reviewerID: "lucy" })
          return {
            title: `Review ${record.verdict}`,
            metadata: { reviewReceiptID: record.id, verdict: record.verdict },
            output: `${record.verdict}: ${record.id}`,
          }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Git.Service, git),
          Effect.provideService(Agent.Service, agents),
          Effect.orDie,
        ),
    }
  }),
)
