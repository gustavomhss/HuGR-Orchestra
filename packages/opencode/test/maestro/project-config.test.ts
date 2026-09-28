import { describe, expect, test } from "bun:test"
import { validateProjectConfig, type ProjectConfig } from "../../src/maestro/project-config"

const config: ProjectConfig = {
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
}

describe("maestro.project-config", () => {
  test("validates exact Project census", () => {
    expect(validateProjectConfig(config)).toEqual({ status: "VALID", config })
  })

  test("holds malformed input and wrong Project identity", () => {
    expect(validateProjectConfig(null)).toEqual({ status: "HOLD", reason: "invalid-config" })
    expect(validateProjectConfig({ ...config, fields: null })).toEqual({ status: "HOLD", reason: "invalid-config" })
    expect(validateProjectConfig({ ...config, owner: "other" })).toEqual({ status: "HOLD", reason: "project-owner-mismatch" })
    expect(validateProjectConfig({ ...config, projectID: "other" })).toEqual({ status: "HOLD", reason: "project-id-mismatch" })
    expect(validateProjectConfig({ ...config, projectNumber: 3 })).toEqual({ status: "HOLD", reason: "project-number-mismatch" })
  })

  test("holds missing and duplicate fields", () => {
    expect(validateProjectConfig({ ...config, fields: config.fields.slice(1) })).toEqual({
      status: "HOLD",
      reason: "missing-field",
    })
    expect(validateProjectConfig({ ...config, fields: [...config.fields, config.fields[0]] })).toEqual({
      status: "HOLD",
      reason: "duplicate-field",
    })
  })

  test("holds field ID, name, and type mismatches", () => {
    for (const fields of [
      [{ ...config.fields[0], id: "wrong" }, ...config.fields.slice(1)],
      [{ ...config.fields[0], name: "wrong" }, ...config.fields.slice(1)],
      [{ ...config.fields[0], type: "wrong" }, ...config.fields.slice(1)],
      [...config.fields, { id: "extra", name: "Extra", type: "SingleSelect" }],
    ]) {
      expect(validateProjectConfig({ ...config, fields })).toEqual({ status: "HOLD", reason: "field-mismatch" })
    }
  })
})
