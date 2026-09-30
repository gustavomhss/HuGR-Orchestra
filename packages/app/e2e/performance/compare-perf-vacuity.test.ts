import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const appPackage = path.resolve(import.meta.dir, "../..")
const comparator = path.join(appPackage, "e2e/performance/compare-perf.ts")

// Anti-vacuity: an oracle that cannot fail proves nothing. These tests mutate a real metric
// and require the tool to catch it, then restore the original and require it to pass clean.

function runComparator(rows: string[]) {
  const file = path.join(os.tmpdir(), `cpf-vacuity-${Math.random().toString(36).slice(2)}.jsonl`)
  fs.writeFileSync(file, rows.join("\n"))
  try {
    const r = spawnSync("bun", ["run", comparator, "--file", file], { encoding: "utf8" })
    return { code: r.status, out: r.stdout }
  } finally {
    fs.rmSync(file, { force: true })
  }
}

const FULL = {
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
}

const row = (arm: string, o: Record<string, unknown> = {}) => JSON.stringify({ arm, ...FULL, ...o })

function arms(base: Record<string, unknown>, mine: Record<string, unknown>, n = 5) {
  return [...Array(n)].flatMap(() => [row("base", base), row("mine", mine)])
}

describe("the comparator has teeth", () => {
  test("a clean pair passes and reports no regression", () => {
    const { code, out } = runComparator(arms({}, {}))
    expect(out).toContain("0 regression(s)")
    expect(code).toBe(0)
  })

  test("a +50% completion regression is caught and exits 1", () => {
    const { code, out } = runComparator(arms({ completionObservedMs: 1000 }, { completionObservedMs: 1500 }))
    expect(out).toMatch(/completionObservedMs.*REGRESSION/)
    expect(code).toBe(1)
  })

  test("a +50% long task time regression is caught", () => {
    const { code, out } = runComparator(arms({ longTaskTimeMs: 2000 }, { longTaskTimeMs: 3000 }))
    expect(out).toMatch(/longTaskTimeMs.*REGRESSION/)
    expect(code).toBe(1)
  })

  test("a raf gap p99 regression is caught", () => {
    const { code, out } = runComparator(arms({ rafGapP99Ms: 200 }, { rafGapP99Ms: 320 }))
    expect(out).toMatch(/rafGapP99Ms.*REGRESSION/)
    expect(code).toBe(1)
  })

  test("a correctness invariant flip fails the comparison even with no perf change", () => {
    const { out } = runComparator(arms({}, { rowReplaced: true }))
    expect(out).toContain("rowReplaced")
    expect(out).toContain("DIFFERENT")
  })

  test("blank frames appearing in the candidate is surfaced", () => {
    const { out } = runComparator(arms({}, { blankSamples: 7 }))
    expect(out).toContain("blankSamples")
    expect(out).toContain("DIFFERENT")
  })

  test("a slowdown hidden inside overlapping noise is NOT called a regression", () => {
    // the exact failure mode that produced a false positive before the fix
    const base = [900, 1100, 1000, 1050, 950].map((completionObservedMs) => row("base", { completionObservedMs }))
    const mine = [1050, 1000, 1200, 980, 1100].map((completionObservedMs) => row("mine", { completionObservedMs }))
    const { code, out } = runComparator([...base, ...mine])
    expect(out).toMatch(/completionObservedMs.*INCONCLUSIVE/)
    expect(code).toBe(0)
  })

  test("dropping to two samples per arm refuses to produce a verdict", () => {
    const { code, out } = runComparator(arms({}, {}, 2))
    expect(out).toContain("NOT_RUN")
    expect(code).toBe(1)
  })

  test("a run that produced no metrics is excluded rather than counted as a sample", () => {
    const rows = [
      ...arms({}, {}, 4),
      JSON.stringify({ arm: "mine", __failed: true, error: "Benchmark did not reach completion" }),
    ]
    const { out } = runComparator(rows)
    expect(out).toContain("excluded, no metrics")
    expect(out).toContain("candidate n=4 valid")
  })

  test("the comparator is reachable from the package test scripts", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(appPackage, "package.json"), "utf8"))
    expect(pkg.scripts).toHaveProperty("test:bench")
    expect(fs.existsSync(comparator)).toBe(true)
  })
})
