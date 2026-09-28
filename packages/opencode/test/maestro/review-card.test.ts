import { describe, expect, test } from "bun:test"
import { recordReviewCard, type ReviewCard } from "../../src/maestro/review-card"

const card: ReviewCard = {
  id: "review_01",
  authorId: "charlie",
  reviewerId: "lucy",
  contract: "Only packages/opencode/src/maestro/review-card.ts changes.",
  diff: "diff --git a/review-card.ts b/review-card.ts",
  checks: [{ name: "unit", outcome: "PASS", evidence: "bun test test/maestro/review-card.test.ts" }],
  outcome: "APPROVE",
  findings: [{ citation: "review-card.ts:1", detail: "Artifact boundary preserved." }],
}

describe("Maestro artifact review cards", () => {
  test("records immutable Lucy receipt for each allowed outcome", () => {
    for (const outcome of ["APPROVE", "FIX_FIRST", "REJECT"] as const) {
      const result = recordReviewCard({ ...card, id: `review_${outcome}`, outcome })

      expect(result.status).toBe("RECORDED")
      if (result.status !== "RECORDED") throw new Error("expected recorded card")
      expect(result.card).toEqual({ ...card, id: `review_${outcome}`, outcome })
      expect(Object.isFrozen(result.card)).toBe(true)
      expect(Object.isFrozen(result.card.checks)).toBe(true)
      expect(Object.isFrozen(result.card.checks[0]!)).toBe(true)
      expect(Object.isFrozen(result.card.findings)).toBe(true)
      expect(Object.isFrozen(result.card.findings[0]!)).toBe(true)
    }
  })

  test("holds malformed cards and absent artifact evidence", () => {
    expect(recordReviewCard({ ...card, contract: "" })).toEqual({ status: "HOLD", reason: "invalid-card" })
    expect(recordReviewCard({ ...card, diff: "" })).toEqual({ status: "HOLD", reason: "invalid-card" })
    expect(recordReviewCard({ ...card, checks: [] })).toEqual({ status: "HOLD", reason: "invalid-card" })
    expect(recordReviewCard({ ...card, checks: [{ ...card.checks[0]!, evidence: "" }] })).toEqual({
      status: "HOLD",
      reason: "invalid-card",
    })
    expect(recordReviewCard({ ...card, findings: [] })).toEqual({ status: "HOLD", reason: "invalid-card" })
    expect(recordReviewCard({ ...card, findings: [{ citation: "", detail: "Missing source." }] })).toEqual({
      status: "HOLD",
      reason: "invalid-card",
    })
    expect(recordReviewCard({ ...card, findings: [{ citation: "review-card", detail: "Missing line." }] })).toEqual({
      status: "HOLD",
      reason: "invalid-card",
    })
  })

  test("denies non-Lucy and self-review routes", () => {
    expect(recordReviewCard({ ...card, reviewerId: "bobby" })).toEqual({ status: "HOLD", reason: "reviewer-not-lucy" })
    expect(recordReviewCard({ ...card, authorId: "lucy" })).toEqual({ status: "HOLD", reason: "self-review" })
  })

  test("mutation probe: transcript key never reaches reviewer", () => {
    expect(recordReviewCard({ ...card, authorTranscript: "private reasoning" })).toEqual({
      status: "HOLD",
      reason: "transcript-forbidden",
    })
    expect(recordReviewCard({ ...card, checks: [{ ...card.checks[0]!, transcriptEvidence: "private reasoning" }] })).toEqual({
      status: "HOLD",
      reason: "transcript-forbidden",
    })
  })

  test("replays byte-identical receipt and holds identity collision", () => {
    const first = recordReviewCard(card)
    if (first.status !== "RECORDED") throw new Error("expected recorded card")

    expect(recordReviewCard(card, [first.card])).toEqual(first)
    expect(recordReviewCard({ ...card, diff: "different diff" }, [first.card])).toEqual({
      status: "HOLD",
      reason: "review-id-collision",
    })
    expect(recordReviewCard({ ...card, contract: "other", diff: "different diff" }, [first.card])).toEqual({
      status: "HOLD",
      reason: "review-id-collision",
    })
  })
})
