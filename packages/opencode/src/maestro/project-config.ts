export type ProjectConfigField = {
  id: string
  name: string
  type: string
}

export type ProjectConfig = {
  owner: "gustavomhss"
  projectID: "PVT_kwHODZlCY84Bkufi"
  projectNumber: 2
  fields: readonly ProjectConfigField[]
}

export type ProjectConfigHoldReason =
  | "invalid-config"
  | "project-owner-mismatch"
  | "project-id-mismatch"
  | "project-number-mismatch"
  | "missing-field"
  | "duplicate-field"
  | "field-mismatch"

export type ProjectConfigValidation =
  | { status: "VALID"; config: ProjectConfig }
  | { status: "HOLD"; reason: ProjectConfigHoldReason }

const projectConfig = {
  owner: "gustavomhss",
  projectID: "PVT_kwHODZlCY84Bkufi",
  projectNumber: 2,
  fields: [
    { id: "PVTSSF_lAHODZlCY84BkufizhjeEZQ", name: "Status", type: "SingleSelect" },
    { id: "PVTSSF_lAHODZlCY84BkufizhjeEfs", name: "CI", type: "SingleSelect" },
    { id: "PVTSSF_lAHODZlCY84BkufizhjeEf0", name: "Seat", type: "SingleSelect" },
    { id: "PVTSSF_lAHODZlCY84BkufizhjeEf4", name: "Priority", type: "SingleSelect" },
    { id: "PVTSSF_lAHODZlCY84BkufizhjeEi8", name: "Risk", type: "SingleSelect" },
    { id: "PVTSSF_lAHODZlCY84BkufizhjeIiM", name: "Stage", type: "SingleSelect" },
    { id: "PVTF_lAHODZlCY84BkufizhjeEi4", name: "Blocked reason", type: "ProjectV2Field" },
    { id: "PVTF_lAHODZlCY84BkufizhjeEZY", name: "Linked pull requests", type: "ProjectV2Field" },
  ],
} as const satisfies ProjectConfig

export function validateProjectConfig(input: unknown): ProjectConfigValidation {
  if (!isRecord(input) || !Array.isArray(input.fields)) return { status: "HOLD", reason: "invalid-config" }
  if (input.owner !== projectConfig.owner) return { status: "HOLD", reason: "project-owner-mismatch" }
  if (input.projectID !== projectConfig.projectID) return { status: "HOLD", reason: "project-id-mismatch" }
  if (input.projectNumber !== projectConfig.projectNumber) return { status: "HOLD", reason: "project-number-mismatch" }
  if (!input.fields.every(isField)) return { status: "HOLD", reason: "field-mismatch" }
  if (new Set(input.fields.map((field) => field.id)).size !== input.fields.length) {
    return { status: "HOLD", reason: "duplicate-field" }
  }
  if (input.fields.length < projectConfig.fields.length) return { status: "HOLD", reason: "missing-field" }
  if (input.fields.length > projectConfig.fields.length) return { status: "HOLD", reason: "field-mismatch" }

  for (const expected of projectConfig.fields) {
    const field = input.fields.find((field) => field.id === expected.id)
    if (!field) return { status: "HOLD", reason: "field-mismatch" }
    if (field.name !== expected.name || field.type !== expected.type) return { status: "HOLD", reason: "field-mismatch" }
  }

  return { status: "VALID", config: projectConfig }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isField(value: unknown): value is ProjectConfigField {
  return (
    isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.type === "string"
  )
}
