import * as Tool from "./tool"
import DESCRIPTION from "./task.txt"
import { ToolJsonSchema } from "./json-schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import { Provider } from "@/provider/provider"
import { deriveSubagentSessionPermission } from "../agent/subagent-permissions"
import type { SessionPrompt } from "../session/prompt"
import { Config } from "@/config/config"
import { Effect, Exit, Schema, Scope } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { and, asc, eq } from "drizzle-orm"
import { verifyGovernedTask } from "@/maestro/governed-task"
import { taskHash } from "@/maestro/task-hash"
import { createHash } from "node:crypto"
import { EventV2Bridge } from "@/event-v2-bridge"

export interface TaskPromptOps {
  cancel(sessionID: SessionID): Effect.Effect<void>
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(input: SessionPrompt.PromptInput): Effect.Effect<SessionV1.WithParts>
}

const id = "task"
const BACKGROUND_DESCRIPTION = [
  "Background mode: background=true launches the subagent asynchronously and returns immediately.",
  "Foreground is the default; use it when you need the result before continuing.",
  "Use background only for independent work that can run while you continue elsewhere.",
  "You will be notified automatically when it finishes.",
].join(" ")
const BACKGROUND_STARTED = [
  "The task is working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you launched and end your response.",
].join("\n")
const BACKGROUND_UPDATED = [
  "Additional context sent to the running background task.",
  "The task is still working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you sent and end your response.",
].join("\n")

const BaseParameterFields = {
  description: Schema.String.annotate({ description: "A short (3-5 words) description of the task" }),
  prompt: Schema.String.annotate({ description: "The task for the agent to perform" }),
  subagent_type: Schema.String.annotate({ description: "The type of specialized agent to use for this task" }),
  task_id: Schema.optional(Schema.String).annotate({
    description:
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
  }),
  command: Schema.optional(Schema.String).annotate({ description: "The command that triggered this task" }),
  model: Schema.optional(Schema.String).annotate({
    description:
      "Run the subagent on a specific model as 'providerID/modelID' (e.g. 'openrouter/deepseek/deepseek-chat', 'groq/llama-3.3-70b-versatile'). Overrides the subagent's configured model and the parent session model. The provider part also selects credentials: OAuth subscriptions (Claude Max, ChatGPT) and API keys resolve per providerID at run time — use a custom provider alias in opencode.json to pin a second key for the same backend.",
  }),
  governed: Schema.optional(
    Schema.Struct({
      sessionID: Schema.String,
      projectID: Schema.String,
      memberID: Schema.String,
      approvalMessageID: Schema.String,
      planRevisionID: Schema.String,
      revisionHash: Schema.String,
      validationRecordID: Schema.String,
      validationHash: Schema.String,
      contextHash: Schema.String,
      policyHash: Schema.String,
      taskHash: Schema.String,
    }),
  ).annotate({
    description: "Exact approval binding required only for an explicit governed Task.",
  }),
}

const BaseParameters = Schema.Struct(BaseParameterFields)

export const Parameters = Schema.Struct({
  ...BaseParameterFields,
  background: Schema.optional(Schema.Boolean).annotate({
    description:
      "Run the agent in the background. You will be notified when it completes. DO NOT sleep, poll, or proactively check on its progress",
  }),
})

function renderOutput(input: {
  sessionID: SessionID
  state: "running" | "completed" | "error"
  summary?: string
  text: string
}) {
  const tag = input.state === "error" ? "task_error" : "task_result"
  return [
    `<task id="${input.sessionID}" state="${input.state}">`,
    ...(input.summary ? [`<summary>${input.summary}</summary>`] : []),
    `<${tag}>`,
    input.text,
    `</${tag}>`,
    "</task>",
  ].join("\n")
}

