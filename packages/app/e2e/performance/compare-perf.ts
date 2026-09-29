#!/usr/bin/env bun
/**
 * Paired performance comparator.
 *
 * Absolute wall-clock thresholds are not a valid oracle on a shared or loaded host, so a
 * percentage claim has to come from two arms measured in the same session. This reads the
 * `BENCHMARK {...}` lines the benchmark harness already prints, groups them by arm, and
 * reports per-metric medians, observed ranges, and the ratio between arms.
 *
 * A metric is only called a regression when the two arms' observed ranges do not overlap.
 * When they overlap the verdict is INCONCLUSIVE, never a pass, because the run cannot
 * separate a product change from host noise.
 *
 * Usage:
 *   bun run compare-perf.ts --candidate base.log --baseline head.log \
 *     --metric completionObservedMs --metric longTaskTimeMs
 * or read two labelled files produced by the ab driver:
 *   bun run compare-perf.ts --file run.jsonl
 */

type Row = { arm: string; [key: string]: unknown }

const REQUIRED_METRICS = [
  "completionObservedMs",
  "deltasPerSecond",
  "longTaskCount",
  "longTaskTimeMs",
  "rafGapP50Ms",
  "rafGapP95Ms",
  "rafGapP99Ms",
  "rafGapsOver50Ms",
  "missedFrameBudgetEquivalents",
  "endToEndInitialContentObservedMs",
]

// Metrics where a LARGER value is worse. deltasPerSecond is the exception.
const HIGHER_IS_WORSE = new Set(REQUIRED_METRICS.filter((m) => m !== "deltasPerSecond"))

const CORRECTNESS = ["rowReplaced", "markdownReplaced", "blankSamples", "bottomDriftTransitions", "distanceTransitionsPx"]

