import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { createHash } from "node:crypto"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { eq } from "drizzle-orm"
import { Cause, Effect, Schema } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { lookupRouteGrant } from "./route-grant"
import { lookupRosterMember, nativeProfiles, roster, type RosterMember } from "./roster"

type Check = { id: string; status: "PASS" | "FAIL" | "HOLD"; detail: string }
type ValidationData = Schema.Schema.Type<typeof MaestroEvent.Validation.Recorded.data>
type ReviewData = Schema.Schema.Type<typeof MaestroEvent.Review.Received.data>

export type RecordValidationInput = {
  sessionID: string
  planRevisionID?: string
  contextRecordID?: string
  contextHash?: string
  projectID: string
  workCardID: string
  workCard: string
  routedMemberID: unknown
  validatorID: unknown
  validatorVersion: string
  checks: unknown
}

export type ValidationRecord = ValidationData & { id: string }

export type RecordReviewInput = {
  sessionID: string
  validationRecordID: string
  workCard: string
  reviewerID: unknown
  reviewMethodVersion: unknown
  verdict: unknown
  findings: unknown
  artifact: unknown
  checks: unknown
}

export type ReviewReceipt = ReviewData & { id: string }

export class ValidationRejectedError extends Schema.TaggedErrorClass<ValidationRejectedError>()(
  "MaestroValidationRejected",
  {
    reason: Schema.String,
  },
) {}

export class ValidationConflictError extends Schema.TaggedErrorClass<ValidationConflictError>()(
  "MaestroValidationConflict",
  {
    sessionID: Schema.String,
    workCardID: Schema.String,
  },
) {}

export class ReviewRejectedError extends Schema.TaggedErrorClass<ReviewRejectedError>()("MaestroReviewRejected", {
  reason: Schema.String,
}) {}

export class ReviewConflictError extends Schema.TaggedErrorClass<ReviewConflictError>()("MaestroReviewConflict", {
  sessionID: Schema.String,
  validationRecordID: Schema.String,
}) {}

function hash(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex")
}

export function validationRecordHash(record: ValidationData) {
  return hash(record)
}

