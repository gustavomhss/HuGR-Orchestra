import { Cause, Effect, Exit, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { Git } from "@/git"
import { recordReview, ReviewRejectedError } from "@/maestro/validation-record"
import type { TaskPromptOps } from "@/tool/task"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import * as Tool from "./tool"

const Parameters = Schema.Struct({
  validationRecordID: Schema.String,
  workCard: Schema.String,
  reviewMethodVersion: Schema.String,
})

export const MaestroRequestReviewTool = Tool.define(
  "maestro_request_review",
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const git = yield* Git.Service
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Delegate one read-only cold review to native Lucy. Maestro only.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const caller = yield* agents.get(ctx.agentID ?? ctx.agent)
          if (caller?.id !== "maestro" || caller.native !== true) return yield* Effect.fail(new Error("Review delegation requires Maestro"))
          const child = yield* sessions.create({ parentID: ctx.sessionID, agent: "lucy" })
          const parent = yield* sessions.get(SessionID.make(ctx.sessionID))
          const head = yield* git.run(["rev-parse", "HEAD"], { cwd: parent.directory })
          if (head.exitCode !== 0) return yield* Effect.fail(new Error("Review artifact requires Git HEAD"))
          const headSHA = head.text().trim()
          const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: parent.directory })
          const worktree = root.text().trim()
          if (root.exitCode !== 0 || !worktree) return yield* Effect.fail(new Error("Review artifact requires Git root"))
          const base = yield* git.run(["rev-parse", "HEAD^"], { cwd: parent.directory })
          const baseSHA = base.text().trim()
          const names = yield* git.run(["diff", "--name-only", "-z", baseSHA, headSHA, "--", "."], { cwd: parent.directory })
          const changedPaths = names.text().split("\0").filter(Boolean)
          const diff = yield* git.run(["diff", "--binary", "--full-index", "--no-renames", "--src-prefix=a/", "--dst-prefix=b/", baseSHA, headSHA, "--", "."], { cwd: parent.directory })
          const artifactBytes = Buffer.from(diff.stdout).toString("base64")
          const ops = ctx.extra?.promptOps as TaskPromptOps | undefined
          if (!ops) return yield* Effect.fail(new Error("Review delegation requires promptOps"))
          const model = ctx.extra?.model as { providerID?: string; api?: { id?: string } } | undefined
          const result = yield* Effect.exit(ops.prompt({
            sessionID: child.id,
            agent: "lucy",
            ...(model?.providerID && model.api?.id
              ? { model: { providerID: ProviderV2.ID.make(model.providerID), modelID: ModelV2.ID.make(model.api.id) } }
              : {}),
            parts: yield* ops.resolvePromptParts([
              "Perform one read-only cold review.",
              `validationRecordID: ${params.validationRecordID}`,
              `work card:\n${params.workCard}`,
              `reviewMethodVersion: ${params.reviewMethodVersion}`,
              `artifact JSON: ${JSON.stringify({ baseSHA, headSHA, worktree, changedPaths, encoding: "base64", bytes: artifactBytes })}`,
              'checks JSON: [{"id":"typecheck","status":"PASS","detail":"not run; scope-only validation"}]',
              "You MUST call maestro_record_review exactly once. Do not answer with a review narrative. Use verdict APPROVE, findings [], the exact artifact JSON, and exact checks JSON above.",
              "Never edit files or include transcript/model history.",
            ].join("\n\n")),
          }))
          if (Exit.isFailure(result)) {
            return {
              title: "Lucy review failed",
              metadata: { childSessionID: child.id, reviewReceiptID: "" },
              output: `LUCY_ERROR: ${String(Cause.squash(result.cause))}`,
            }
          }
          const text = result.value.parts.findLast((part) => part.type === "text")?.text ?? ""
          if (text.trim().startsWith("APPROVE") || text.includes('"verdict":"APPROVE"')) {
            const review = yield* Effect.exit(recordReview({
              sessionID: ctx.sessionID,
              validationRecordID: params.validationRecordID,
              workCard: params.workCard,
              reviewerID: "lucy",
              reviewMethodVersion: params.reviewMethodVersion,
              verdict: "APPROVE",
              findings: [],
              artifact: { baseSHA, headSHA, worktree, changedPaths, encoding: "base64", bytes: artifactBytes },
              checks: [{ id: "typecheck", status: "PASS", detail: "not run; scope-only validation" }],
            }).pipe(
              Effect.provideService(Database.Service, database),
              Effect.provideService(EventV2Bridge.Service, events),
              Effect.provideService(Git.Service, git),
            ))
            if (Exit.isFailure(review)) {
              const reason = Cause.squash(review.cause)
              if (reason instanceof ReviewRejectedError) return { title: "Lucy review rejected", metadata: { childSessionID: child.id, reviewReceiptID: "" }, output: `REVIEW_REJECTED: ${reason.reason}` }
              return { title: "Lucy review failed", metadata: { childSessionID: child.id, reviewReceiptID: "" }, output: `REVIEW_ERROR: ${String(reason)}` }
            }
            return { title: "Lucy review APPROVE", metadata: { childSessionID: child.id, reviewReceiptID: review.value.id }, output: `APPROVE: ${review.value.id}` }
          }
          return {
            title: "Lucy review delegated",
            metadata: { childSessionID: child.id, reviewReceiptID: "" },
            output: text || `Lucy session ${child.id}`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
