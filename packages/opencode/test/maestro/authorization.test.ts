import { afterEach, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { grantAuthorization } from "../../src/maestro/authorization"
import { reserveDispatch } from "../../src/maestro/dispatch"
import { recordValidation } from "../../src/maestro/validation-record"
import { presentApprovalFromSession, recordApproval } from "../../src/maestro/approval-record"
import { renderPresentation } from "../../src/maestro/approval"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => disposeAllInstances())

const it = testEffect(
  LayerNode.compile(LayerNode.group([Database.node, EventV2Bridge.node, Session.node, SessionProjector.node])),
)

it.instance("requires direct user approval and independent Lucy approval", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const events = yield* EventV2Bridge.Service
    const session = yield* sessions.create({ title: "authorization" })
    const planRevisionID = EventV2.ID.make("evt_maestro_plan_authorization")
    const contextRecordID = EventV2.ID.make("evt_maestro_context_authorization")
    yield* events.publish(MaestroEvent.PlanRevision.Recorded, {
      id: planRevisionID,
      sessionID: session.id,
      admissionMessageID: "msg_admission",
      methodVersion: "draft-plan-v1",
      revision: "v1",
      goal: { value: "implement card", source: "maestro" },
      acceptance: [{ value: "tests pass", source: "maestro" }],
      scope: [{ value: "card", source: "maestro" }],
      constraints: [],
      reviewRequirement: { value: "Lucy", source: "maestro" },
      contextRequirement: "PENDING",
      assumptions: [],
      risks: [],
      status: "PROPOSED",
      revisionHash: "a".repeat(64),
      createdAt: 1,
    }, { id: planRevisionID })
    yield* events.publish(MaestroEvent.Context.Recorded, {
      id: contextRecordID,
      sessionID: session.id,
      planRevisionID,
      projectID: session.projectID,
      directory: session.directory,
      mode: "UNGROUNDED",
      branch: "test",
      headSHA: "a".repeat(40),
      changedPaths: [],
      currentEvidenceIdentityHash: "b".repeat(64),
      contextHash: "c".repeat(64),
      status: "CURRENT",
      createdAt: 1,
    }, { id: contextRecordID })
    const validation = yield* recordValidation({
      sessionID: session.id,
      planRevisionID,
      contextRecordID,
      contextHash: "c".repeat(64),
      projectID: session.projectID,
      workCardID: "card_authorization",
      workCard: "# card\n",
      routedMemberID: "charlie",
      validatorID: "maestro",
      validatorVersion: "validation-v1",
      checks: [{ id: "route", status: "PASS", detail: "routed" }],
    })
    const denied = yield* grantAuthorization({ sessionID: session.id, validationRecordID: validation.id, approvalMessageID: "msg_missing" }).pipe(Effect.flip)
    expect(denied).toMatchObject({ reason: "review-not-approved" })
    yield* events.publish(MaestroEvent.Review.Received, {
      sessionID: session.id,
      projectID: session.projectID,
      validationRecordID: validation.id,
      workCardHash: validation.workCardHash,
      routedMemberID: validation.routedMemberID,
      rosterHash: validation.rosterHash,
      grantHash: validation.grantHash,
      reviewPolicyHash: validation.reviewPolicyHash,
      actor: validation.actor,
      reviewerID: "lucy",
      reviewMethodVersion: "review-v1",
      artifact: { workCardHash: validation.workCardHash, sha256: "a".repeat(64), baseSHA: "a".repeat(40), headSHA: "b".repeat(40), worktree: "/tmp", changedPaths: [], bytes: "ZGlmZg==" },
      verdict: "APPROVE",
      findings: [],
    })
    const assistant: SessionV1.Assistant = {
      id: MessageID.ascending(), parentID: MessageID.ascending(), role: "assistant", sessionID: session.id,
      mode: "maestro", agent: "maestro", path: { cwd: session.directory, root: session.directory }, cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: ModelV2.ID.make("test"), providerID: ProviderV2.ID.make("test"), time: { created: 1 },
    }
    yield* sessions.updateMessage(assistant)
    const presentation = yield* presentApprovalFromSession({
      sessionID: session.id, assistantMessageID: assistant.id, callID: "call_present", memberID: "maestro",
      planRevisionID, validationRecordID: validation.id, revisionHash: "a".repeat(64), validationHash: "d".repeat(64),
      contextHash: "c".repeat(64), policyHash: validation.reviewPolicyHash, taskHash: "e".repeat(64),
      intent: { subagentType: "charlie", prompt: "implement card" }, methodVersion: "request-approval-v1",
      plan: "implement card", provenance: "test", assumptions: [], validationLedger: "VALID", contextState: "CURRENT",
    })
    yield* sessions.updatePart({
      id: PartID.ascending(), sessionID: session.id, messageID: assistant.id, type: "tool", tool: "maestro_present_approval",
      callID: "call_present", state: { status: "completed", input: {}, output: renderPresentation(presentation), title: "approval", metadata: {}, time: { start: 1, end: 2 } },
    })
    const direct = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: session.id, agent: "maestro", model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") }, time: { created: 2 } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: session.id, messageID: direct.id, type: "text", text: "approve" })
    const approval = yield* recordApproval(session.id)
    if (approval.status === "HOLD") throw new Error(approval.reason)
    expect(approval.status).toBe("APPROVED")
    const granted = yield* grantAuthorization({ sessionID: session.id, validationRecordID: validation.id, approvalMessageID: direct.id })
    expect(granted).toMatchObject({ sessionID: session.id, validationRecordID: validation.id, approvalMessageID: direct.id, reviewerID: "lucy" })
    const reservation = yield* reserveDispatch({ sessionID: session.id, authorizationID: granted.id, permission: [] })
    expect(reservation).toMatchObject({ sessionID: session.id, authorizationID: granted.id, routedMemberID: "charlie" })
  }),
)