function cardHash(workCard: string) {
  return createHash("sha256").update(workCard, "utf8").digest("hex")
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export function reviewPolicyHash(reviewer: RosterMember, profile: unknown) {
  return hash({ version: "maestro-review-policy-v1", reviewer, profile })
}

function validationEventID(input: Pick<RecordValidationInput, "sessionID" | "workCardID">) {
  return EventV2.ID.make(`evt_maestro_validation_${hash([input.sessionID, input.workCardID])}`)
}

function reviewEventID(input: Pick<RecordReviewInput, "sessionID" | "validationRecordID">) {
  return EventV2.ID.make(`evt_maestro_review_${hash([input.sessionID, input.validationRecordID])}`)
}

function requireText(value: unknown, reason: string): string {
  if (typeof value === "string" && value.length > 0) return value
  throw new ValidationRejectedError({ reason })
}

function validation(input: RecordValidationInput): Omit<ValidationData, "actor"> {
  const sessionID = requireText(input.sessionID, "malformed-session-id")
  const projectID = requireText(input.projectID, "malformed-project-id")
  const workCardID = requireText(input.workCardID, "malformed-work-card-id")
  const workCard = requireText(input.workCard, "malformed-work-card")
  if (input.validatorID !== "maestro") throw new ValidationRejectedError({ reason: "unauthorized-validator" })
  const member = lookupRosterMember(input.routedMemberID)
  if (member.status === "HOLD") throw new ValidationRejectedError({ reason: member.reason })
  if (member.member.memberId === "maestro") throw new ValidationRejectedError({ reason: "maestro-member" })
  const grant = lookupRouteGrant(input.routedMemberID)
  if (grant.status === "HOLD") throw new ValidationRejectedError({ reason: grant.reason })
  const validatorVersion = requireText(input.validatorVersion, "malformed-validator-version")
  const checks = requireChecks(input.checks)
  const outcome = checks.some((check) => check.status === "HOLD")
    ? "HOLD"
    : checks.some((check) => check.status === "FAIL")
      ? "INVALID"
      : "VALID"
  const reviewer = roster.find((candidate) => candidate.memberId === "lucy")
  if (!reviewer?.nativeProfile) throw new ValidationRejectedError({ reason: "reviewer-policy-missing" })
  return {
    sessionID,
    ...(input.planRevisionID ? { planRevisionID: input.planRevisionID } : {}),
    ...(input.contextRecordID ? { contextRecordID: input.contextRecordID } : {}),
    ...(input.contextHash ? { contextHash: input.contextHash } : {}),
    projectID,
    workCardID,
    workCard,
    workCardHash: cardHash(workCard),
    routedMemberID: member.member.memberId,
    rosterHash: hash(roster),
    grantHash: hash(grant.grant),
    reviewPolicyHash: reviewPolicyHash(reviewer, nativeProfiles[reviewer.nativeProfile]),
    validatorID: "maestro",
    validatorVersion,
    checks,
    outcome,
  }
}

function actor(session: Session.Info, memberId: "maestro" | "lucy") {
  const bytes = stable({ memberId, projectId: session.projectID, sessionId: session.id })
  return { version: "rfc8785-v1" as const, bytes, sha256: createHash("sha256").update(bytes, "utf8").digest("hex") }
}

const resolveSession = Effect.fn("MaestroValidation.resolveSession")(function* (sessionID: string, projectID: string) {
  const { db } = yield* Database.Service
  const row = yield* db
    .select()
    .from(SessionTable)
    .where(eq(SessionTable.id, SessionID.make(sessionID)))
    .get()
    .pipe(Effect.orDie)
  if (!row) return yield* new ValidationRejectedError({ reason: "session-not-found" })
  const session = Session.fromRow(row)
  if (!session.projectID) return yield* new ValidationRejectedError({ reason: "session-project-absent" })
  if (session.projectID !== projectID) return yield* new ValidationRejectedError({ reason: "project-mismatch" })
  const project = yield* db
    .select()
    .from(ProjectTable)
    .where(eq(ProjectTable.id, session.projectID))
    .get()
    .pipe(Effect.orDie)
  if (!project) return yield* new ValidationRejectedError({ reason: "session-project-absent" })
  const roots = [project.worktree, ...project.sandboxes]
  if (!roots.some((root) => {
    const relative = path.relative(root, session.directory)
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
  })) {
    return yield* new ValidationRejectedError({ reason: "session-location-mismatch" })
  }
  return { session, project }
})

function requireChecks(value: unknown): Check[] {
  if (!Array.isArray(value) || value.length === 0) throw new ValidationRejectedError({ reason: "empty-checks" })
  const checks = value.map((item) => {
    if (!item || typeof item !== "object") throw new ValidationRejectedError({ reason: "malformed-check" })
    const record = item as Record<string, unknown>
    const status = record.status
    if (
      typeof record.id !== "string" ||
      record.id.length === 0 ||
      !isCheckStatus(status) ||
      typeof record.detail !== "string" ||
      record.detail.length === 0
    ) {
      throw new ValidationRejectedError({ reason: "malformed-check" })
    }
    return { id: record.id, status, detail: record.detail }
  })
  if (new Set(checks.map((check) => check.id)).size !== checks.length) {
    throw new ValidationRejectedError({ reason: "duplicate-check-id" })
  }
  if (checks.some((check, index) => index > 0 && checks[index - 1].id.localeCompare(check.id) >= 0)) {
    throw new ValidationRejectedError({ reason: "checks-not-deterministic" })
  }
  return checks
}

export const readValidation = Effect.fn("MaestroValidation.read")(function* (id: string) {
  if (!id.startsWith("evt_")) return undefined
  const { db } = yield* Database.Service
  const row = yield* db
    .select()
    .from(EventTable)
    .where(eq(EventTable.id, EventV2.ID.make(id)))
    .get()
    .pipe(Effect.orDie)
  if (!row || row.type !== EventV2.versionedType(MaestroEvent.Validation.Recorded.type, 1)) return undefined
  return { id: row.id, ...Schema.decodeUnknownSync(MaestroEvent.Validation.Recorded.data)(row.data) }
})

export const recordValidation = Effect.fn("MaestroValidation.record")(function* (input: RecordValidationInput) {
  const trusted = yield* resolveSession(input.sessionID, input.projectID)
  const wanted = yield* Effect.try({
    try: () => ({
      ...validation(input),
      projectID: trusted.session.projectID,
      actor: actor(trusted.session, "maestro"),
    }),
    catch: (error) =>
      error instanceof ValidationRejectedError
        ? error
        : new ValidationRejectedError({ reason: "malformed-validation" }),
  })
  const id = validationEventID(input)
  const existing = yield* readValidation(id)
  if (existing) {
    const { id: existingID, ...recorded } = existing
    if (isDeepStrictEqual(recorded, wanted)) return existing
    return yield* new ValidationConflictError({ sessionID: input.sessionID, workCardID: input.workCardID })
  }
  const events = yield* EventV2Bridge.Service
  return yield* events.publish(MaestroEvent.Validation.Recorded, wanted, { id }).pipe(
    Effect.map((recorded) => ({ id: recorded.id, ...recorded.data })),
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        if (!isDuplicate(cause)) return yield* Effect.failCause(cause)
        const existing = yield* readValidation(id)
        if (!existing) return yield* Effect.failCause(cause)
        const { id: existingID, ...recorded } = existing
        if (isDeepStrictEqual(recorded, wanted)) return existing
        return yield* new ValidationConflictError({ sessionID: input.sessionID, workCardID: input.workCardID })
      }),
    ),
  )
})

