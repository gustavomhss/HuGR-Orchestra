export type ReviewCheck = {
  name: string
  outcome: "PASS" | "FAIL"
  evidence: string
}

export type ReviewFinding = {
  citation: string
  detail: string
}

export type ReviewCard = {
  id: string
  authorId: string
  reviewerId: "lucy"
  contract: string
  diff: string
  checks: readonly ReviewCheck[]
  outcome: "APPROVE" | "FIX_FIRST" | "REJECT"
  findings: readonly ReviewFinding[]
}

export type ReviewCardResult =
  | { status: "RECORDED"; card: ReviewCard }
  | {
      status: "HOLD"
      reason: "invalid-card" | "transcript-forbidden" | "reviewer-not-lucy" | "self-review" | "review-id-collision"
    }

export function recordReviewCard(input: unknown, records: readonly ReviewCard[] = []): ReviewCardResult {
  if (hasTranscriptKey(input)) return { status: "HOLD", reason: "transcript-forbidden" }
  if (!validCard(input)) return { status: "HOLD", reason: "invalid-card" }
  if (input.reviewerId !== "lucy") return { status: "HOLD", reason: "reviewer-not-lucy" }
  if (input.authorId === input.reviewerId) return { status: "HOLD", reason: "self-review" }

  const prior = records.filter((record) => record.id === input.id)
  if (prior.length === 0) return { status: "RECORDED", card: freezeCard(input) }
  if (prior.length === 1 && JSON.stringify(prior[0]) === JSON.stringify(input)) {
    return { status: "RECORDED", card: prior[0]! }
  }
  return { status: "HOLD", reason: "review-id-collision" }
}

function validCard(input: unknown): input is ReviewCard {
  if (!record(input, ["id", "authorId", "reviewerId", "contract", "diff", "checks", "outcome", "findings"])) return false
  if (![input.id, input.authorId, input.reviewerId, input.contract, input.diff].every(nonempty)) return false
  if (input.outcome !== "APPROVE" && input.outcome !== "FIX_FIRST" && input.outcome !== "REJECT") return false
  if (!Array.isArray(input.checks) || input.checks.length === 0 || !input.checks.every(validCheck)) return false
  if (!Array.isArray(input.findings) || input.findings.length === 0 || !input.findings.every(validFinding)) return false
  return true
}

function validCheck(input: unknown): input is ReviewCheck {
  return (
    record(input, ["name", "outcome", "evidence"]) &&
    nonempty(input.name) &&
    nonempty(input.evidence) &&
    (input.outcome === "PASS" || input.outcome === "FAIL")
  )
}

function validFinding(input: unknown): input is ReviewFinding {
  return record(input, ["citation", "detail"]) && citation(input.citation) && nonempty(input.detail)
}

function record(input: unknown, keys: readonly string[]): input is Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false
  const inputKeys = Object.keys(input)
  return inputKeys.length === keys.length && inputKeys.every((key) => keys.includes(key))
}

function nonempty(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0
}

function citation(input: unknown): input is string {
  return typeof input === "string" && /^.+:\d+(?::\d+)?$/.test(input)
}

function hasTranscriptKey(input: unknown): boolean {
  if (input === null || typeof input !== "object") return false
  if (Array.isArray(input)) return input.some(hasTranscriptKey)
  return Object.entries(input).some(([key, value]) => key.toLocaleLowerCase("en-US").includes("transcript") || hasTranscriptKey(value))
}

function freezeCard(card: ReviewCard): ReviewCard {
  return Object.freeze({
    ...card,
    checks: Object.freeze(card.checks.map((check) => Object.freeze({ ...check }))),
    findings: Object.freeze(card.findings.map((finding) => Object.freeze({ ...finding }))),
  })
}
