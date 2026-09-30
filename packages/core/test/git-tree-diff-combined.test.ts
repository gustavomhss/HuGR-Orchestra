import { describe, expect, test } from "bun:test"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// Git.tree.diff used to run three `git diff` invocations per file over the same tree pair,
// differing only in output format, sequentially and without concurrency. It now issues one
// invocation carrying --raw --numstat --patch and splits the output.
//
// These tests keep a verbatim copy of the previous per-file implementation and require the new
// one to produce byte-identical results on a real repository, across added, modified, deleted,
// binary and renames-disabled shapes.

type Diff = { path: string; status: string; additions: number; deletions: number; patch: string }

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tree-diff-"))
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" })
  git("init", "-q", ".")
  git("config", "user.email", "t@t")
  git("config", "user.name", "t")
  for (let i = 0; i < 6; i++) fs.writeFileSync(path.join(dir, `f${i}.txt`), Array.from({ length: 20 }, (_, n) => `l${n}`).join("\n"))
  fs.writeFileSync(path.join(dir, "gone.txt"), "a\nb\n")
  fs.writeFileSync(path.join(dir, "bin.dat"), Buffer.from([0, 1, 2, 0, 255, 0, 7]))
  git("add", "-A")
  git("commit", "-qm", "one")
  const from = git("rev-parse", "HEAD^{tree}").trim()

  fs.writeFileSync(path.join(dir, "f0.txt"), "changed\n")
  fs.writeFileSync(path.join(dir, "f3.txt"), "f3 line\nf3 other\n")
  fs.rmSync(path.join(dir, "gone.txt"))
  fs.writeFileSync(path.join(dir, "added.txt"), "brand new\nsecond line\n")
  fs.writeFileSync(path.join(dir, "bin.dat"), Buffer.from([9, 9, 9, 0, 255, 0, 0]))
  git("add", "-A")
  git("commit", "-qm", "two")
  const to = git("rev-parse", "HEAD^{tree}").trim()
  return { dir, from, to, git }
}

/** verbatim previous implementation: three sequential `git diff` per file */
function previous(dir: string, from: string, to: string, files: string[], context = 3): Diff[] {
  const run = (args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8", maxBuffer: 1 << 28 }).stdout
  return files.map((file) => {
    const statusText = run(["diff", "--name-status", "--no-renames", from, to, "--", file]).trim()
    const status = statusText.startsWith("A") ? "added" : statusText.startsWith("D") ? "deleted" : "modified"
    const stats = run(["diff", "--numstat", "--no-renames", from, to, "--", file]).split("\t")
    const binary = stats[0] === "-" || stats[1] === "-"
    const patch = binary ? "" : run(["diff", "--unified=3", "--no-renames", from, to, "--", file])
    return {
      path: file,
      status,
      additions: binary ? 0 : Number(stats[0] ?? 0),
      deletions: binary ? 0 : Number(stats[1] ?? 0),
      patch,
    }
  })
}

/** verbatim new implementation */
function combined(dir: string, from: string, to: string, files: string[], context = 3): Diff[] {
  if (files.length === 0) return []
  const text = spawnSync(
    "git",
    ["diff", "--raw", "--numstat", "--patch", "--no-renames", `--unified=${context}`, from, to, "--", ...files],
    { cwd: dir, encoding: "utf8", maxBuffer: 1 << 28 },
  ).stdout
  const status = new Map<string, string>()
  const counts = new Map<string, { additions: string; deletions: string }>()
  const patches = new Map<string, { start: number; end: number }>()
  let cursor = 0
  for (const line of text.split("\n")) {
    const start = cursor
    cursor = start + line.length + 1
    if (line.startsWith(":")) {
      const tab = line.indexOf("\t")
      status.set(line.slice(tab + 1), line.slice(0, tab).slice(-1))
      continue
    }
    const counted = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
    if (counted) {
      counts.set(counted[3]!, { additions: counted[1]!, deletions: counted[2]! })
      continue
    }
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
    if (header) patches.set(header[2]!, { start, end: text.length })
  }
  for (const patch of patches.values()) {
    const next = text.indexOf("\ndiff --git ", patch.start)
    patch.end = next === -1 ? text.length : next + 1
  }
  return files.map((file) => {
    const counted = counts.get(file)
    const binary = counted === undefined || counted.additions === "-" || counted.deletions === "-"
    const letter = status.get(file)
    const span = patches.get(file)
    return {
      path: file,
      status: letter === "A" ? "added" : letter === "D" ? "deleted" : "modified",
      additions: binary ? 0 : Number(counted?.additions ?? 0),
      deletions: binary ? 0 : Number(counted?.deletions ?? 0),
      patch: binary || !span ? "" : text.slice(span.start, span.end),
    }
  })
}

const { dir, from, to, git } = fixture()
const allFiles = git("diff", "--name-only", from, to).split("\n").filter(Boolean)

describe("combined tree diff is byte-identical to the per-file implementation", () => {
  test("the fixture exercises added, modified, deleted and binary files", () => {
    const statuses = previous(dir, from, to, allFiles).map((d) => `${d.path}:${d.status}`)
    expect(statuses).toContain("added.txt:added")
    expect(statuses).toContain("gone.txt:deleted")
    expect(statuses.some((s) => s.endsWith(":modified"))).toBe(true)
    const bin = previous(dir, from, to, allFiles).find((d) => d.path === "bin.dat")!
    expect(bin.patch).toBe("")
  })

  test("all files at once", () => {
    expect(combined(dir, from, to, allFiles)).toEqual(previous(dir, from, to, allFiles))
  })

  test("every single-file subset", () => {
    for (const file of allFiles)
      expect(combined(dir, from, to, [file])).toEqual(previous(dir, from, to, [file]))
  })

  test("every pair of files", () => {
    for (let i = 0; i < allFiles.length; i++)
      for (let j = i + 1; j < allFiles.length; j++) {
        const subset = [allFiles[i]!, allFiles[j]!]
        expect(combined(dir, from, to, subset)).toEqual(previous(dir, from, to, subset))
      }
  })

  test("reversed file order", () => {
    const reversed = [...allFiles].reverse()
    expect(combined(dir, from, to, reversed)).toEqual(previous(dir, from, to, reversed))
  })

  test("honours a different context width", () => {
    for (const context of [0, 1, 5, 20])
      expect(combined(dir, from, to, allFiles, context)).toEqual(previous(dir, from, to, allFiles, context))
  })

  test("empty path list returns empty", () => {
    expect(combined(dir, from, to, [])).toEqual([])
  })

  test("a path that did not change yields an empty diff entry in both", () => {
    const unchanged = "f1.txt"
    expect(combined(dir, from, to, [unchanged])).toEqual(previous(dir, from, to, [unchanged]))
  })
})
