import path from "node:path"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const root = path.resolve(import.meta.dir, "../..")
const outdir = process.argv[2]
if (!outdir) throw new Error("CLI test build requires its process-owned output directory")
const result = await Bun.build({
  entrypoints: [path.join(root, "src/index.ts")],
  outdir,
  target: "bun",
  format: "esm",
  minify: true,
  conditions: ["bun", "node"],
  tsconfig: path.join(root, "tsconfig.json"),
  plugins: [createSolidTransformPlugin()],
  external: ["node-gyp", "@opentui/core"],
  define: { OPENCODE_WORKER_PATH: JSON.stringify(path.join(root, "src/cli/tui/worker.ts")) },
  // Split JS bundles retain WASM import attributes on wrapper chunks rather than the asset.
  splitting: false,
})
if (!result.success) throw new AggregateError(result.logs, "Failed to bundle the real CLI for subprocess tests")
const entries = result.outputs.filter((output) => output.kind === "entry-point")
if (entries.length !== 1) throw new Error(`Expected one CLI entry point, received ${entries.length}`)
if (entries[0].path !== path.join(outdir, "index.js")) throw new Error("CLI build emitted an unexpected entry point")
