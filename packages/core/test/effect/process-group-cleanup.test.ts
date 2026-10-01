import { describe, expect } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(CrossSpawnSpawner.node))

describe.skipIf(process.platform === "win32")("POSIX process group ownership", () => {
  for (const input of (["scope", "SIGTERM", "SIGKILL", "SIGUSR1"] as const).flatMap((operation) =>
    [false, true].map((stubborn) => ({ operation, stubborn })),
  )) {
    it.live(`${input.operation} kills ${input.stubborn ? "stubborn" : "ordinary"} descendant after leader exit`, () =>
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "opencode-process-group-"))),
          (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
        )
        const child = { pid: 0 }
        const exited = Effect.gen(function* () {
          while (!/^(Z|$)/.test(state(child.pid))) yield* Effect.sleep("20 millis")
        }).pipe(Effect.timeout("2 seconds"))
        yield* Effect.addFinalizer(() =>
          child.pid
            ? Effect.try({ try: () => process.kill(child.pid, "SIGKILL"), catch: (error) => error }).pipe(Effect.ignore)
            : Effect.void,
        )
        expect(state(process.pid)).toMatch(/^[^Z]/)
        const code = yield* Effect.scoped(
          Effect.gen(function* () {
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
            const handle = yield* spawner.spawn(
              ChildProcess.make(
                "node",
                [
                  "-e",
                  `
const child = require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(`
${input.stubborn ? 'process.on("SIGTERM", () => {})' : ""}
process.on("SIGUSR1", () => {
  require("node:fs").writeFileSync(${JSON.stringify(path.join(directory, "signal"))}, "SIGUSR1")
  process.exit(0)
})
process.send(process.pid)
setInterval(() => {}, 60000)
`)}], { stdio: ["ignore", ${JSON.stringify(input.operation === "SIGKILL" ? "ignore" : "inherit")}, ${JSON.stringify(input.operation === "SIGKILL" ? "ignore" : "inherit")}, "ipc"] })
child.once("message", (pid) => { console.log(pid); process.exit(0) })
`,
                ],
                { forceKillAfter: "100 millis" },
              ),
            )
            const lines = yield* handle.stdout.pipe(
              Stream.decodeText(),
              Stream.splitLines,
              Stream.take(1),
              Stream.runCollect,
            )
            child.pid = Number(lines[0])
            expect(child.pid).toBeGreaterThan(0)
            expect(state(child.pid)).toMatch(/^[^Z]/)
            const group = Bun.spawnSync(["ps", "-o", "pgid=", "-p", String(child.pid)])
            expect(group.exitCode).toBe(0)
            expect(Number(group.stdout.toString())).toBe(Number(handle.pid))
            const code = yield* handle.exitCode
            if (input.operation !== "scope") {
              yield* handle.kill({ killSignal: input.operation, forceKillAfter: "100 millis" })
              // Observe public kill before scope cleanup can repair a missing implementation.
              yield* exited
              expect(state(child.pid)).toMatch(/^(Z|$)/)
              if (input.operation === "SIGUSR1")
                expect(yield* Effect.promise(() => Bun.file(path.join(directory, "signal")).text())).toBe("SIGUSR1")
            }
            return code
          }),
        )
        expect(code).toBe(ChildProcessSpawner.ExitCode(0))
        yield* exited
        expect(state(child.pid)).toMatch(/^(Z|$)/)
      }),
    )
  }
})

function state(pid: number) {
  const result = Bun.spawnSync(["ps", "-o", "stat=", "-p", String(pid)])
  const output = result.stdout.toString().trim()
  if ((result.exitCode === 0 || result.exitCode === 1) && !output && !result.stderr.length) return ""
  if (result.exitCode !== 0 || !output) throw new Error(`ps failed: ${result.stderr.toString()}`)
  return output
}
