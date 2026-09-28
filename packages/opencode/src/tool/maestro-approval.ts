import { Effect, Schema } from "effect"
import { recordApproval } from "@/maestro/approval-record"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Agent } from "@/agent/agent"
import * as Tool from "./tool"

const PresentationParameters = Schema.Struct({
  planRevisionID: Schema.String,
  validationRecordID: Schema.String,
  revisionHash: Schema.String,
  validationHash: Schema.String,
  contextHash: Schema.String,
  policyHash: Schema.String,
  intent: Schema.Struct({
    subagentType: Schema.String,
    prompt: Schema.String,
    model: Schema.optional(Schema.String),
    taskID: Schema.optional(Schema.String),
  }),
  methodVersion: Schema.String,
  plan: Schema.String,
  provenance: Schema.String,
  assumptions: Schema.Array(Schema.String),
  validationLedger: Schema.String,
  contextState: Schema.Literal("CURRENT"),
})

export const MaestroPresentApprovalTool = Tool.define(
  "maestro_present_approval",
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    return {
      description:
        "Unavailable until durable plan revision and validation readers exist. Refuses rather than treat model-supplied fields as approval authority.",
      parameters: PresentationParameters,
      execute: (_params: Schema.Schema.Type<typeof PresentationParameters>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agent)
          if (agent?.id !== "maestro") return yield* Effect.fail(new Error("Approval presentation requires Maestro"))
          return yield* Effect.fail(
            new Error(
              "Approval presentation unavailable: durable plan revision and validation readers are not implemented",
            ),
          )
        }).pipe(Effect.provideService(Agent.Service, agents), Effect.orDie),
    }
  }),
)

export const MaestroRecordApprovalTool = Tool.define(
  "maestro_record_approval",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const agents = yield* Agent.Service
    return {
      description: "Record direct user approval or decline for current exact Maestro plan presentation. Maestro only.",
      parameters: Schema.Struct({}),
      execute: (_: Record<string, never>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agent)
          if (agent?.id !== "maestro") return yield* Effect.fail(new Error("Approval decision requires Maestro"))
          const result = yield* recordApproval(ctx.sessionID)
          switch (result.status) {
            case "APPROVED":
            case "DECLINED":
              return {
                title: `Approval ${result.status.toLowerCase()}`,
                metadata: { status: String(result.status), approvalMessageID: result.decision.approvalMessageID },
                output: `${result.status}: exact plan revision ${result.decision.planRevisionID}`,
              }
            case "HOLD":
              return {
                title: "Approval not recorded",
                metadata: { status: String(result.status), approvalMessageID: "" },
                output: `HOLD: ${result.reason}`,
              }
            case "PENDING":
              return {
                title: "Approval not recorded",
                metadata: { status: String(result.status), approvalMessageID: "" },
                output: `PENDING: ${result.kind}`,
              }
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
