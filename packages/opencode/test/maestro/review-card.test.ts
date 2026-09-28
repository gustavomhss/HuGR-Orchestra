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
  findings: [],
}

describe("Maestro artifact review cards", () => {
  test("records immutable Lucy receipt for each allowed outcome", () => {
    for (const input of [
      card,
      {
        ...card,
        id: "review_fix",
        outcome: "FIX_FIRST" as const,
        findings: [{ citation: "diff", detail: "Missing edge case." }],
      },
      {
        ...card,
        id: "review_reject",
        outcome: "REJECT" as const,
        checks: [{ ...card.checks[0]!, outcome: "FAIL" as const }],
      },
    ]) {
      const result = recordReviewCard(input)

      expect(result.status).toBe("RECORDED")
      if (result.status !== "RECORDED") throw new Error("expected recorded card")
      expect(result.card).toEqual(input)
      expect(Object.isFrozen(result.card)).toBe(true)
      expect(Object.isFrozen(result.card.checks)).toBe(true)
      expect(Object.isFrozen(result.card.checks[0]!)).toBe(true)
      expect(Object.isFrozen(result.card.findings)).toBe(true)
      expect(result.card.findings.every(Object.isFrozen)).toBe(true)
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
    expect(recordReviewCard({ ...card, findings: [{ citation: "", detail: "Missing source." }] })).toEqual({
      status: "HOLD",
      reason: "invalid-card",
    })
    expect(
      recordReviewCard({
        ...card,
        outcome: "FIX_FIRST",
        findings: [{ citation: "review-card", detail: "Unknown source." }],
      }),
    ).toEqual({
      status: "HOLD",
      reason: "invalid-card",
    })
    expect(recordReviewCard({ ...card, authorId: "unknown" })).toEqual({ status: "HOLD", reason: "invalid-card" })
  })

  test("denies non-Lucy and self-review routes", () => {
    expect(recordReviewCard({ ...card, reviewerId: "bobby" })).toEqual({ status: "HOLD", reason: "reviewer-not-lucy" })
    expect(recordReviewCard({ ...card, authorId: "lucy" })).toEqual({ status: "HOLD", reason: "self-review" })
  })

  test("keeps transcript closed by schema without inspecting artifact text", () => {
    expect(recordReviewCard({ ...card, authorTranscript: "private reasoning" })).toEqual({
      status: "HOLD",
      reason: "transcript-forbidden",
    })
    expect(recordReviewCard({ ...card, contract: "Transcript handling changes nowhere." })).toMatchObject({
      status: "RECORDED",
    })
  })

  test("requires outcome evidence and exact artifact citations", () => {
    expect(recordReviewCard({ ...card, checks: [{ ...card.checks[0]!, outcome: "FAIL" }] })).toEqual({
      status: "HOLD",
      reason: "invalid-card",
    })
    expect(recordReviewCard({ ...card, findings: [{ citation: "contract", detail: "Finding." }] })).toEqual({
      status: "HOLD",
      reason: "invalid-card",
    })
    expect(recordReviewCard({ ...card, outcome: "FIX_FIRST", findings: [] })).toEqual({
      status: "HOLD",
      reason: "invalid-card",
    })
    expect(
      recordReviewCard({ ...card, outcome: "REJECT", findings: [{ citation: "check:unit", detail: "Finding." }] }),
    ).toMatchObject({
      status: "RECORDED",
    })
  })

  test("canonicalizes reordered retry and holds identity collision", () => {
    const input = {
      ...card,
      outcome: "FIX_FIRST" as const,
      checks: [
        { name: "zebra", outcome: "FAIL" as const, evidence: "zebra failed" },
        { name: "alpha", outcome: "PASS" as const, evidence: "alpha passed" },
      ],
      findings: [
        { citation: "diff", detail: "Second." },
        { citation: "check:zebra", detail: "First." },
      ],
    }
    const first = recordReviewCard(input)
    if (first.status !== "RECORDED") throw new Error("expected recorded card")

    expect(first.card.checks.map((check) => check.name)).toEqual(["alpha", "zebra"])
    expect(first.card.findings.map((finding) => finding.citation)).toEqual(["check:zebra", "diff"])
    expect(
      recordReviewCard({ ...input, checks: [...input.checks].reverse(), findings: [...input.findings].reverse() }, [
        first.card,
      ]),
    ).toEqual(first)
    expect(recordReviewCard({ ...input, diff: "different diff" }, [first.card])).toEqual({
      status: "HOLD",
      reason: "review-id-collision",
    })
  })
})