export const readReview = Effect.fn("MaestroReview.read")(function* (id: string) {
  if (!id.startsWith("evt_")) return undefined
  const { db } = yield* Database.Service
  const row = yield* db
    .select()
    .from(EventTable)
    .where(eq(EventTable.id, EventV2.ID.make(id)))
    .get()
    .pipe(Effect.orDie)
  if (!row || row.type !== EventV2.versionedType(MaestroEvent.Review.Received.type, 1)) return undefined
  return { id: row.id, ...Schema.decodeUnknownSync(MaestroEvent.Review.Received.data)(row.data) }
})

export const findReview = Effect.fn("MaestroReview.find")(function* (sessionID: string, validationRecordID: string) {
  const { db } = yield* Database.Service
  const rows = yield* db
    .select({ id: EventTable.id, type: EventTable.type, data: EventTable.data })
    .from(EventTable)
    .where(eq(EventTable.aggregate_id, sessionID))
    .all()
    .pipe(Effect.orDie)
  return rows
    .filter((row) => row.type === EventV2.versionedType(MaestroEvent.Review.Received.type, 1))
    .map((row) => ({ id: row.id, data: Schema.decodeUnknownSync(MaestroEvent.Review.Received.data)(row.data) }))
    .find((row) => row.data.validationRecordID === validationRecordID)
})

