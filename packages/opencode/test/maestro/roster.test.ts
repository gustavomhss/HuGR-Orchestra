import { describe, expect, test } from "bun:test"
import { createRoster, lookupRosterMember, roster } from "../../src/maestro/roster"

describe("Maestro roster", () => {
  test("declares exact nine contract seats in deterministic order", () => {
    expect(roster).toEqual([
      {
        displayName: "Maestro",
        memberId: "maestro",
        role: "conductor/integrator",
        abilityClass: "lifecycle, routing, reconcile, integration",
        forbiddenActions: ["product implementation", "self-approval", "self-review"],
      },
      {
        displayName: "Charlie",
        memberId: "charlie",
        role: "backend execution",
        abilityClass: "scoped repository write",
        forbiddenActions: ["approve", "review own work", "merge"],
      },
      {
        displayName: "Patty",
        memberId: "patty",
        role: "frontend execution",
        abilityClass: "scoped repository write",
        forbiddenActions: ["approve", "review own work", "merge"],
      },
      {
        displayName: "Lucy",
        memberId: "lucy",
        role: "cold review",
        abilityClass: "read-only artifact review",
        forbiddenActions: ["edit implementation", "receive author transcript", "merge"],
      },
      {
        displayName: "Bobby",
        memberId: "bobby",
        role: "architecture",
        abilityClass: "read-only contract review",
        forbiddenActions: ["implement product", "merge"],
      },
      {
        displayName: "Billy",
        memberId: "billy",
        role: "security",
        abilityClass: "read-only threat review",
        forbiddenActions: ["implement product", "merge"],
      },
      {
        displayName: "Jimmy",
        memberId: "jimmy",
        role: "exploration",
        abilityClass: "read-only discovery",
        forbiddenActions: ["ratify alone", "edit product"],
      },
      {
        displayName: "Rosie",
        memberId: "rosie",
        role: "documentation",
        abilityClass: "scoped docs write",
        forbiddenActions: ["decide product behavior"],
      },
      {
        displayName: "Frankie",
        memberId: "frankie",
        role: "process audit",
        abilityClass: "read-only process/ledger audit",
        forbiddenActions: ["implement product", "merge"],
      },
    ])
    expect(Object.isFrozen(roster)).toBe(true)
    expect(roster.every((member) => Object.isFrozen(member) && Object.isFrozen(member.forbiddenActions))).toBe(true)
  })

  test("looks up valid member ID", () => {
    expect(lookupRosterMember("charlie")).toEqual({ status: "FOUND", member: roster[1] })
  })

  test("holds unknown or malformed member ID", () => {
    expect(lookupRosterMember("unknown")).toEqual({ status: "HOLD", reason: "unknown-member-id" })
    expect(lookupRosterMember("Charlie")).toEqual({ status: "HOLD", reason: "malformed-member-id" })
    expect(lookupRosterMember(undefined)).toEqual({ status: "HOLD", reason: "malformed-member-id" })
  })

  test("rejects duplicate member ID", () => {
    expect(() => createRoster([roster[0]!, { ...roster[0]! }])).toThrow("Roster memberId must be unique: maestro")
  })

  test("display rename preserves member identity", () => {
    const renamed = createRoster([{ ...roster[1]!, displayName: "Ana" }])

    expect(lookupRosterMember("charlie", renamed)).toEqual({ status: "FOUND", member: renamed[0] })
    expect(lookupRosterMember("ana", renamed)).toEqual({ status: "HOLD", reason: "unknown-member-id" })
  })

  test("mutation probe: removing seat makes contract test red", () => {
    expect(roster).toHaveLength(9)
  })

  test("mutation probe: removing duplicate guard makes test red", () => {
    expect(() => createRoster([roster[0]!, { ...roster[0]! }])).toThrow()
  })
})
