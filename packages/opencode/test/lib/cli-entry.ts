import path from "node:path"
import { rm } from "node:fs/promises"

const root = path.resolve(import.meta.dir, "../..")
const outdir = path.join(root, "node_modules/.cache", `opencode-cli-test-${process.pid}`)
export const sourceEntry = path.join(root, "src/index.ts")
// Compile once during module setup, before child startup and request deadlines begin.
export const cliEntry =
  process.platform === "win32" || process.env.OPENCODE_TEST_CLI_BUNDLE === "1"
    ? await build().catch(async (error) => {
        await disposeCliEntry()
        throw error
      })
    : sourceEntry

export function disposeCliEntry() {
  return rm(outdir, { recursive: true, force: true })
}

async function build() {
  const proc = Bun.spawn([process.execPath, "run", path.join(root, "test/lib/cli-build.ts"), outdir], {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
    killSignal: "SIGKILL",
  })
  const result = await Promise.all([proc.exited, tail(proc.stdout), tail(proc.stderr)]).catch(async (error) => {
    if (proc.exitCode == null && proc.signalCode == null) proc.kill("SIGKILL")
    await proc.exited
    throw error
  })
  if (result[0] !== 0)
    throw new Error(
      `CLI test preparation failed (exit=${result[0]}, signal=${proc.signalCode})\n${result[1]}${result[2]}`,
    )
  const entry = path.join(outdir, "index.js")
  if (!(await Bun.file(entry).exists())) throw new Error("CLI build succeeded without its entry point")
  return entry
}

async function tail(stream: ReadableStream<Uint8Array>) {
  let text = ""
  const decoder = new TextDecoder()
  await stream.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        text = (text + decoder.decode(chunk, { stream: true })).slice(-8192)
      },
    }),
  )
  return (text + decoder.decode()).slice(-8192)
}