function parse(text: string, fallbackArm: string): Row[] {
  const rows: Row[] = []
  for (const line of text.split("\n")) {
    const at = line.indexOf("BENCHMARK {")
    if (at === -1) continue
    let payload: string
    try {
      payload = line.slice(at + "BENCHMARK ".length)
    } catch {
      continue
    }
    let parsed: any
    try {
      parsed = JSON.parse(payload)
    } catch {
      continue
    }
    if (parsed?.status === "failed" || !parsed?.metrics) {
      rows.push({ arm: fallbackArm, __failed: true, error: parsed?.error, context: parsed?.context })
      continue
    }
    rows.push({ arm: (parsed.context?.arm as string) ?? fallbackArm, ...parsed.metrics, context: parsed.context })
  }
  return rows
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

function numbers(rows: Row[], key: string) {
  return rows.map((r) => r[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v))
}

function verdict(base: number[], cand: number[], higherIsWorse: boolean) {
  const bm = median(base)
  const cm = median(cand)
  const bMin = Math.min(...base)
  const bMax = Math.max(...base)
  const cMin = Math.min(...cand)
  const cMax = Math.max(...cand)
  const deltaPercent = bm === 0 ? 0 : ((cm - bm) / bm) * 100
  const rangesOverlap = !(cMin > bMax || bMin > cMax)
  const direction = deltaPercent === 0 ? "flat" : deltaPercent < 0 ? "down" : "up"
  const worse = higherIsWorse ? direction === "up" : direction === "down"
  const better = higherIsWorse ? direction === "down" : direction === "up"
  // Identical samples in both arms is a deterministic FLAT, not noise. Overlapping but
  // differing samples cannot be attributed. Disjoint ranges can.
  const identical = base.length === cand.length && base.every((v, i) => v === cand[i]) && bMin === cMin && bMax === cMax
  const status = identical
    ? "FLAT"
    : rangesOverlap
      ? "INCONCLUSIVE"
      : worse
        ? "REGRESSION"
        : better
          ? "IMPROVED"
          : "FLAT"
  return { bm, cm, deltaPercent, bMin, bMax, cMin, cMax, rangesOverlap, identical, status }
}

function main(argv: string[]) {
  const args = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 2) if (argv[i]?.startsWith("--")) args.set(argv[i]!.slice(2), argv[i + 1] ?? "")
  const baseLog = args.get("baseline")
  const candLog = args.get("candidate")
  const file = args.get("file")
  const minSamples = Number(args.get("min-samples") ?? 3)

  let baseRows: Row[]
  let candRows: Row[]
  if (file) {
    const text = require("node:fs").readFileSync(file, "utf8")
    const all = text
      .split("\n")
      .filter((l) => l.trim().startsWith("{"))
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return undefined
        }
      })
      .filter((v): v is Row => !!v)
    baseRows = all.filter((r) => r.arm === "base")
    candRows = all.filter((r) => r.arm === "mine" || r.arm === "candidate")
  } else if (baseLog && candLog) {
    const fs = require("node:fs")
    baseRows = parse(fs.readFileSync(baseLog, "utf8"), "baseline")
    candRows = parse(fs.readFileSync(candLog, "utf8"), "candidate")
  } else {
    console.error("provide --file <jsonl> or --baseline <log> --candidate <log>")
    process.exit(2)
  }

  // A run that reported no metrics is not a sample. Counting it would let a broken arm
  // satisfy the sample minimum, which is the "five complete valid samples" rule.
  const failed = [...baseRows, ...candRows].filter((r) => r.__failed)
  baseRows = baseRows.filter((r) => !r.__failed)
  candRows = candRows.filter((r) => !r.__failed)
  console.log(
    `paired comparator: baseline n=${baseRows.length} valid  candidate n=${candRows.length} valid` +
      (failed.length ? `  (${failed.length} run(s) excluded, no metrics)` : ""),
  )
  if (failed.length) {
    console.log(`\n${failed.length} run(s) reported no metrics and are excluded:`)
    for (const f of failed.slice(0, 4)) console.log(`  ${f.arm}: ${f.error}`)
  }
  if (baseRows.length < minSamples || candRows.length < minSamples) {
    console.log(
      `\nNOT_RUN: fewer than ${minSamples} valid samples per arm. ` +
        `A paired claim needs at least ${minSamples} complete runs per arm.`,
    )
    process.exit(1)
  }

  console.log(`\n${"metric".padEnd(32)}${"baseline".padStart(22)}${"candidate".padStart(22)}  ${"delta".padStart(9)}  verdict`)
  console.log("-".repeat(100))
  let regressions = 0
  let inconclusive = 0
  for (const key of REQUIRED_METRICS) {
    const b = numbers(baseRows, key)
    const c = numbers(candRows, key)
    if (b.length < minSamples || c.length < minSamples) {
      console.log(`${key.padEnd(32)}${"insufficient samples".padStart(44)}`)
      continue
    }
    const v = verdict(b, c, HIGHER_IS_WORSE.has(key))
    if (v.status === "REGRESSION") regressions++
    if (v.status === "INCONCLUSIVE") inconclusive++
    console.log(
      `${key.padEnd(32)}` +
        `${fmt(v.bm)} [${fmt(v.bMin)}-${fmt(v.bMax)}]`.padStart(22) +
        `${fmt(v.cm)} [${fmt(v.cMin)}-${fmt(v.cMax)}]`.padStart(22) +
        `${v.deltaPercent.toFixed(1)}%`.padStart(10) +
        `  ${v.status}`,
    )
  }

  console.log()
  for (const key of CORRECTNESS) {
    const bs = new Set(baseRows.map((r) => JSON.stringify(r[key])))
    const cs = new Set(candRows.map((r) => JSON.stringify(r[key])))
    const same = bs.size === 1 && cs.size === 1 && [...bs][0] === [...cs][0]
    console.log(`  ${key.padEnd(26)} baseline=${[...bs].join(",").slice(0, 24)}  candidate=${[...cs].join(",").slice(0, 24)}  ${same ? "same" : "DIFFERENT"}`)
  }

  console.log()
  console.log(
    `${regressions} regression(s), ${inconclusive} inconclusive. ` +
      `INCONCLUSIVE means the arms' observed ranges overlap, so this run cannot attribute the difference.`,
  )
  process.exit(regressions > 0 ? 1 : 0)
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "n/a"
  if (Math.abs(n) >= 1000) return n.toFixed(0)
  if (Math.abs(n) >= 10) return n.toFixed(1)
  return n.toFixed(3)
}

main(process.argv.slice(2))
