import path from "path"

process.env.OPENCODE_DB = ":memory:"
process.env.OPENCODE_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.OPENCODE_DISABLE_MODELS_FETCH = "true"
// Pin the module-level User-Agent before imports can read the desktop shell's client flag.
process.env.OPENCODE_CLIENT = "cli"