export const recordReview = Effect.fn("MaestroReview.record")(function* (input: RecordReviewInput) {
  if (input.reviewerID !== "lucy") return yield* new ReviewRejectedError({ reason: "unauthorized-reviewer" })
  const record = yield* readValidation(input.validationRecordID)
  if (!record) return yield* new ReviewRejectedError({ reason: "validation-not-found" })
  if (record.sessionID !== input.sessionID) return yield* new ReviewRejectedError({ reason: "session-mismatch" })
  if (record.outcome !== "VALID") return yield* new ReviewRejectedError({ reason: "validation-not-valid" })
  if (record.routedMemberID === "lucy") return yield* new ReviewRejectedError({ reason: "self-review" })
  const trusted = yield* resolveSession(input.sessionID, record.projectID).pipe(
    Effect.mapError((error) => new ReviewRejectedError({ reason: error.reason })),
  )
  if (typeof input.workCard !== "string" || cardHash(input.workCard) !== record.workCardHash) {
    return yield* new ReviewRejectedError({ reason: "work-card-mismatch" })
  }
  const artifact = yield* requireArtifact(
    input.artifact,
    record.workCardHash,
    trusted.session.directory,
    trusted.session.directory,
  )
  const checks = yield* Effect.try({
    try: () => requireChecks(input.checks),
    catch: () => new ReviewRejectedError({ reason: "malformed-check-evidence" }),
  })
  if (input.verdict !== "APPROVE" && input.verdict !== "FIX_FIRST" && input.verdict !== "REJECT") {
    return yield* new ReviewRejectedError({ reason: "malformed-verdict" })
  }
  const findings = yield* Effect.try({
    try: () => requireFindings(input.findings, artifact),
    catch: (error) =>
      error instanceof ReviewRejectedError ? error : new ReviewRejectedError({ reason: "malformed-findings" }),
  })
  if (input.verdict === "APPROVE" && findings.length > 0)
    return yield* new ReviewRejectedError({ reason: "approval-has-findings" })
  if (input.verdict !== "APPROVE" && findings.length === 0)
    return yield* new ReviewRejectedError({ reason: "findings-required" })
  // Recheck evidence must exactly match validation's named checks, not reviewer prose.
  if (!isDeepStrictEqual(checks, record.checks))
    return yield* new ReviewRejectedError({ reason: "check-evidence-mismatch" })
  const wanted: ReviewData = {
    sessionID: input.sessionID,
    projectID: record.projectID,
    validationRecordID: input.validationRecordID,
    workCardHash: record.workCardHash,
    routedMemberID: record.routedMemberID,
    rosterHash: record.rosterHash,
    grantHash: record.grantHash,
    reviewPolicyHash: record.reviewPolicyHash,
    actor: actor(trusted.session, "lucy"),
    reviewerID: "lucy",
    reviewMethodVersion: requireText(input.reviewMethodVersion, "malformed-review-method-version"),
    artifact,
    verdict: input.verdict,
    findings,
  }
  const id = reviewEventID(input)
  const existing = yield* readReview(id)
  if (existing) {
    const { id: existingID, ...recorded } = existing
    if (isDeepStrictEqual(recorded, wanted)) return existing
    return yield* new ReviewConflictError({ sessionID: input.sessionID, validationRecordID: input.validationRecordID })
  }
  const events = yield* EventV2Bridge.Service
  return yield* events.publish(MaestroEvent.Review.Received, wanted, { id }).pipe(
    Effect.map((recorded) => ({ id: recorded.id, ...recorded.data })),
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        if (!isDuplicate(cause)) return yield* Effect.failCause(cause)
        const existing = yield* readReview(id)
        if (!existing) return yield* Effect.failCause(cause)
        const { id: existingID, ...recorded } = existing
        if (isDeepStrictEqual(recorded, wanted)) return existing
        return yield* new ReviewConflictError({
          sessionID: input.sessionID,
          validationRecordID: input.validationRecordID,
        })
      }),
    ),
  )
})

function isDuplicate(cause: Cause.Cause<unknown>) {
  const message = String(Cause.squash(cause))
  return message.includes("already exists") || message.includes("UNIQUE constraint failed")
}

