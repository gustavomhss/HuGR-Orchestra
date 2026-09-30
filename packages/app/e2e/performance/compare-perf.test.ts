import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"

const script = path.join(import.meta.dir, "compare-perf.ts")

function run(args: string[], stdin?: string) {
  const result = spawnSync("bun", ["run", script, ...args], { encoding: "utf8", input: stdin })
  return { code: result.status, out: result.stdout, err: result.stderr }
}

function row(arm: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    arm,
    completionObservedMs: 1000,
    deltasPerSecond: 3,
    longTaskCount: 40,
    longTaskTimeMs: 2000,
    rafGapP50Ms: 33,
    rafGapP95Ms: 100,
    rafGapP99Ms: 200,
    rafGapsOver50Ms: 50,
    missedFrameBudgetEquivalents: 400,
    endToEndInitialContentObservedMs: 300,
    rowReplaced: false,
    markdownReplaced: false,
    blankSamples: 0,
    bottomDriftTransitions: 0,
    distanceTransitionsPx: [0],
    ...overrides,
  })
}

function jsonl(rows: unknown[]) {
  return rows.join("\n")
}

describe("compare-perf paired oracle", () => {
  test("identical arms produce no regression verdict", () => {
    const rows = jsonl([...Array(5)].map(() => [row("base"), row("mine")]).flat())
    const { code, out } = run(["--file", "/dev/stdin"], rows)
    expect(out).toContain("baseline n=5 valid")
    expect(out).toContain("0 regression(s)")
    expect(code).toBe(0)
  })

  test("a non-overlapping slowdown is reported as a regression and exits non-zero", () => {
    const rows = jsonl(
      [...Array(5)].map(() => [row("base", { completionObservedMs: 1000 }), row("mine", { completionObservedMs: 2000 })]).flat(),
    )
    const { code, out } = run(["--file", "/dev/stdin"], rows)
    expect(out).toContain("REGRESSION")
    expect(out).toContain("1 regression(s), 0 inconclusive")
    expect(code).toBe(1)
  })

  test("a non-overlapping speedup is reported as an improvement", () => {
    const rows = jsonl(
      [...Array(5)].map(() => [row("base", { completionObservedMs: 2000 }), row("mine", { completionObservedMs: 1000 })]).flat(),
    )
    const { code, out } = run(["--file", "/dev/stdin"], rows)
    expect(out).toContain("IMPROVED")
    expect(code).toBe(0)
  })

  test("overlapping ranges are INCONCLUSIVE, never a silent pass or a false regression", () => {
    const rows = jsonl([
      row("base", { completionObservedMs: 1000 }),
      row("base", { completionObservedMs: 3000 }),
      row("base", { completionObservedMs: 1100 }),
      row("base", { completionObservedMs: 1200 }),
      row("mine", { completionObservedMs: 2000 }),
      row("mine", { completionObservedMs: 2100 }),
      row("mine", { completionObservedMs: 2200 }),
      row("mine", { completionObservedMs: 2300 }),
    ])
    const { out } = run(["--file", "/dev/stdin"], rows)
    expect(out).toContain("INCONCLUSIVE")
    expect(out).toContain("cannot attribute the difference")
  })

  test("higher deltasPerSecond is an improvement, not a regression", () => {
    const rows = jsonl([
      ...Array(4)].map(() => [row("base", { deltasPerSecond: 2 }), row("mine", { deltasPerSecond: 9 })]).flat(),
    )
    const { code, out } = run(["--file", "/dev/stdin"], rows)
    const line = out.split("\n").find((l) => l.includes("deltasPerSecond"))!
    expect(line).toContain("IMPROVED")
    expect(line).not.toContain("REGRESSION")
    expect(code).toBe(0)
  })

  test("too few samples per arm is NOT_RUN and exits non-zero", () => {
    const { code, out } = run(["--file", "/dev/stdin"], jsonl([row("base"), row("mine")]))
    expect(out).toContain("NOT_RUN")
    expect(code).toBe(1)
  })

  test("runs that reported no metrics are excluded and surfaced", () => {
    // three valid per arm plus one run that produced no metrics at all
    const rows = jsonl([
      ...Array(3).fill(0).flatMap(() => [row("base"), row("mine")]),
      JSON.stringify({ arm: "mine", __failed: true, error: "Benchmark did not report metrics" }),
    ])
    const { code, out } = run(["--file", "/dev/stdin"], rows)
    expect(out).toContain("excluded, no metrics")
    expect(out).toContain("baseline n=3 valid")
    expect(out).toContain("candidate n=3 valid")
    expect(code).toBe(0)
  })

  test("a differing correctness invariant is surfaced as DIFFERENT", () => {
    const rows = jsonl(
      [...Array(4)].map(() => [row("base", { rowReplaced: false }), row("mine", { rowReplaced: true })]).flat(),
    )
    const { out } = run(["--file", "/dev/stdin"], rows)
    expect(out).toContain("rowReplaced")
    expect(out).toContain("DIFFERENT")
  })

  test("parses the harness BENCHMARK envelope out of a raw log", () => {
    const log = [
      'BENCHMARK {"schemaVersion":2,"status":"passed","context":{"arm":"base","cpuThrottle":4},"metrics":{"completionObservedMs":1000}}',
      'BENCHMARK {"schemaVersion":2,"status":"passed","context":{"arm":"mine","cpuThrottle":4},"metrics":{"completionObservedMs":2000}}',
    ].join("\n")
    const base = path.join("/tmp", "cpf-base.log")
    const cand = path.join("/tmp", "cpf-cand.log")
    require("node:fs").writeFileSync(base, log.replace(/"arm":"mine"/g, '"arm":"base"'))
    require("node:fs").writeFileSync(cand, log)
    const { out } = run(["--baseline", base, "--candidate", cand])
    expect(out).toContain("baseline n=2 valid")
    expect(out).toContain("candidate n=2 valid")
    expect(out).toContain("NOT_RUN")
  })
})