export const TaskTool = Tool.define(
  id,
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const background = yield* BackgroundJob.Service
    const config = yield* Config.Service
    const sessions = yield* Session.Service
    const scope = yield* Scope.Scope
    const flags = yield* RuntimeFlags.Service
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service

    const run = Effect.fn("TaskTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context,
    ) {
      const cfg = yield* config.get()
      const runInBackground = params.background === true
      let governedChildID: SessionID | undefined
      let governedPresentationID: string | undefined
      let governedCallID: string | undefined
      if (runInBackground && !flags.experimentalBackgroundSubagents) {
        return yield* Effect.fail(
          new Error("Background subagents require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true"),
        )
      }

      const parent = yield* sessions.get(ctx.sessionID)
      const next = yield* agent.get(params.subagent_type)
      if (!next) {
        return yield* Effect.fail(new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`))
      }
      const nextID = next.id ?? params.subagent_type
      const childPermission = deriveSubagentSessionPermission({
        parentSessionPermission: parent.permission ?? [],
        subagent: next,
      })
      const childToolDenies = [
        ...(next.permission.some((rule) => rule.permission === "todowrite")
          ? []
          : [{ permission: "todowrite" as const, pattern: "*" as const, action: "deny" as const }]),
        ...(next.permission.some((rule) => rule.permission === id)
          ? []
          : [{ permission: id, pattern: "*" as const, action: "deny" as const }]),
        ...(cfg.experimental?.primary_tools?.map((permission) => ({
          permission,
          pattern: "*" as const,
          action: "deny" as const,
        })) ?? []),
      ]
      const childPermissions = [
        ...childPermission,
        ...childToolDenies.filter(
          (deny) =>
            !childPermission.some(
              (rule) =>
                rule.permission === deny.permission && rule.pattern === deny.pattern && rule.action === deny.action,
            ),
        ),
      ]
      let reservedChildPermissions:
        | readonly {
            readonly permission: string
            readonly pattern: string
            readonly action: "allow" | "deny" | "ask"
          }[]
        | undefined
      const resumed = params.task_id
        ? yield* sessions.get(SessionID.make(params.task_id)).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
      if (resumed && (resumed.parentID !== ctx.sessionID || resumed.agent !== nextID)) {
        return yield* Effect.fail(new Error("Task resume denied: task is not direct child for selected agent"))
      }
      if (params.governed) {
        const message = yield* MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.orDie,
        )
        if (message.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))
        if (params.model) {
          const parsed = Provider.parseModel(params.model)
          if (!parsed.providerID || !parsed.modelID) {
            return yield* Effect.fail(
              new Error(
                `Invalid model "${params.model}". Use the 'providerID/modelID' format, e.g. 'openrouter/deepseek/deepseek-chat'.`,
              ),
            )
          }
        }
        let ancestor = parent
        let ancestorDepth = 0
        while (ancestor.parentID) {
          ancestorDepth++
          ancestor = yield* sessions.get(ancestor.parentID)
        }
        if (ancestorDepth >= (cfg.subagent_depth ?? 1)) {
          return yield* Effect.fail(
            new Error(
              `Subagent depth limit reached (${cfg.subagent_depth ?? 1}). Increase "subagent_depth" to allow nested subagents.`,
            ),
          )
        }
        const selectedModel = params.model
          ? Provider.parseModel(params.model)
          : (next.model ?? { modelID: message.info.modelID, providerID: message.info.providerID })
        const modelRules = (parent.permission ?? []).filter(
          (rule) => rule.permission === id && rule.pattern.includes("/"),
        )
        if (!ctx.extra?.bypassAgentCheck) {
          yield* ctx.ask({
            permission: id,
            patterns:
              modelRules.length > 0
                ? [params.subagent_type, `${selectedModel.providerID}/${selectedModel.modelID}`]
                : [params.subagent_type],
            always: ["*"],
            metadata: {
              description: params.description,
              subagent_type: params.subagent_type,
              ...(modelRules.length > 0 ? { model: `${selectedModel.providerID}/${selectedModel.modelID}` } : {}),
            },
          })
        }
        if (!ctx.extra?.promptOps) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))
      }
      if (params.governed) {
        const governed = params.governed
        const caller = yield* agent.get(ctx.agent)
        if (caller?.id !== "maestro") return yield* Effect.fail(new Error("Governed Task requires Maestro"))
        if (!ctx.callID) return yield* Effect.fail(new Error("Governed Task denied: missing-call-id"))
        const callID = ctx.callID
        if (governed.sessionID !== ctx.sessionID || governed.projectID !== parent.projectID) {
          return yield* Effect.fail(new Error("Governed Task denied: request-context-mismatch"))
        }
        if (governed.memberID !== caller.id) {
          return yield* Effect.fail(new Error("Governed Task denied: request-actor-mismatch"))
        }
        const expectedTaskHash = taskHash({
          subagentType: params.subagent_type,
          prompt: params.prompt,
          model: params.model,
          ...governed,
        })
        if (governed.taskHash !== expectedTaskHash) {
          return yield* Effect.fail(new Error("Governed Task denied: task-hash-mismatch"))
        }
        const decisions = yield* database.db
          .select({ data: EventTable.data })
          .from(EventTable)
          .where(
            and(
              eq(EventTable.aggregate_id, governed.sessionID),
              eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.Decided.type, 1)),
            ),
          )
          .orderBy(asc(EventTable.seq))
          .all()
          .pipe(Effect.orDie)
        const presentations = yield* database.db
          .select({ data: EventTable.data, seq: EventTable.seq })
          .from(EventTable)
          .where(
            and(
              eq(EventTable.aggregate_id, governed.sessionID),
              eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.Presented.type, 1)),
            ),
          )
          .orderBy(asc(EventTable.seq))
          .all()
          .pipe(Effect.orDie)
        const decisionEvents = decisions.map((decision) =>
          Schema.decodeUnknownSync(MaestroEvent.Approval.Decided.data)(decision.data),
        )
        const newestPresentationID = presentations.at(-1)
          ? Schema.decodeUnknownSync(MaestroEvent.Approval.Presented.data)(presentations.at(-1)!.data).id
          : undefined
        const verdict = verifyGovernedTask({
          request: governed,
          decisions: decisionEvents,
          newestPresentationID,
        })
        if (verdict.status !== "APPROVED")
          return yield* Effect.fail(new Error(`Governed Task denied: ${verdict.reason}`))
        const approvedDecision = decisionEvents.find(
          (decision) =>
            decision.approvalMessageID === governed.approvalMessageID && decision.taskHash === governed.taskHash,
        )!
        const consumed = yield* database.db
          .select({ data: EventTable.data })
          .from(EventTable)
          .where(
            and(
              eq(EventTable.aggregate_id, governed.sessionID),
              eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.Consumed.type, 1)),
            ),
          )
          .all()
          .pipe(Effect.orDie)
        if (
          consumed.some((event) => {
            const data = Schema.decodeUnknownSync(MaestroEvent.Approval.Consumed.data)(event.data)
            return data.presentationID === approvedDecision.presentationID && data.taskHash === governed.taskHash
          })
        ) {
          return yield* Effect.fail(new Error("Governed Task denied: approval-consumed"))
        }
        const reservationHash = createHash("sha256")
          .update([governed.sessionID, approvedDecision.presentationID, governed.taskHash].join("\u0000"))
          .digest("hex")
        const reservationID = EventV2.ID.make(`evt_maestro_approval_reserved_${reservationHash}`)
        const childSessionID = SessionID.make(`ses_maestro_approval_${reservationHash}`)
        if (params.task_id && params.task_id !== childSessionID) {
          return yield* Effect.fail(new Error("Governed Task denied: reservation-child-mismatch"))
        }
        const reservation = {
          sessionID: governed.sessionID,
          presentationID: approvedDecision.presentationID,
          approvalMessageID: governed.approvalMessageID,
          projectID: governed.projectID,
          memberID: governed.memberID,
          planRevisionID: governed.planRevisionID,
          validationRecordID: governed.validationRecordID,
          revisionHash: governed.revisionHash,
          validationHash: governed.validationHash,
          contextHash: governed.contextHash,
          policyHash: governed.policyHash,
          taskHash: governed.taskHash,
          callID,
          childSessionID,
          parentSessionID: ctx.sessionID,
          agent: nextID,
          permission: childPermissions,
        }
        const existingReservation = yield* database.db
          .select({ data: EventTable.data, type: EventTable.type })
          .from(EventTable)
          .where(eq(EventTable.id, reservationID))
          .get()
          .pipe(Effect.orDie)
        if (existingReservation) {
          if (existingReservation.type !== EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2)) {
            return yield* Effect.fail(new Error("Governed Task denied: reservation-missing-permission-snapshot"))
          }
          const existing = Schema.decodeUnknownSync(MaestroEvent.Approval.ReservedV2.data)(existingReservation.data)
          if (
            existing.sessionID !== reservation.sessionID ||
            existing.presentationID !== reservation.presentationID ||
            existing.approvalMessageID !== reservation.approvalMessageID ||
            existing.projectID !== reservation.projectID ||
            existing.memberID !== reservation.memberID ||
            existing.planRevisionID !== reservation.planRevisionID ||
            existing.validationRecordID !== reservation.validationRecordID ||
            existing.revisionHash !== reservation.revisionHash ||
            existing.validationHash !== reservation.validationHash ||
            existing.contextHash !== reservation.contextHash ||
            existing.policyHash !== reservation.policyHash ||
            existing.taskHash !== reservation.taskHash ||
            existing.callID !== reservation.callID ||
            existing.childSessionID !== reservation.childSessionID ||
            existing.parentSessionID !== reservation.parentSessionID ||
            existing.agent !== reservation.agent
          ) {
            return yield* Effect.fail(new Error("Governed Task denied: reservation-binding-mismatch"))
          }
          reservedChildPermissions = existing.permission
        } else {
          yield* events.publish(MaestroEvent.Approval.ReservedV2, reservation, { id: reservationID }).pipe(
            Effect.catchCause(() =>
              database.db
                .select({ data: EventTable.data, type: EventTable.type })
                .from(EventTable)
                .where(eq(EventTable.id, reservationID))
                .get()
                .pipe(
                  Effect.orDie,
                  Effect.flatMap((event) => {
                    if (!event) return Effect.fail(new Error("Governed Task denied: reservation-hold"))
                    if (event.type !== EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2)) {
                      return Effect.fail(new Error("Governed Task denied: reservation-missing-permission-snapshot"))
                    }
                    const existing = Schema.decodeUnknownSync(MaestroEvent.Approval.ReservedV2.data)(event.data)
                    if (
                      existing.sessionID !== reservation.sessionID ||
                      existing.presentationID !== reservation.presentationID ||
                      existing.approvalMessageID !== reservation.approvalMessageID ||
                      existing.projectID !== reservation.projectID ||
                      existing.memberID !== reservation.memberID ||
                      existing.planRevisionID !== reservation.planRevisionID ||
                      existing.validationRecordID !== reservation.validationRecordID ||
                      existing.revisionHash !== reservation.revisionHash ||
                      existing.validationHash !== reservation.validationHash ||
                      existing.contextHash !== reservation.contextHash ||
                      existing.policyHash !== reservation.policyHash ||
                      existing.taskHash !== reservation.taskHash ||
                      existing.callID !== reservation.callID ||
                      existing.childSessionID !== reservation.childSessionID ||
                      existing.parentSessionID !== reservation.parentSessionID ||
                      existing.agent !== reservation.agent
                    ) {
                      return Effect.fail(new Error("Governed Task denied: reservation-binding-mismatch"))
                    }
                    reservedChildPermissions = existing.permission
                    return Effect.void
                  }),
                ),
            ),
          )
          reservedChildPermissions = childPermissions
        }
        governedChildID = childSessionID
        governedPresentationID = approvedDecision.presentationID
        governedCallID = callID
        const consumeID = EventV2.ID.make(
          `evt_maestro_approval_consumed_${createHash("sha256")
            .update([governed.sessionID, approvedDecision.presentationID, governed.taskHash].join("\u0000"))
            .digest("hex")}`,
        )
        const existingReceipt = yield* database.db
          .select({ data: EventTable.data })
          .from(EventTable)
          .where(eq(EventTable.id, consumeID))
          .get()
          .pipe(Effect.orDie)
        if (existingReceipt) {
          const receipt = Schema.decodeUnknownSync(MaestroEvent.Approval.ConsumedV2.data)(existingReceipt.data)
          if (
            receipt.sessionID !== governed.sessionID ||
            receipt.presentationID !== approvedDecision.presentationID ||
            receipt.approvalMessageID !== governed.approvalMessageID ||
            receipt.taskHash !== governed.taskHash ||
            receipt.callID !== callID ||
            receipt.childSessionID !== childSessionID
          ) {
            return yield* Effect.fail(new Error("Governed Task denied: receipt-binding-mismatch"))
          }
          const child = yield* sessions.get(childSessionID).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
          if (!child) return yield* Effect.fail(new Error("Governed Task denied: consumed-child-missing"))
        }
      }
      let current = parent
      let depth = 0
      while (current.parentID) {
        depth++
        current = yield* sessions.get(current.parentID)
      }
      if (depth >= (cfg.subagent_depth ?? 1)) {
        return yield* Effect.fail(
          new Error(
            `Subagent depth limit reached (${cfg.subagent_depth ?? 1}). Increase "subagent_depth" to allow nested subagents.`,
          ),
        )
      }

      const msg = yield* MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }).pipe(
        Effect.provideService(Database.Service, database),
        Effect.orDie,
      )
      if (msg.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))
      const variant = msg.info.variant

      let explicitModel = false
      let model = next.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }
      if (params.model) {
        const parsed = Provider.parseModel(params.model)
        if (!parsed.providerID || !parsed.modelID) {
          return yield* Effect.fail(
            new Error(
              `Invalid model "${params.model}". Use the 'providerID/modelID' format, e.g. 'openrouter/deepseek/deepseek-chat'.`,
            ),
          )
        }
        explicitModel = true
        model = { modelID: parsed.modelID, providerID: parsed.providerID }
      }
      const modelPattern = `${model.providerID}/${model.modelID}`

      // Model-scoped task rules (written by the subagent-model picker panel)
      // look like { permission: "task", pattern: "openrouter/*", action }.
      // Only when the session carries them do we add the resolved model to
      // the ask patterns — otherwise behavior is exactly as before (no
      // extra prompt, no extra surface for the model to satisfy).
      const modelRules = (parent.permission ?? []).filter(
        (rule) => rule.permission === id && rule.pattern.includes("/"),
      )

      if (!ctx.extra?.bypassAgentCheck && !params.governed) {
        yield* ctx.ask({
          permission: id,
          patterns: modelRules.length > 0 ? [params.subagent_type, modelPattern] : [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
            ...(modelRules.length > 0 ? { model: modelPattern } : {}),
          },
        })
      }

      const reserved = governedChildID
        ? yield* sessions.get(governedChildID).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
      if (reserved && (reserved.parentID !== ctx.sessionID || reserved.agent !== nextID)) {
        return yield* Effect.fail(new Error("Governed Task denied: reservation-child-mismatch"))
      }
      const session = governedChildID ? reserved : resumed
      const permissionSnapshot = reservedChildPermissions
      if (
        reserved &&
        (!permissionSnapshot ||
          reserved.permission?.length !== permissionSnapshot.length ||
          reserved.permission?.some(
            (rule, index) =>
              rule.permission !== permissionSnapshot[index]?.permission ||
              rule.pattern !== permissionSnapshot[index]?.pattern ||
              rule.action !== permissionSnapshot[index]?.action,
          ))
      ) {
        return yield* Effect.fail(new Error("Governed Task denied: reservation-child-permission-mismatch"))
      }
      const nextSession =
        session ??
        (yield* sessions
          .create({
            id: governedChildID,
            parentID: ctx.sessionID,
            title: params.description + ` (@${next.name} subagent)`,
            agent: nextID,
            permission: governedChildID ? permissionSnapshot : childPermissions,
          })
          .pipe(
            Effect.catchCause(() => {
              if (!governedChildID) return Effect.die("Task child creation failed")
              return sessions
                .get(governedChildID)
                .pipe(Effect.catchCause(() => Effect.fail(new Error("Governed Task denied: reservation-child-hold"))))
            }),
          ))
      if (governedChildID && (nextSession.parentID !== ctx.sessionID || nextSession.agent !== nextID)) {
        return yield* Effect.fail(new Error("Governed Task denied: reservation-child-mismatch"))
      }

      if (params.governed) {
        const governed = params.governed
        if (!governedPresentationID || !governedChildID || !governedCallID)
          return yield* Effect.fail(new Error("Governed Task denied: reservation-hold"))
        const consumeID = EventV2.ID.make(
          `evt_maestro_approval_consumed_${createHash("sha256")
            .update([governed.sessionID, governedPresentationID, governed.taskHash].join("\u0000"))
            .digest("hex")}`,
        )
        const receipt = {
          sessionID: governed.sessionID,
          presentationID: governedPresentationID,
          approvalMessageID: governed.approvalMessageID,
          taskHash: governed.taskHash,
          callID: governedCallID,
          childSessionID: governedChildID,
        }
        yield* events.publish(MaestroEvent.Approval.ConsumedV2, receipt, { id: consumeID }).pipe(
          Effect.catchCause(() =>
            database.db
              .select({ data: EventTable.data })
              .from(EventTable)
              .where(eq(EventTable.id, consumeID))
              .get()
              .pipe(
                Effect.orDie,
                Effect.flatMap((event) => {
                  if (!event) return Effect.fail(new Error("Governed Task denied: receipt-hold"))
                  const existing = Schema.decodeUnknownSync(MaestroEvent.Approval.ConsumedV2.data)(event.data)
                  if (
                    existing.sessionID !== receipt.sessionID ||
                    existing.presentationID !== receipt.presentationID ||
                    existing.approvalMessageID !== receipt.approvalMessageID ||
                    existing.taskHash !== receipt.taskHash ||
                    existing.callID !== receipt.callID ||
                    existing.childSessionID !== receipt.childSessionID
                  ) {
                    return Effect.fail(new Error("Governed Task denied: receipt-binding-mismatch"))
                  }
                  return Effect.void
                }),
              ),
          ),
        )
      }

      const metadata = {
        parentSessionId: ctx.sessionID,
        sessionId: nextSession.id,
        model,
        ...(runInBackground ? { background: true } : {}),
      }

      yield* ctx.metadata({
        title: params.description,
        metadata,
      })

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))

      const runTask = Effect.fn("TaskTool.runTask")(function* () {
        const parts = yield* ops.resolvePromptParts(params.prompt)
        const result = yield* ops.prompt({
          messageID: MessageID.ascending(),
          sessionID: nextSession.id,
          model: {
            modelID: model.modelID,
            providerID: model.providerID,
          },
          variant: next.model || explicitModel ? undefined : variant,
          agent: nextID,
          parts,
        })
        if (result.info.role === "assistant" && result.info.error) {
          const message =
            "message" in result.info.error.data && typeof result.info.error.data.message === "string"
              ? result.info.error.data.message
              : result.info.error.name
          return yield* Effect.fail(new Error(`Subagent failed (task_id: ${nextSession.id}): ${message}`))
        }
        const failed = result.parts.findLast((item) => item.type === "tool" && item.state.status === "error")
        if (failed?.type === "tool" && failed.state.status === "error") {
          return yield* Effect.fail(new Error(`Subagent failed (task_id: ${nextSession.id}): ${failed.state.error}`))
        }
        return result.parts.findLast((item) => item.type === "text")?.text ?? ""
      })

      const inject = Effect.fn("TaskTool.injectBackgroundResult")(function* (
        state: "completed" | "error",
        text: string,
      ) {
        const currentParent = yield* sessions.get(ctx.sessionID)
        yield* ops
          .prompt({
            sessionID: ctx.sessionID,
            agent: currentParent.agent ?? ctx.agent,
            variant,
            parts: [
              {
                type: "text",
                synthetic: true,
                text: renderOutput({
                  sessionID: nextSession.id,
                  state,
                  summary:
                    state === "completed"
                      ? `Background task completed: ${params.description}`
                      : `Background task failed: ${params.description}`,
                  text,
                }),
              },
            ],
          })
          .pipe(Effect.ignore, Effect.forkIn(scope, { startImmediately: true }))
      })

      const notify = Effect.fn("TaskTool.notifyBackgroundResult")(function* (jobID: string) {
        yield* background.wait({ id: jobID }).pipe(
          Effect.flatMap((result) => {
            if (result.info?.status === "completed") return inject("completed", result.info.output ?? "")
            if (result.info?.status === "error") return inject("error", result.info.error ?? "")
            return Effect.void
          }),
          Effect.forkIn(scope, { startImmediately: true }),
        )
      })

      if (yield* background.extend({ id: nextSession.id, run: runTask() })) {
        return {
          title: params.description,
          metadata: {
            ...metadata,
            background: true,
            jobId: nextSession.id,
          },
          output: renderOutput({
            sessionID: nextSession.id,
            state: "running",
            summary: "Background task updated",
            text: BACKGROUND_UPDATED,
          }),
        }
      }

      const info = yield* background.start({
        id: nextSession.id,
        type: id,
        title: params.description,
        metadata,
        onPromote: Effect.all([
          ctx.metadata({
            title: params.description,
            metadata: { ...metadata, background: true, jobId: nextSession.id },
          }),
          notify(nextSession.id),
        ]),
        run: runTask().pipe(Effect.onInterrupt(() => ops.cancel(nextSession.id))),
      })

      function backgroundResult() {
        return {
          title: params.description,
          metadata: {
            ...metadata,
            background: true,
            jobId: info.id,
          },
          output: renderOutput({
            sessionID: nextSession.id,
            state: "running",
            summary: "Background task started",
            text: BACKGROUND_STARTED,
          }),
        }
      }

      if (runInBackground) {
        yield* notify(info.id)
        return backgroundResult()
      }

      const runCancel = yield* EffectBridge.make()
      const cancel = ops.cancel(nextSession.id)

      function onAbort() {
        runCancel.fork(cancel)
      }

      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          ctx.abort.addEventListener("abort", onAbort)
        }),
        () =>
          Effect.gen(function* () {
            const result = yield* Effect.raceFirst(
              background.wait({ id: nextSession.id }).pipe(Effect.map((waited) => waited.info)),
              background.waitForPromotion(nextSession.id),
            )
            if (result?.metadata?.background === true) return backgroundResult()
            if (result?.status === "error") return yield* Effect.fail(new Error(result.error ?? "Task failed"))
            if (result?.status === "cancelled") return yield* Effect.fail(new Error("Task cancelled"))
            return {
              title: params.description,
              metadata,
              output: renderOutput({ sessionID: nextSession.id, state: "completed", text: result?.output ?? "" }),
            }
          }),
        (_, exit) =>
          Effect.gen(function* () {
            if (Exit.hasInterrupts(exit))
              yield* Effect.all([cancel, background.cancel(nextSession.id)], { discard: true })
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                ctx.abort.removeEventListener("abort", onAbort)
              }),
            ),
          ),
      )
    })

    return {
      description: flags.experimentalBackgroundSubagents
        ? [DESCRIPTION, BACKGROUND_DESCRIPTION].join("\n\n")
        : DESCRIPTION,
      parameters: Parameters,
      jsonSchema: flags.experimentalBackgroundSubagents ? undefined : ToolJsonSchema.fromSchema(BaseParameters),
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
