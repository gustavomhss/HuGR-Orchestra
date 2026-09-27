import { afterEach, describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Effect, Exit, Schema } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Session } from "@/session/session"
import type { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID } from "../../src/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { MaestroPresentApprovalTool } from "../../src/tool/maestro-approval"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { recordAdmission } from "../../src/maestro/admission-record"
import { presentApprovalFromSession, recordApproval } from "../../src/maestro/approval-record"
import { renderPresentation } from "../../src/maestro/approval"
import { taskHash } from "../../src/maestro/task-hash"
import { and, eq } from "drizzle-orm"

afterEach(async () => {
  await disposeAllInstances()
})

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const layer = LayerNode.compile(
  LayerNode.group([
    Agent.node,
    BackgroundJob.node,
    EventV2Bridge.node,
    Config.node,
    CrossSpawnSpawner.node,
    Session.node,
    SessionProjector.node,
    SessionRunState.node,
    SessionStatus.node,
    Truncate.node,
    ToolRegistry.node,
    Database.node,
    RuntimeFlags.node,
    Ripgrep.node,
  ]),
)

const it = testEffect(layer)

function stubOps(): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.succeed({
        info: {
          id: MessageID.ascending(),
          role: "assistant",
          parentID: input.messageID ?? MessageID.ascending(),
          sessionID: input.sessionID,
          mode: input.agent ?? "general",
          agent: input.agent ?? "general",
          cost: 0,
          path: { cwd: "/tmp", root: "/tmp" },
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: input.model?.modelID ?? ref.modelID,
          providerID: input.model?.providerID ?? ref.providerID,
          time: { created: Date.now() },
          finish: "stop",
        },
        parts: [],
      }),
  }
}

const seed = Effect.fn("MaestroLifecycleTest.seed")(function* () {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Maestro lifecycle" })
  const user = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "maestro",
    model: ref,
    time: { created: Date.now() },
  })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "maestro",
    agent: "maestro",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  return { chat, user, assistant, sessions }
})

