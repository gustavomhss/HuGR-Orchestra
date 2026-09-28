import { Agent } from "../agent/agent"
import { deriveSubagentSessionPermission } from "../agent/subagent-permissions"
import { Session } from "../session/session"
import { SessionID } from "../session/schema"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"

export function childPermissions(input: { parent: Session.Info; next: Agent.Info; primaryTools?: string[] }) {
  const inherited = deriveSubagentSessionPermission({
    parentSessionPermission: input.parent.permission ?? [],
    subagent: input.next,
  })
  const denies = [
    ...(input.next.permission.some((rule) => rule.permission === "todowrite")
      ? []
      : [{ permission: "todowrite" as const, pattern: "*" as const, action: "deny" as const }]),
    ...(input.next.permission.some((rule) => rule.permission === "task")
      ? []
      : [{ permission: "task" as const, pattern: "*" as const, action: "deny" as const }]),
    ...(input.primaryTools?.map((permission) => ({ permission, pattern: "*" as const, action: "deny" as const })) ??
      []),
  ]
  return [
    ...inherited,
    ...denies.filter(
      (deny) =>
        !inherited.some(
          (rule) => rule.permission === deny.permission && rule.pattern === deny.pattern && rule.action === deny.action,
        ),
    ),
  ]
}

export const consume = Effect.fn("MaestroGovernedTaskReservation.consume")(function* (input: {
  governed: {
    sessionID: string
    approvalMessageID: string
    taskHash: string
  }
  presentationID: string
  childSessionID: SessionID
  callID: string
  database: Database.Interface
  events: EventV2.Interface
}) {
  const id = EventV2.ID.make(
    `evt_maestro_approval_consumed_${createHash("sha256")
      .update([input.governed.sessionID, input.presentationID, input.governed.taskHash].join("\u0000"))
      .digest("hex")}`,
  )
  const receipt = {
    sessionID: input.governed.sessionID,
    presentationID: input.presentationID,
    approvalMessageID: input.governed.approvalMessageID,
    taskHash: input.governed.taskHash,
    callID: input.callID,
    childSessionID: input.childSessionID,
  }
  yield* input.events.publish(MaestroEvent.Approval.ConsumedV2, receipt, { id }).pipe(
    Effect.catchCause(() =>
      input.database.db
        .select({ data: EventTable.data })
        .from(EventTable)
        .where(eq(EventTable.id, id))
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
})

export * as GovernedTaskReservation from "./governed-task-reservation"
