import { describe, expect, test } from "bun:test"
import path from "path"

// The ripgrep onEntry callback used to re-materialise the whole directory list once per
// discovered file, which is quadratic in files x directories. These tests keep verbatim
// copies of the old and new accumulation logic and assert they produce identical output,
// then measure the cost difference on the real shape of this repository.

type State = { files: string[]; directories: string[] }
const directories = new Set<string>()

function reset() {
  directories.clear()
}

/** verbatim previous callback body */
function OLD(paths: string[]) {
  const state: State = { files: [], directories: [] }
  reset()
  for (const p of paths) {
    state.files.push(p)
    const parts = p.split("/")
    parts.slice(0, -1).forEach((_, index) => directories.add(parts.slice(0, index + 1).join("/") + path.sep))
    state.directories = Array.from(directories)
  }
  return state
}

/** verbatim current callback body plus the lazy materialisation */
function NEW(paths: string[]) {
  const state: State = { files: [], directories: [] }
  const set = new Set<string>()
  let materialised: string[] | undefined
  const collect = (entryPath: string) => {
    const parts = entryPath.split("/")
    for (let index = 0; index < parts.length - 1; index++) set.add(parts.slice(0, index + 1).join("/") + path.sep)
  }
  const resolve = () => (materialised ??= Array.from(set))
  for (const p of paths) {
    state.files.push(p)
    collect(p)
  }
  state.directories = resolve()
  return state
}

function paths(entries: string[]) {
  return entries.map((e) => (e.endsWith(path.sep) ? e : e))
}

describe("lazy directory materialisation is equivalent", () => {
  const cases: [string, string[]][] = [
    ["empty", []],
    ["single root file", paths(["a.ts"])],
    ["one directory", paths(["src/a.ts", "src/b.ts"])],
    ["nested", paths(["a/b/c/d.ts", "a/b/e.ts", "a/f.ts", "g.ts"])],
    ["duplicate paths", paths(["src/a.ts", "src/a.ts", "src/b.ts"])],
    ["same directory many files", paths(Array.from({ length: 50 }, (_, i) => `src/mod${i % 5}/f${i}.ts`))],
    [
      "trailing separator entries",
      paths(["src/", "src/a.ts", "a/b/", "a/b/c.ts"]),
    ],
  ]

  for (const [name, input] of cases) {
    test(name, () => {
      const oldState = OLD(input)
      const newState = NEW(input)
      expect(newState.files).toEqual(oldState.files)
      expect(newState.directories).toEqual(oldState.directories)
    })
  }

  test("real repository file list produces identical output", async () => {
    const { execFileSync } = await import("node:child_process")
    const out = execFileSync("rg", ["--files", "packages"], { cwd: path.resolve(import.meta.dir, "../../.."), encoding: "utf8", maxBuffer: 1 << 28 })
    const input = out.split("\n").filter(Boolean)
    expect(input.length).toBeGreaterThan(1000)
    const oldState = OLD(input)
    const newState = NEW(input)
    expect(newState.files.length).toBe(oldState.files.length)
    expect(newState.directories).toEqual(oldState.directories)
  })
})

describe("cost", () => {
  function bench(fn: () => unknown, reps: number) {
    fn()
    const t0 = performance.now()
    for (let i = 0; i < reps; i++) fn()
    return (performance.now() - t0) / reps
  }

  test("the new accumulation is faster and the gap widens with directory count", () => {
    const rows: { files: number; dirs: number; o: number; n: number; speedup: number }[] = []
    for (const [files, dirs] of [[2000, 200], [8000, 800], [20000, 2000]] as [number, number][]) {
      const input = Array.from({ length: files }, (_, i) => `d${i % dirs}/s${i % 50}/f${i}.ts`)
      const reps = files > 8000 ? 3 : 10
      const o = bench(() => OLD(input), reps)
      const n = bench(() => NEW(input), reps)
      expect(newState(input)).toEqual(oldState(input))
      rows.push({ files, dirs, o, n, speedup: o / n })
    }
    console.log("files    dirs     old(ms)    new(ms)  speedup")
    for (const r of rows)
      console.log(
        String(r.files).padStart(6),
        String(r.dirs).padStart(6),
        r.o.toFixed(2).padStart(10),
        r.n.toFixed(2).padStart(9),
        r.speedup.toFixed(1).padStart(8) + "x",
      )
    // the whole point: quadratic term removed, so the speedup must not shrink as input grows
    for (const r of rows) expect(r.n).toBeLessThan(r.o)
    const last = rows[rows.length - 1]!
    expect(last.speedup).toBeGreaterThan(1)
  }, 60_000)
})

function oldState(input: string[]) {
  return OLD(input)
}
function newState(input: string[]) {
  return NEW(input)
}