describe("Maestro governed lifecycle", () => {
  it.instance(
    "records intake, direct approval, then exact governed child Task",
    () =>
      Effect.gen(function* () {
        const { chat, user, assistant, sessions } = yield* seed()
        yield* sessions.updatePart({
          id: PartID.ascending(),
          messageID: user.id,
          sessionID: chat.id,
          type: "text",
          text: "Add dark mode to settings.",
        })
        const admission = yield* recordAdmission({
          sessionID: chat.id,
          messageID: user.id,
          methodVersion: "admit-request-v1",
          assessment: {
            kind: "work",
            goal: "Add dark mode to settings.",
            known: [{ text: "Settings page exists.", source: "orientation" }],
            proposals: [{ text: "Draft scope first.", source: "maestro" }],
            unknowns: [],
            uncertainty: "Persistence needs inspection.",
            activeWorkEffect: "none",
            reason: "Goal is usable for a draft.",
          },
        })
        expect(admission.outcome).toBe("READY_TO_DRAFT")
        const presentation = yield* presentApprovalFromSession({
          sessionID: chat.id,
          assistantMessageID: assistant.id,
          callID: "call_present",
          memberID: "maestro",
          planRevisionID: "plan_v1",
          validationRecordID: "val_v1",
          revisionHash: "revision-hash",
          validationHash: "validation-hash",
          contextHash: "context-hash",
          policyHash: "policy-hash",
          taskHash: taskHash({
            subagentType: "general",
            prompt: "implement dark mode",
            planRevisionID: "plan_v1",
            revisionHash: "revision-hash",
            validationRecordID: "val_v1",
            validationHash: "validation-hash",
            contextHash: "context-hash",
            policyHash: "policy-hash",
          }),
          intent: { subagentType: "general", prompt: "implement dark mode" },
          methodVersion: "request-approval-v1",
          plan: "Add dark mode to settings.",
          provenance: `request ${user.id}`,
          assumptions: [],
          validationLedger: "val_v1: VALID",
          contextState: "CURRENT",
        })
        yield* sessions.updatePart({
          id: PartID.ascending(),
          messageID: assistant.id,
          sessionID: chat.id,
          type: "tool",
          tool: "maestro_present_approval",
          callID: "call_present",
          state: {
            status: "completed",
            input: {},
            output: renderPresentation(presentation),
            title: "Maestro plan approval",
            metadata: {},
            time: { start: 2, end: 3 },
          },
        })
        const approvalTime = Date.now() + 1_000
        const approvalMessage = yield* sessions.updateMessage({
          id: MessageID.ascending(),
          role: "user",
          sessionID: chat.id,
          agent: "maestro",
          model: ref,
          time: { created: approvalTime },
        })
        yield* sessions.updatePart({
          id: PartID.ascending(),
          messageID: approvalMessage.id,
          sessionID: chat.id,
          type: "text",
          text: "aprovo",
        })
        const approval = yield* recordApproval(chat.id)
        if (approval.status !== "APPROVED") throw new Error("expected exact approval")
        const dispatchMessage: SessionV1.Assistant = {
          id: MessageID.ascending(),
          parentID: approvalMessage.id,
          role: "assistant",
          sessionID: chat.id,
          mode: "maestro",
          agent: "maestro",
          cost: 0,
          path: { cwd: "/tmp", root: "/tmp" },
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: ref.modelID,
          providerID: ref.providerID,
          time: { created: approvalTime + 1_000 },
        }
        yield* sessions.updateMessage(dispatchMessage)
        const tool = yield* TaskTool
        const def = yield* tool.init()
        const input = {
          description: "implement dark mode",
          prompt: "implement dark mode",
          subagent_type: "general",
          governed: {
            sessionID: chat.id,
            projectID: chat.projectID,
            memberID: "maestro",
            approvalMessageID: approval.decision.approvalMessageID,
            planRevisionID: approval.decision.planRevisionID,
            revisionHash: approval.decision.revisionHash,
            validationRecordID: approval.decision.validationRecordID,
            validationHash: approval.decision.validationHash,
            contextHash: approval.decision.contextHash,
            policyHash: approval.decision.policyHash,
            taskHash: approval.decision.taskHash,
          },
        }
        const context = {
          sessionID: chat.id,
          messageID: dispatchMessage.id,
          callID: "call_task_01",
          agent: "maestro",
          abort: new AbortController().signal,
          extra: { promptOps: stubOps() },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        }
        const first = yield* def.execute(input, context)
        const retry = yield* def.execute({ ...input, task_id: first.metadata.sessionId }, context)
        const children = yield* sessions.children(chat.id)
        expect(children).toHaveLength(1)
        expect(retry.metadata.sessionId).toBe(first.metadata.sessionId)
        const database = yield* Database.Service
        const receipts = yield* database.db
          .select({ data: EventTable.data })
          .from(EventTable)
          .where(
            and(
              eq(EventTable.aggregate_id, chat.id),
              eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.ConsumedV2.type, 2)),
            ),
          )
          .all()
          .pipe(Effect.orDie)
        expect(receipts).toHaveLength(1)
        expect(Schema.decodeUnknownSync(MaestroEvent.Approval.ConsumedV2.data)(receipts[0]!.data)).toMatchObject({
          approvalMessageID: approval.decision.approvalMessageID,
          taskHash: approval.decision.taskHash,
          callID: "call_task_01",
          childSessionID: first.metadata.sessionId,
        })
        const changedCall = yield* Effect.exit(def.execute(input, { ...context, callID: "call_task_changed" }))
        expect(Exit.isFailure(changedCall)).toBe(true)
        expect(yield* sessions.children(chat.id)).toHaveLength(1)
      }),
    15_000,
  )

  it.instance("shows governance tools only to Maestro", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      const registry = yield* ToolRegistry.Service
      const build = yield* agent.get("build")
      const maestro = yield* agent.get("maestro")
      if (!build || !maestro) throw new Error("expected native agents")
      const buildTools = yield* registry.tools({ ...ref, agent: build })
      const maestroTools = yield* registry.tools({ ...ref, agent: maestro })
      expect(buildTools.map((tool) => tool.id)).not.toContain("maestro_present_approval")
      expect(buildTools.map((tool) => tool.id)).not.toContain("maestro_record_approval")
      expect(buildTools.map((tool) => tool.id)).not.toContain("maestro_record_admission")
      expect(maestroTools.map((tool) => tool.id)).toContain("maestro_present_approval")
      expect(maestroTools.map((tool) => tool.id)).toContain("maestro_record_approval")
      expect(maestroTools.map((tool) => tool.id)).toContain("maestro_record_admission")
    }),
  )

  it.instance("refuses model-supplied validation until durable validation reader exists", () =>
    Effect.gen(function* () {
      const { chat, assistant } = yield* seed()
      const tool = yield* MaestroPresentApprovalTool
      const def = yield* tool.init()
      const exit = yield* Effect.exit(
        def.execute(
          {
            planRevisionID: "plan_v1",
            validationRecordID: "val_v1",
            revisionHash: "revision-hash",
            validationHash: "validation-hash",
            contextHash: "context-hash",
            policyHash: "policy-hash",
            intent: { subagentType: "general", prompt: "implement dark mode" },
            methodVersion: "request-approval-v1",
            plan: "implement dark mode",
            provenance: "test",
            assumptions: [],
            validationLedger: "VALID",
            contextState: "CURRENT",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            callID: "call_present",
            agent: "maestro",
            abort: new AbortController().signal,
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        ),
      )
      expect(Exit.isFailure(exit)).toBe(true)
    }),
  )

  it.instance("denies governed Task before child Session creation without exact approval", () =>
    Effect.gen(function* () {
      const { chat, assistant, sessions } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const exit = yield* Effect.exit(
        def.execute(
          {
            description: "implement dark mode",
            prompt: "implement dark mode",
            subagent_type: "general",
            governed: {
              sessionID: chat.id,
              projectID: chat.projectID,
              memberID: "maestro",
              approvalMessageID: "msg_approve",
              planRevisionID: "plan_v1",
              revisionHash: "rev-hash",
              validationRecordID: "val_01",
              validationHash: "val-hash",
              contextHash: "context-hash",
              policyHash: "policy-hash",
              taskHash: "task-hash",
            },
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            callID: "call_task_missing",
            agent: "maestro",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps() },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        ),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      expect(yield* sessions.children(chat.id)).toHaveLength(0)
    }),
  )

  it.instance("creates governed Task only from exact approved event", () =>
    Effect.gen(function* () {
      const events = yield* EventV2Bridge.Service
      const { chat, assistant, sessions } = yield* seed()
      const governed = {
        sessionID: chat.id,
        projectID: chat.projectID,
        memberID: "maestro",
        approvalMessageID: "msg_approve",
        planRevisionID: "plan_v1",
        revisionHash: "rev-hash",
        validationRecordID: "val_01",
        validationHash: "val-hash",
        contextHash: "context-hash",
        policyHash: "policy-hash",
        taskHash: taskHash({
          subagentType: "general",
          prompt: "implement dark mode",
          planRevisionID: "plan_v1",
          revisionHash: "rev-hash",
          validationRecordID: "val_01",
          validationHash: "val-hash",
          contextHash: "context-hash",
          policyHash: "policy-hash",
        }),
      }
      yield* events.publish(MaestroEvent.Approval.Presented, {
        id: "apr_01",
        sessionID: chat.id,
        assistantMessageID: assistant.id,
        callID: "call_present",
        planRevisionID: governed.planRevisionID,
        validationRecordID: governed.validationRecordID,
        projectID: governed.projectID,
        memberID: governed.memberID,
        revisionHash: governed.revisionHash,
        validationHash: governed.validationHash,
        contextHash: governed.contextHash,
        policyHash: governed.policyHash,
        taskHash: governed.taskHash,
        intent: { subagentType: "general", prompt: "implement dark mode" },
        methodVersion: "request-approval-v1",
        plan: "implement dark mode",
        provenance: "test",
        assumptions: [],
        validationLedger: "VALID",
        contextState: "CURRENT",
      })
      yield* events.publish(MaestroEvent.Approval.Decided, {
        ...governed,
        presentationID: "apr_01",
        presentationMessageID: "msg_presentation",
        methodVersion: "request-approval-v1",
        taskHash: governed.taskHash,
        outcome: "APPROVED",
        decisionTime: Date.now(),
      })
      const tool = yield* TaskTool
      const def = yield* tool.init()
      yield* def.execute(
        {
          description: "implement dark mode",
          prompt: "implement dark mode",
          subagent_type: "general",
          governed,
        },
        {
          sessionID: chat.id,
          messageID: assistant.id,
          callID: "call_task_exact",
          agent: "maestro",
          abort: new AbortController().signal,
          extra: { promptOps: stubOps() },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )
      expect(yield* sessions.children(chat.id)).toHaveLength(1)
      const repeated = { ...governed, approvalMessageID: "msg_approve_again" }
      yield* events.publish(MaestroEvent.Approval.Decided, {
        ...repeated,
        presentationID: "apr_01",
        presentationMessageID: "msg_presentation",
        methodVersion: "request-approval-v1",
        outcome: "APPROVED",
        decisionTime: Date.now() + 1,
      })
      const duplicate = yield* Effect.exit(
        def.execute(
          {
            description: "implement dark mode",
            prompt: "implement dark mode",
            subagent_type: "general",
            governed: repeated,
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            callID: "call_task_repeated_approval",
            agent: "maestro",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps() },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        ),
      )
      expect(Exit.isFailure(duplicate)).toBe(true)
      expect(yield* sessions.children(chat.id)).toHaveLength(1)
    }),
  )
})
