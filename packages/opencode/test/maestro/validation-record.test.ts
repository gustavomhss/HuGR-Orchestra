import { afterEach, describe, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventTable } from "@opencode-ai/core/event/sql"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { SessionID } from "@/session/schema"
import {
  readReview,
  recordReview,
  recordValidation,
  reviewPolicyHash,
} from "../../src/maestro/validation-record"
import { nativeProfiles, roster } from "../../src/maestro/roster"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(LayerNode.compile(LayerNode.group([Database.node, EventV2Bridge.node, Git.node])))

const base = {
  sessionID: "ses_validation",
  workCardID: "card_validation",
  workCard: "# Card\nImplement exact behavior.\n",
  routedMemberID: "charlie",
  validatorID: "maestro",
  validatorVersion: "validation-v1",
  checks: [{ id: "typecheck", status: "PASS" as const, detail: "clean" }],
}

const prepare = Effect.fn("MaestroValidationTest.prepare")(function* (sessionID = base.sessionID) {
  const test = yield* TestInstance
  const { db } = yield* Database.Service
  const project = yield* db
    .select()
    .from(ProjectTable)
    .where(eq(ProjectTable.worktree, AbsolutePath.make(test.directory)))
    .get()
    .pipe(Effect.orDie)
  if (!project) throw new Error("missing test project")
  yield* db
    .insert(SessionTable)
    .values({
      id: SessionID.make(sessionID),
      project_id: project.id,
      slug: sessionID,
      directory: test.directory,
      title: "validation",
      version: "test",
      time_created: 1,
      time_updated: 1,
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  return { ...base, sessionID, projectID: project.id }
})

const artifact = Effect.fn("MaestroValidationTest.artifact")(function* () {
  const test = yield* TestInstance
  const git = yield* Git.Service
  const base = yield* git.run(["rev-parse", "HEAD"], { cwd: test.directory })
  yield* Effect.promise(() => Bun.write(`${test.directory}/proof.txt`, "proof\n"))
  yield* git.run(["add", "proof.txt"], { cwd: test.directory })
  yield* git.run(["commit", "-m", "proof"], { cwd: test.directory })
  const head = yield* git.run(["rev-parse", "HEAD"], { cwd: test.directory })
  const names = yield* git.run(
    ["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", base.text().trim(), head.text().trim(), "--", "."],
    {
      cwd: test.directory,
    },
  )
  const diff = yield* git.run(
    [
      "diff",
      "--binary",
      "--full-index",
      "--no-ext-diff",
      "--no-renames",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      base.text().trim(),
      head.text().trim(),
      "--",
      ".",
    ],
    { cwd: test.directory },
  )
  return {
    baseSHA: base.text().trim(),
    headSHA: head.text().trim(),
    worktree: test.directory,
    changedPaths: names.text().split("\0").filter(Boolean),
    encoding: "base64" as const,
    bytes: diff.stdout.toString("base64"),
  }
})

describe("Maestro validation receipt", () => {
  it.instance(
    "derives project and canonical Maestro actor from durable Session",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const receipt = yield* recordValidation(input)

        expect(receipt.projectID).toBe(input.projectID)
        expect(receipt.actor).toEqual({
          version: "rfc8785-v1",
          bytes: `{"memberId":"maestro","projectId":"${input.projectID}","sessionId":"${input.sessionID}"}`,
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        })
      }),
    { git: true },
  )

  it.instance(
    "rejects caller project mutation before publish",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const rejected = yield* recordValidation({ ...input, projectID: "prj_other" }).pipe(Effect.flip)
        const { db } = yield* Database.Service

        expect(rejected).toMatchObject({ _tag: "MaestroValidationRejected", reason: "project-mismatch" })
        expect(yield* db.select().from(EventTable).all().pipe(Effect.orDie)).toHaveLength(0)
      }),
    { git: true },
  )

  it.instance(
    "binds replay to Lucy native review profile and conflicts when profile changes",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const lucy = roster.find((member) => member.memberId === "lucy")
        if (!lucy?.nativeProfile) throw new Error("missing Lucy native review profile")
        const profile = nativeProfiles[lucy.nativeProfile]
        const changedHash = reviewPolicyHash(lucy, { ...profile, bash: "allow" })
        const receipt = yield* recordValidation(input)
        const { db } = yield* Database.Service
        const { id, ...recorded } = receipt

        expect(receipt.reviewPolicyHash).toBe(reviewPolicyHash(lucy, profile))
        expect(changedHash).not.toBe(receipt.reviewPolicyHash)
        yield* db
          .update(EventTable)
          .set({ data: { ...recorded, reviewPolicyHash: changedHash } })
          .where(eq(EventTable.id, id))
          .run()
          .pipe(Effect.orDie)

        const conflict = yield* recordValidation(input).pipe(Effect.flip)

        expect(conflict).toMatchObject({
          _tag: "MaestroValidationConflict",
          sessionID: input.sessionID,
          workCardID: input.workCardID,
        })
      }),
    { git: true },
  )

  it.instance(
    "binds Lucy receipt to real Git diff, root, paths, bytes, and actor",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact()
        const receipt = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: evidence,
          checks: input.checks,
        })

        expect(receipt.artifact).toMatchObject({
          baseSHA: evidence.baseSHA,
          headSHA: evidence.headSHA,
          worktree: evidence.worktree,
          changedPaths: evidence.changedPaths,
          bytes: evidence.bytes,
          workCardHash: validation.workCardHash,
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        })
        expect(receipt.actor.bytes).toBe(
          `{"memberId":"lucy","projectId":"${input.projectID}","sessionId":"${input.sessionID}"}`,
        )
        expect(yield* readReview(receipt.id)).toEqual(receipt)
      }),
    { git: true },
  )

  it.instance(
    "fails forged changed paths and diff bytes closed",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact()
        const paths = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: { ...evidence, changedPaths: ["forged.ts"] },
          checks: input.checks,
        }).pipe(Effect.flip)
        const bytes = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: { ...evidence, bytes: Buffer.from("forged").toString("base64") },
          checks: input.checks,
        }).pipe(Effect.flip)
        const sha = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: { ...evidence, baseSHA: "a".repeat(40) },
          checks: input.checks,
        }).pipe(Effect.flip)
        const worktree = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: { ...evidence, worktree: "/forged" },
          checks: input.checks,
        }).pipe(Effect.flip)

        expect(paths).toMatchObject({ _tag: "MaestroReviewRejected", reason: "artifact-path-mismatch" })
        expect(bytes).toMatchObject({ _tag: "MaestroReviewRejected", reason: "artifact-bytes-mismatch" })
        expect(sha).toMatchObject({ _tag: "MaestroReviewRejected", reason: "artifact-sha-not-found" })
        expect(worktree).toMatchObject({ _tag: "MaestroReviewRejected", reason: "artifact-worktree-mismatch" })
      }),
    { git: true },
  )

  it.instance(
    "rejects unrelated artifact head before review persistence",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact()
        const test = yield* TestInstance
        const git = yield* Git.Service
        yield* git.run(["checkout", "--orphan", "unrelated-artifact"], { cwd: test.directory })
        yield* git.run(["rm", "-rf", "."], { cwd: test.directory })
        yield* Effect.promise(() => Bun.write(`${test.directory}/unrelated.txt`, "unrelated\n"))
        yield* git.run(["add", "unrelated.txt"], { cwd: test.directory })
        yield* git.run(["commit", "-m", "unrelated"], { cwd: test.directory })
        const head = yield* git.run(["rev-parse", "HEAD"], { cwd: test.directory })
        const names = yield* git.run(
          [
            "diff",
            "--no-ext-diff",
            "--no-renames",
            "--name-only",
            "-z",
            evidence.baseSHA,
            head.text().trim(),
            "--",
            ".",
          ],
          { cwd: test.directory },
        )
        const diff = yield* git.run(
          [
            "diff",
            "--binary",
            "--full-index",
            "--no-ext-diff",
            "--no-renames",
            "--src-prefix=a/",
            "--dst-prefix=b/",
            evidence.baseSHA,
            head.text().trim(),
            "--",
            ".",
          ],
          { cwd: test.directory },
        )
        const rejected = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: {
            ...evidence,
            headSHA: head.text().trim(),
            changedPaths: names.text().split("\0").filter(Boolean),
            bytes: diff.stdout.toString("base64"),
          },
          checks: input.checks,
        }).pipe(Effect.flip)
        const { db } = yield* Database.Service

        expect(rejected).toMatchObject({ _tag: "MaestroReviewRejected", reason: "artifact-parentage-mismatch" })
        expect(yield* db.select().from(EventTable).all().pipe(Effect.orDie)).toHaveLength(1)
      }),
    { git: true },
  )

  it.instance(
    "rejects review before artifact processing when validation is not valid",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation({
          ...input,
          checks: [{ id: "typecheck", status: "FAIL", detail: "failed" }],
        })
        const rejected = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: null,
          checks: input.checks,
        }).pipe(Effect.flip)
        const { db } = yield* Database.Service

        expect(rejected).toMatchObject({ _tag: "MaestroReviewRejected", reason: "validation-not-valid" })
        expect(yield* db.select().from(EventTable).all().pipe(Effect.orDie)).toHaveLength(1)
      }),
    { git: true },
  )

  it.instance(
    "rejects finding citations outside the canonical artifact diff",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact()
        const rejected = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "FIX_FIRST",
          findings: [{ path: "proof.txt", line: 99, message: "invented citation" }],
          artifact: evidence,
          checks: input.checks,
        }).pipe(Effect.flip)

        expect(rejected).toMatchObject({ _tag: "MaestroReviewRejected", reason: "finding-not-in-artifact" })
      }),
    { git: true },
  )
})
