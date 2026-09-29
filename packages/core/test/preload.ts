import path from "path"

process.env.OPENCODE_DB = ":memory:"
process.env.OPENCODE_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.OPENCODE_DISABLE_MODELS_FETCH = "true"
// models-dev.ts builds its User-Agent in a module-level const from this flag, and
// test/models.test.ts asserts the value. A shell that exports OPENCODE_CLIENT (the
// desktop app sets it to "desktop") would otherwise decide the outcome of a unit test,
// so pin it before any module reads it.
process.env.OPENCODE_CLIENT = "cli"
