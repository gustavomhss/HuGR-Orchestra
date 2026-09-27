export * as MaestroEvent from "./maestro-event"

import { Event } from "./event"
import { Schema } from "effect"
import { NonNegativeInt } from "./schema"

export namespace Approval {
  export const Presented = Event.define({
    type: "maestro.approval.presented",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      id: Schema.String,
      sessionID: Schema.String,
      assistantMessageID: Schema.String,
      callID: Schema.String,
      planRevisionID: Schema.String,
      validationRecordID: Schema.String,
      projectID: Schema.String,
      memberID: Schema.String,
      revisionHash: Schema.String,
      validationHash: Schema.String,
      contextHash: Schema.String,
      policyHash: Schema.String,
      taskHash: Schema.String,
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
    },
  })
  export type Presented = typeof Presented.Type

  export const Decided = Event.define({
    type: "maestro.approval.decided",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      projectID: Schema.String,
      memberID: Schema.String,
      presentationID: Schema.String,
      presentationMessageID: Schema.String,
      approvalMessageID: Schema.String,
      planRevisionID: Schema.String,
      validationRecordID: Schema.String,
      revisionHash: Schema.String,
      validationHash: Schema.String,
      contextHash: Schema.String,
      policyHash: Schema.String,
      taskHash: Schema.String,
      methodVersion: Schema.String,
      outcome: Schema.Literals(["APPROVED", "DECLINED"]),
      decisionTime: NonNegativeInt,
    },
  })
  export type Decided = typeof Decided.Type

  export const Consumed = Event.define({
    type: "maestro.approval.consumed",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      presentationID: Schema.String,
      approvalMessageID: Schema.String,
      taskHash: Schema.String,
      callID: Schema.String,
    },
  })
  export type Consumed = typeof Consumed.Type

  export const Reserved = Event.define({
    type: "maestro.approval.reserved",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      presentationID: Schema.String,
      approvalMessageID: Schema.String,
      projectID: Schema.String,
      memberID: Schema.String,
      planRevisionID: Schema.String,
      validationRecordID: Schema.String,
      revisionHash: Schema.String,
      validationHash: Schema.String,
      contextHash: Schema.String,
      policyHash: Schema.String,
      taskHash: Schema.String,
      callID: Schema.String,
      childSessionID: Schema.String,
      parentSessionID: Schema.String,
      agent: Schema.String,
    },
  })
  export type Reserved = typeof Reserved.Type

  export const ConsumedV2 = Event.define({
    type: "maestro.approval.consumed",
    durable: { version: 2, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      presentationID: Schema.String,
      approvalMessageID: Schema.String,
      taskHash: Schema.String,
      callID: Schema.String,
      childSessionID: Schema.String,
    },
  })
  export type ConsumedV2 = typeof ConsumedV2.Type
}

export namespace Admission {
  const KnownFact = Schema.Struct({
    text: Schema.String,
    source: Schema.Literals(["stakeholder", "orientation"]),
  })
  const Proposal = Schema.Struct({
    text: Schema.String,
    source: Schema.Literal("maestro"),
  })
  const Assessment = Schema.Struct({
    kind: Schema.Literals(["orient", "work"]),
    goal: Schema.optional(Schema.String),
    known: Schema.Array(KnownFact),
    proposals: Schema.Array(Proposal),
    unknowns: Schema.Array(Schema.String),
    uncertainty: Schema.String,
    activeWorkEffect: Schema.Literals(["none", "new-scope-or-revision"]),
    reason: Schema.String,
  })

  export const Decided = Event.define({
    type: "maestro.admission.decided",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      messageID: Schema.String,
      methodVersion: Schema.String,
      outcome: Schema.Literals(["ORIENT", "CLARIFY", "READY_TO_DRAFT"]),
      reason: Schema.optional(
        Schema.Literals(["invalid-assessment", "missing-usable-goal", "material-blocker", "active-work-conflict"]),
      ),
      assessment: Schema.optional(Assessment),
    },
  })
  export type Decided = typeof Decided.Type
}

export const Definitions = Event.inventory(
  Approval.Presented,
  Approval.Decided,
  Approval.Consumed,
  Approval.Reserved,
  Approval.ConsumedV2,
  Admission.Decided,
)
