import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import {
  EXCEPTION_LIMIT_LOC,
  NORMAL_LIMIT_LOC,
  TOLERANCE_LIMIT_LOC,
  countLoc,
  formatGodfileReport,
  runGodfileGate,
} from "../../../script/godfile"

const repos: string[] = []

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
}

function lines(count: number) {
  return Array.from({ length: count }, (_, index) => `const line${index} = ${index}`).join("\n")
}

function repo() {
  const cwd = mkdtempSync(join(tmpdir(), "godfile-"))
  repos.push(cwd)
  git(cwd, "init", "--initial-branch=main", "--quiet")
  git(cwd, "config", "user.email", "test@example.com")
  git(cwd, "config", "user.name", "Godfile Test")
  mkdirSync(join(cwd, "foundation/atlas"), { recursive: true })
  writeFileSync(join(cwd, "exception.ts"), lines(NORMAL_LIMIT_LOC))
  writeFileSync(join(cwd, "legacy.ts"), lines(EXCEPTION_LIMIT_LOC + 1))
  writeFileSync(join(cwd, "foundation/atlas/vendor.ts"), lines(EXCEPTION_LIMIT_LOC + 1))
  git(cwd, "add", ".")
  git(cwd, "commit", "-m", "baseline")
  return cwd
}

afterEach(() => {
  while (repos.length > 0) rmSync(repos.pop()!, { recursive: true, force: true })
})

