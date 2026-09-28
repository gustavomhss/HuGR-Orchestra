import { afterEach, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Effect } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { grantAuthorization } from "../../src/maestro/authorization"
import { reserveDispatch } from "../../src/maestro/dispatch"
import { recordValidation } from "../../src/maestro/validation-record"
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
    const validation = yield* recordValidation({
      sessionID: session.id,
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
    const synthetic = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: session.id, agent: "maestro", model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") }, time: { created: 1 } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: session.id, messageID: synthetic.id, type: "text", text: "approve", synthetic: true })
    const rejected = yield* grantAuthorization({ sessionID: session.id, validationRecordID: validation.id, approvalMessageID: synthetic.id }).pipe(Effect.flip)
    expect(rejected).toMatchObject({ reason: "reply-synthetic" })
    const direct = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: session.id, agent: "maestro", model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") }, time: { created: 2 } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: session.id, messageID: direct.id, type: "text", text: "approve" })
    const granted = yield* grantAuthorization({ sessionID: session.id, validationRecordID: validation.id, approvalMessageID: direct.id })
    expect(granted).toMatchObject({ sessionID: session.id, validationRecordID: validation.id, approvalMessageID: direct.id, reviewerID: "lucy" })
    const reservation = yield* reserveDispatch({ sessionID: session.id, authorizationID: granted.id })
    expect(reservation).toMatchObject({ sessionID: session.id, authorizationID: granted.id, routedMemberID: "charlie" })
  }),
)
