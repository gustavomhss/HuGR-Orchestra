import { describe, expect, test } from "bun:test"
import { abilityDescriptors } from "../../src/maestro/ability-descriptors"
import { createAbilityRegistry } from "../../src/maestro/ability-registry"

describe("Maestro ability descriptors", () => {
  test("declares exact core ability metadata", () => {
    expect(abilityDescriptors.map((descriptor) => descriptor.id)).toEqual([
      "repository",
      "github",
      "tests",
      "ci",
      "relay",
      "atlas",
    ])
    expect(abilityDescriptors.map((descriptor) => descriptor.requiredConfig)).toEqual([
      ["workspace"],
      ["project-config"],
      ["verification-plan"],
      ["github-project"],
      ["task-reservation"],
      ["atlas-provider"],
    ])
    expect(abilityDescriptors.map((descriptor) => descriptor.allowedSeats)).toEqual([
      ["maestro", "charlie", "patty", "rosie"],
      ["maestro"],
      ["maestro", "charlie", "lucy"],
      ["maestro"],
      ["maestro"],
      ["maestro", "jimmy"],
    ])
    expect(abilityDescriptors.map((descriptor) => descriptor.tools)).toEqual([[], [], [], [], [], []])
    expect(abilityDescriptors.every((descriptor) => descriptor.summary.length > 0)).toBe(true)
  })

  test("passes registry validation", () => {
    expect(createAbilityRegistry(abilityDescriptors).abilities).toHaveLength(6)
  })

  test("mutation probe: removing atlas makes catalog test red", () => {
    expect(abilityDescriptors.map((descriptor) => descriptor.id)).toContain("atlas")
  })
})