describe("godfile", () => {
  test("counts physical non-blank lines", () => {
    expect(countLoc("one\n\n two\r\n  \nthree")).toBe(3)
  })

  test("warns at 401 through 600, including tolerance boundary", () => {
    const cwd = repo()
    writeFileSync(join(cwd, "target.ts"), lines(NORMAL_LIMIT_LOC + 1))
    writeFileSync(join(cwd, "tolerance.ts"), lines(TOLERANCE_LIMIT_LOC))

    const report = runGodfileGate({ cwd, baseRef: "HEAD" })
    expect(report.errors).toEqual([])
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        { file: "target.ts", lines: NORMAL_LIMIT_LOC + 1, kind: "tolerance" },
        { file: "tolerance.ts", lines: TOLERANCE_LIMIT_LOC, kind: "tolerance" },
      ]),
    )
  })

  test("tolerates unchanged legacy, excludes vendored Atlas", () => {
    const report = runGodfileGate({ cwd: repo(), baseRef: "HEAD" })
    expect(report.errors).toEqual([])
    expect(report.warnings).toContainEqual({
      file: "legacy.ts",
      lines: EXCEPTION_LIMIT_LOC + 1,
      baseLines: EXCEPTION_LIMIT_LOC + 1,
      kind: "legacy",
    })
    expect(report.warnings.some((finding) => finding.file.startsWith("foundation/atlas/"))).toBeFalse()
  })

  test("fails when legacy file over 700 grows, regardless of waiver maximum", () => {
    const cwd = repo()
    writeFileSync(
      join(cwd, "godfile-waivers.json"),
      JSON.stringify({
        waivers: {
          "legacy.ts": {
            maximumLines: EXCEPTION_LIMIT_LOC + 100,
            reason: "Human-authorized architecture exception",
            authorizedBy: "stakeholder",
            authorizedAt: "2026-09-08",
          },
        },
      }),
    )
    writeFileSync(join(cwd, "legacy.ts"), lines(EXCEPTION_LIMIT_LOC + 2))
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("legacy.ts")]),
    )
  })

  test("requires an exact waiver for 601 LOC", () => {
    const cwd = repo()
    writeFileSync(join(cwd, "new.ts"), lines(TOLERANCE_LIMIT_LOC + 1))
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("new.ts")]),
    )
  })

  test("permits 601 through 700 only with valid exact waiver", () => {
    const cwd = repo()
    writeFileSync(
      join(cwd, "godfile-waivers.json"),
      JSON.stringify({
        waivers: {
          "exception.ts": {
            maximumLines: EXCEPTION_LIMIT_LOC,
            reason: "Human-authorized architecture exception",
            authorizedBy: "stakeholder",
            authorizedAt: "2026-09-08",
          },
        },
      }),
    )
    writeFileSync(join(cwd, "exception.ts"), lines(TOLERANCE_LIMIT_LOC + 1))

    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual([])
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).warnings).toEqual(
      expect.arrayContaining([
        {
          file: "exception.ts",
          lines: TOLERANCE_LIMIT_LOC + 1,
          baseLines: NORMAL_LIMIT_LOC,
          kind: "exception",
          reason: "Human-authorized architecture exception",
        },
      ]),
    )

    writeFileSync(join(cwd, "exception.ts"), lines(EXCEPTION_LIMIT_LOC))
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual([])

    writeFileSync(join(cwd, "exception.ts"), lines(EXCEPTION_LIMIT_LOC + 1))
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("exception.ts")]),
    )

    writeFileSync(join(cwd, "new.ts"), lines(EXCEPTION_LIMIT_LOC + 1))
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("new.ts")]),
    )
  })

  test("skips only exact generated first-line marker", () => {
    const cwd = repo()
    writeFileSync(join(cwd, "generated.ts"), `// This file is auto-generated by @hey-api/openapi-ts\n${lines(EXCEPTION_LIMIT_LOC + 1)}`)
    writeFileSync(join(cwd, "false.ts"), `// This file is auto-generated by @hey-api/openapi-tsx\n${lines(EXCEPTION_LIMIT_LOC + 1)}`)
    writeFileSync(join(cwd, "later.ts"), `const source = true\n// This file is auto-generated by @hey-api/openapi-ts\n${lines(EXCEPTION_LIMIT_LOC + 1)}`)

    const report = runGodfileGate({ cwd, baseRef: "HEAD" })
    expect(report.errors).toEqual(expect.arrayContaining([expect.stringContaining("false.ts"), expect.stringContaining("later.ts")]))
    expect(report.errors.some((error) => error.includes("generated.ts"))).toBeFalse()
  })

  test("fails a stale or malformed waiver ledger", () => {
    const cwd = repo()
    writeFileSync(
      join(cwd, "godfile-waivers.json"),
      JSON.stringify({
        waivers: {
          "legacy.ts": { reason: "", authorizedBy: "stakeholder", authorizedAt: "2026-09-08" },
        },
      }),
    )
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("invalid waiver for legacy.ts")]),
    )

    writeFileSync(
      join(cwd, "godfile-waivers.json"),
      JSON.stringify({
        waivers: {
          "near.ts": {
            maximumLines: EXCEPTION_LIMIT_LOC,
            reason: "No longer needed",
            authorizedBy: "stakeholder",
            authorizedAt: "2026-09-08",
          },
        },
      }),
    )
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("stale waiver for near.ts")]),
    )
  })

  test("fails closed for a missing base and an empty source tree", () => {
    const cwd = repo()
    expect(runGodfileGate({ cwd, baseRef: "missing" }).errors[0]).toContain("Cannot resolve merge-base")

    const empty = mkdtempSync(join(tmpdir(), "godfile-empty-"))
    repos.push(empty)
    git(empty, "init", "--initial-branch=main", "--quiet")
    git(empty, "config", "user.email", "test@example.com")
    git(empty, "config", "user.name", "Godfile Test")
    writeFileSync(join(empty, "README.md"), "empty")
    git(empty, "add", ".")
    git(empty, "commit", "-m", "baseline")
    expect(runGodfileGate({ cwd: empty, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("zero source files")]),
    )
  })

  test("reports every warning and error with its file", () => {
    const output = formatGodfileReport({
      checked: 1,
      warnings: [{ file: "near.ts", lines: NORMAL_LIMIT_LOC + 1, kind: "tolerance" }],
      errors: ["new.ts: 701 LOC exceeds 700"],
    })
    expect(output).toContain("near.ts")
    expect(output).toContain("new.ts")
  })
})
