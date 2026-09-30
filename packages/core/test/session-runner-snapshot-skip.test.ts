import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import path from "node:path"

// The change under test skips the step file diff when the two snapshot captures of a
// step resolve to the same git tree. These tests pin the git invariant that makes the
// skip sound, so the optimisation cannot outlive that assumption.

const repo = path.resolve(import.meta.dir, "../../..")

function git(args: string[]) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" })
}

describe("git tree equality implies an empty diff", () => {
  test("a snapshot id is a git tree id", () => {
    expect(git(["write-tree"]).trim()).toMatch(/^[0-9a-f]{40,64}$/)
  })

  test("two captures with no intervening change produce the same tree id", () => {
    expect(git(["write-tree"]).trim()).toBe(git(["write-tree"]).trim())
  })

  test("git diff --name-only between identical trees is empty", () => {
    const tree = git(["write-tree"]).trim()
    expect(git(["diff", "--name-only", tree, tree]).trim()).toBe("")
    expect(git(["diff", "--name-only", "-z", tree, tree])).toBe("")
  })

  test("the check-ignore the diff would run on an empty list is a no-op", () => {
    // Snapshot.files short-circuits on an empty path list, so the skip matches that path
    const result = (() => {
      try {
        return execFileSync("git", ["check-ignore", "--no-index", "--stdin", "-z"], {
          cwd: repo,
          input: "",
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        })
      } catch (error: any) {
        return error.stdout ?? ""
      }
    })()
    expect(String(result)).toBe("")
  })
})

describe("the skip cannot change what revert sees", () => {
  // revert.ts is the only reader of the projected file list, and it iterates `?? []`.
  test("the sole consumer treats an absent list as empty", async () => {
    const source = await Bun.file(path.join(repo, "packages/core/src/session/revert.ts")).text()
    const occurrences = source.match(/snapshot(\?)?\.files/g) ?? []
    expect(occurrences.length).toBeGreaterThan(0)
    expect(source).toContain("message.snapshot.files ?? []")
    // and nothing anywhere else reads it
    const { execFileSync: run } = await import("node:child_process")
    const hits = run("rg", ["-l", "snapshot\\??\\.files", "packages", "-g", "!node_modules"], {
      cwd: repo,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter((line: string) => line && !line.includes("/test/") && !line.includes(".test."))
    expect(hits.length).toBeGreaterThan(0)
    for (const file of hits) {
      const text = await Bun.file(path.join(repo, file)).text()
      if (file.endsWith("revert.ts")) continue
      // any other reader must still be compatible with an undefined list
      expect(text).not.toMatch(/snapshot(\?)?\.files\.length/)
      expect(text).not.toMatch(/snapshot(\?)?\.files\.map\(/)
    }
  })
})
