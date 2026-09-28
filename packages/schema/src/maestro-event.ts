export * as MaestroEvent from "./maestro-event"

import { Event } from "./event"
import { Schema } from "effect"
import { NonNegativeInt, PositiveInt } from "./schema"

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

export namespace Validation {
  export const Recorded = Event.define({
    type: "maestro.validation.recorded",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.NonEmptyString,
      projectID: Schema.NonEmptyString,
      workCardID: Schema.NonEmptyString,
      workCard: Schema.NonEmptyString,
      workCardHash: Schema.NonEmptyString,
      routedMemberID: Schema.NonEmptyString,
      rosterHash: Schema.NonEmptyString,
      grantHash: Schema.NonEmptyString,
      reviewPolicyHash: Schema.NonEmptyString,
      validatorID: Schema.NonEmptyString,
      validatorVersion: Schema.NonEmptyString,
      checks: Schema.Array(
        Schema.Struct({
          id: Schema.NonEmptyString,
          status: Schema.Literals(["PASS", "FAIL", "HOLD"]),
          detail: Schema.NonEmptyString,
        }),
      ).check(Schema.isMinLength(1)),
      outcome: Schema.Literals(["VALID", "INVALID", "HOLD"]),
    },
  })
  export type Recorded = typeof Recorded.Type
}

export namespace Review {
  export const Received = Event.define({
    type: "maestro.review.received",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.NonEmptyString,
      validationRecordID: Schema.NonEmptyString,
      workCardHash: Schema.NonEmptyString,
      reviewerID: Schema.Literal("lucy"),
      verdict: Schema.Literals(["APPROVE", "FIX_FIRST", "REJECT"]),
      findings: Schema.Array(
        Schema.Struct({
          path: Schema.NonEmptyString,
          line: PositiveInt,
          message: Schema.NonEmptyString,
        }),
      ),
    },
  })
  export type Received = typeof Received.Type
}

export const Definitions = Event.inventory(
  Approval.Presented,
  Approval.Decided,
  Approval.Consumed,
  Admission.Decided,
  Validation.Recorded,
  Review.Received,
)