const requireArtifact = Effect.fn("MaestroReview.requireArtifact")(function* (
  value: unknown,
  workCardHash: string,
  directory: string,
  projectWorktree: string,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return yield* new ReviewRejectedError({ reason: "malformed-artifact-evidence" })
  }
  const artifact = value as Record<string, unknown>
  if (
    artifact.encoding !== "base64" ||
    typeof artifact.bytes !== "string" ||
    artifact.bytes.length === 0 ||
    typeof artifact.baseSHA !== "string" ||
    typeof artifact.headSHA !== "string" ||
    typeof artifact.worktree !== "string" ||
    !Array.isArray(artifact.changedPaths) ||
    Object.keys(artifact).some(
      (key) => !["baseSHA", "headSHA", "worktree", "changedPaths", "encoding", "bytes"].includes(key),
    )
  ) {
    return yield* new ReviewRejectedError({ reason: "malformed-artifact-evidence" })
  }
  if (!isSHA(artifact.baseSHA) || !isSHA(artifact.headSHA))
    return yield* new ReviewRejectedError({ reason: "malformed-artifact-sha" })
  if (artifact.changedPaths.some((item) => typeof item !== "string" || !validPath(item))) {
    return yield* new ReviewRejectedError({ reason: "malformed-artifact-path" })
  }
  const bytes = Buffer.from(artifact.bytes, "base64")
  if (bytes.length === 0 || bytes.toString("base64") !== artifact.bytes) {
    return yield* new ReviewRejectedError({ reason: "malformed-artifact-bytes" })
  }
  const git = yield* Git.Service
  const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: directory })
  const worktree = root.text().trim()
  if (root.exitCode !== 0 || !worktree) return yield* new ReviewRejectedError({ reason: "git-root-unavailable" })
  const relativeDirectory = path.relative(worktree, directory)
  if (
    artifact.worktree !== worktree ||
    (relativeDirectory !== "" && (relativeDirectory.startsWith("..") || path.isAbsolute(relativeDirectory)))
  ) {
    return yield* new ReviewRejectedError({ reason: "artifact-worktree-mismatch" })
  }
  const base = yield* git.run(["rev-parse", "--verify", `${artifact.baseSHA}^{commit}`], { cwd: worktree })
  const head = yield* git.run(["rev-parse", "--verify", `${artifact.headSHA}^{commit}`], { cwd: worktree })
  if (
    base.exitCode !== 0 ||
    base.text().trim() !== artifact.baseSHA ||
    head.exitCode !== 0 ||
    head.text().trim() !== artifact.headSHA
  ) {
    return yield* new ReviewRejectedError({ reason: "artifact-sha-not-found" })
  }
  const parentage = yield* git.run(["merge-base", "--is-ancestor", artifact.baseSHA, artifact.headSHA], {
    cwd: worktree,
  })
  if (parentage.exitCode !== 0) return yield* new ReviewRejectedError({ reason: "artifact-parentage-mismatch" })
  const names = yield* git.run(
    ["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", artifact.baseSHA, artifact.headSHA, "--", "."],
    {
      cwd: worktree,
    },
  )
  const changedPaths = names.text().split("\0").filter(Boolean)
  if (names.exitCode !== 0 || !isDeepStrictEqual(changedPaths, artifact.changedPaths)) {
    return yield* new ReviewRejectedError({ reason: "artifact-path-mismatch" })
  }
  const diff = yield* git.run(
    [
      "diff",
      "--binary",
      "--full-index",
      "--no-ext-diff",
      "--no-renames",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      artifact.baseSHA,
      artifact.headSHA,
      "--",
      ".",
    ],
    { cwd: worktree },
  )
  if (diff.exitCode !== 0 || diff.truncated || !diff.stdout.equals(bytes)) {
    return yield* new ReviewRejectedError({ reason: "artifact-bytes-mismatch" })
  }
  return {
    workCardHash,
    sha256: createHash("sha256").update(diff.stdout).digest("hex"),
    baseSHA: artifact.baseSHA,
    headSHA: artifact.headSHA,
    worktree,
    changedPaths,
    bytes: artifact.bytes,
  }
})

function isSHA(value: string) {
  return /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(value)
}

function validPath(value: string) {
  return value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes("..")
}

function requireFindings(value: unknown, artifact: ReviewData["artifact"]) {
  if (!Array.isArray(value)) throw new ReviewRejectedError({ reason: "malformed-findings" })
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new ReviewRejectedError({ reason: "malformed-finding" })
    const finding = item as Record<string, unknown>
    const line = finding.line
    if (
      typeof finding.path !== "string" ||
      finding.path.length === 0 ||
      typeof line !== "number" ||
      !Number.isSafeInteger(line) ||
      line <= 0 ||
      typeof finding.message !== "string" ||
      finding.message.length === 0
    ) {
      throw new ReviewRejectedError({ reason: "malformed-finding" })
    }
    if (!artifact.changedPaths.includes(finding.path) || !hasAddedLine(artifact, finding.path, line)) {
      throw new ReviewRejectedError({ reason: "finding-not-in-artifact" })
    }
    return { path: finding.path, line, message: finding.message }
  })
}

function hasAddedLine(artifact: ReviewData["artifact"], findingPath: string, findingLine: number) {
  let file: string | undefined
  let line: number | undefined
  for (const value of Buffer.from(artifact.bytes, "base64").toString("utf8").split("\n")) {
    if (value.startsWith("+++ b/")) {
      file = value.slice(6)
      line = undefined
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(value)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (line === undefined || file !== findingPath) continue
    if (value.startsWith("+") && !value.startsWith("+++")) {
      if (line === findingLine) return true
      line++
      continue
    }
    if (!value.startsWith("-\\ No newline at end of file") && !value.startsWith("-")) line++
  }
  return false
}

function isCheckStatus(value: unknown): value is Check["status"] {
  return value === "PASS" || value === "FAIL" || value === "HOLD"
}
