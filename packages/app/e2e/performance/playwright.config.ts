import config from "../../playwright.config"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
process.env.PLAYWRIGHT_SERVER_PORT = String(port)
process.env.OPENCODE_PERFORMANCE_RUN_ID ??= `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`

export default {
  ...config,
  testDir: ".",
  // Benchmarks are .spec.ts. Selecting by match rather than only by ignore keeps Bun-run unit
  // files out of Playwright's loader: `unit/*.test.ts` and
  // `timeline-stability/fixture.test.ts` import `bun:test`, and Node's ESM loader rejects the
  // `bun:` scheme, which aborted collection before any benchmark ran. timeline-stability owns
  // its own config and is not a benchmark suite.
  testMatch: "timeline/**/*.spec.ts",
  testIgnore: "timeline-stability/**",
  outputDir: "../test-results/performance",
  fullyParallel: false,
  workers: 1,
  reporter: [["html", { outputFolder: "../playwright-report/performance", open: "never" }], ["line"]],
  webServer: {
    ...config.webServer,
    command: `bun run build && bun run serve -- --host 0.0.0.0 --port ${port} --strictPort`,
    reuseExistingServer: false,
  },
}
