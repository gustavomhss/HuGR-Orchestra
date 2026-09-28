import { lookupRosterMember } from "./roster"

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
  if (hasAuthorTranscript(input)) return { status: "HOLD", reason: "transcript-forbidden" }
  if (!validCard(input)) return { status: "HOLD", reason: "invalid-card" }
  const author = lookupRosterMember(input.authorId)
  if (author.status === "HOLD") return { status: "HOLD", reason: "invalid-card" }
  const reviewer = lookupRosterMember(input.reviewerId)
  if (reviewer.status === "HOLD" || reviewer.member.memberId !== "lucy") {
    return { status: "HOLD", reason: "reviewer-not-lucy" }
  }
  if (input.authorId === input.reviewerId) return { status: "HOLD", reason: "self-review" }

  const card = canonicalCard(input)
  const prior = records.filter((record) => record.id === input.id)
  if (prior.length === 0) return { status: "RECORDED", card: freezeCard(card) }
  const priorCard = prior.length === 1 ? canonicalCard(prior[0]!) : undefined
  if (priorCard && canonicalJSON(priorCard) === canonicalJSON(card)) {
    return { status: "RECORDED", card: freezeCard(priorCard) }
  }
  return { status: "HOLD", reason: "review-id-collision" }
}

function validCard(input: unknown): input is ReviewCard {
  if (!record(input, ["id", "authorId", "reviewerId", "contract", "diff", "checks", "outcome", "findings"]))
    return false
  if (![input.id, input.authorId, input.reviewerId, input.contract, input.diff].every(nonempty)) return false
  if (input.outcome !== "APPROVE" && input.outcome !== "FIX_FIRST" && input.outcome !== "REJECT") return false
  const checks = input.checks
  if (!validChecks(checks)) return false
  if (new Set(checks.map((check) => check.name)).size !== checks.length) return false
  if (!Array.isArray(input.findings) || !input.findings.every((finding) => validFinding(finding, checks))) return false
  if (input.outcome === "APPROVE")
    return checks.every((check) => check.outcome === "PASS") && input.findings.length === 0
  return checks.some((check) => check.outcome === "FAIL") || input.findings.length > 0
}

function validChecks(input: unknown): input is ReviewCheck[] {
  return Array.isArray(input) && input.length > 0 && input.every(validCheck)
}

function validCheck(input: unknown): input is ReviewCheck {
  return (
    record(input, ["name", "outcome", "evidence"]) &&
    nonempty(input.name) &&
    nonempty(input.evidence) &&
    (input.outcome === "PASS" || input.outcome === "FAIL")
  )
}

function validFinding(input: unknown, checks: readonly ReviewCheck[]): input is ReviewFinding {
  return (
    record(input, ["citation", "detail"]) &&
    nonempty(input.detail) &&
    typeof input.citation === "string" &&
    new Set(["contract", "diff", ...checks.map((check) => `check:${check.name}`)]).has(input.citation)
  )
}

function record(input: unknown, keys: readonly string[]): input is Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false
  if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) return false
  const inputKeys = Reflect.ownKeys(input)
  return inputKeys.length === keys.length && inputKeys.every((key) => typeof key === "string" && keys.includes(key))
}

function nonempty(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0
}

function hasAuthorTranscript(input: unknown) {
  return (
    input !== null && typeof input === "object" && !Array.isArray(input) && Object.hasOwn(input, "authorTranscript")
  )
}

function canonicalCard(card: ReviewCard): ReviewCard {
  return {
    ...card,
    checks: [...card.checks].sort((left, right) => left.name.localeCompare(right.name)),
    findings: [...card.findings].sort(
      (left, right) => left.citation.localeCompare(right.citation) || left.detail.localeCompare(right.detail),
    ),
  }
}

function canonicalJSON(input: unknown): string {
  if (input === null || typeof input === "boolean" || typeof input === "number" || typeof input === "string") {
    return JSON.stringify(input)
  }
  if (Array.isArray(input)) return `[${input.map(canonicalJSON).join(",")}]`
  if (input === undefined || typeof input !== "object") throw new Error("Review card must contain JSON values")
  const object = input as Record<string, unknown>
  return `{${Object.keys(object)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${canonicalJSON(object[key])}`)
    .join(",")}}`
}

function freezeCard(card: ReviewCard): ReviewCard {
  return Object.freeze({
    ...card,
    checks: Object.freeze(card.checks.map((check) => Object.freeze({ ...check }))),
    findings: Object.freeze(card.findings.map((finding) => Object.freeze({ ...finding }))),
  })
}
