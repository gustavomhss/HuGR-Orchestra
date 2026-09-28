import { afterEach, describe, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventTable } from "@opencode-ai/core/event/sql"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import {
  readValidation,
  recordReview,
  recordValidation,
  verifyValidation,
} from "../../src/maestro/validation-record"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(LayerNode.compile(LayerNode.group([Database.node, EventV2Bridge.node])))

const input = {
  sessionID: "ses_validation",
  projectID: "prj_validation",
  workCardID: "card_01",
  workCard: "Implement dark mode.\nVerify contrast.",
  routedMemberID: "general",
  validatorID: "maestro",
  validatorVersion: "validate-plan-v1",
  checks: [
    { id: "card", status: "PASS" as const, detail: "Card has scope." },
    { id: "route", status: "PASS" as const, detail: "Route is granted." },
  ],
  outcome: "VALID" as const,
}

describe("Maestro validation record", () => {
  it.instance("persists EventV2 SQLite receipt, reads it, and replays exactly", () =>
    Effect.gen(function* () {
      const first = yield* recordValidation(input)
      const replay = yield* recordValidation(input)
      const stored = yield* readValidation({ sessionID: input.sessionID, recordID: first.id })
      const verified = yield* verifyValidation({ sessionID: input.sessionID, recordID: first.id, workCard: input.workCard })
      const { db } = yield* Database.Service
      const row = yield* db.select().from(EventTable).where(eq(EventTable.id, first.id)).get().pipe(Effect.orDie)

      expect(first.workCardHash).toHaveLength(64)
      expect(replay).toEqual(first)
      expect(stored).toEqual(first)
      expect(verified.status).toBe("VALID")
      expect(row?.aggregate_id).toBe(input.sessionID)
      expect(row?.type).toBe("maestro.validation.recorded.1")
    }),
  )

  it.instance("refuses malformed card/check and invalid route authority", () =>
    Effect.gen(function* () {
      const malformed = yield* recordValidation({ ...input, workCard: "" }).pipe(Effect.flip)
      const malformedCheck = yield* recordValidation({ ...input, checks: [{ id: "", status: "PASS", detail: "x" }] }).pipe(
        Effect.flip,
      )
      const unknown = yield* recordValidation({ ...input, routedMemberID: "unknown" }).pipe(Effect.flip)
      const maestro = yield* recordValidation({ ...input, routedMemberID: "maestro" }).pipe(Effect.flip)
      const nonRoute = yield* recordValidation({ ...input, routedMemberID: "lucy" }).pipe(Effect.flip)

      expect(malformed._tag).toBe("MaestroValidationRejected")
      expect(malformedCheck._tag).toBe("MaestroValidationRejected")
      if (unknown._tag !== "MaestroValidationRejected") throw new Error("expected rejected unknown member")
      if (maestro._tag !== "MaestroValidationRejected") throw new Error("expected rejected Maestro member")
      if (nonRoute._tag !== "MaestroValidationRejected") throw new Error("expected rejected non-route member")
      expect(unknown.reason).toBe("member-unknown")
      expect(maestro.reason).toBe("member-maestro")
      expect(nonRoute.reason).toBe("member-not-routed")
    }),
  )

  it.instance("holds mismatched work card and conflicts changed replay", () =>
    Effect.gen(function* () {
      const record = yield* recordValidation(input)
      const mismatch = yield* verifyValidation({ sessionID: input.sessionID, recordID: record.id, workCard: "changed" })
      const conflict = yield* recordValidation({ ...input, outcome: "HOLD" }).pipe(Effect.flip)

      expect(mismatch).toEqual({ status: "HOLD", reason: "work-card-mismatch" })
      expect(conflict._tag).toBe("MaestroValidationConflict")
    }),
  )

  it.instance("binds review to validation card and requires review evidence", () =>
    Effect.gen(function* () {
      const record = yield* recordValidation(input)
      const review = yield* recordReview({
        sessionID: input.sessionID,
        validationRecordID: record.id,
        workCard: input.workCard,
        reviewerID: "lucy",
        verdict: "FIX_FIRST",
        findings: [{ path: "src/theme.ts", line: 8, message: "Missing contrast check." }],
      })
      const cardMismatch = yield* recordReview({
        sessionID: input.sessionID,
        validationRecordID: record.id,
        workCard: "changed",
        reviewerID: "lucy",
        verdict: "APPROVE",
        findings: [],
      }).pipe(Effect.flip)
      const emptyFindings = yield* recordReview({
        sessionID: input.sessionID,
        validationRecordID: record.id,
        workCard: input.workCard,
        reviewerID: "lucy",
        verdict: "REJECT",
        findings: [],
      }).pipe(Effect.flip)
      const selfReviewer = yield* recordReview({
        sessionID: input.sessionID,
        validationRecordID: record.id,
        workCard: input.workCard,
        reviewerID: "general",
        verdict: "APPROVE",
        findings: [],
      }).pipe(Effect.flip)
      const reviewConflict = yield* recordReview({
        sessionID: input.sessionID,
        validationRecordID: record.id,
        workCard: input.workCard,
        reviewerID: "lucy",
        verdict: "REJECT",
        findings: [{ path: "src/theme.ts", line: 8, message: "Contrast still missing." }],
      }).pipe(Effect.flip)

      expect(review.workCardHash).toBe(record.workCardHash)
      if (cardMismatch._tag !== "MaestroValidationRejected") throw new Error("expected rejected card mismatch")
      if (emptyFindings._tag !== "MaestroValidationRejected") throw new Error("expected rejected empty findings")
      if (selfReviewer._tag !== "MaestroValidationRejected") throw new Error("expected rejected self review")
      expect(cardMismatch.reason).toBe("work-card-mismatch")
      expect(emptyFindings.reason).toBe("review-findings-required")
      expect(selfReviewer.reason).toBe("reviewer-self")
      expect(reviewConflict._tag).toBe("MaestroReviewConflict")
    }),
  )
})
