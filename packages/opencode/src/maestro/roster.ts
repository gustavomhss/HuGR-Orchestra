export type RosterMember = {
  readonly displayName: string
  readonly memberId: string
  readonly role: string
  readonly abilityClass: string
  readonly returnCard: string
  readonly forbiddenActions: readonly string[]
}

export type Roster = readonly RosterMember[]

export type RosterLookup =
  | { status: "FOUND"; member: RosterMember }
  | { status: "HOLD"; reason: "malformed-member-id" | "unknown-member-id" }

export const roster = createRoster([
  {
    displayName: "Maestro",
    memberId: "maestro",
    role: "conductor/integrator",
    abilityClass: "lifecycle, routing, reconcile, integration",
    returnCard: "transition/Project/merge receipt",
    forbiddenActions: ["product implementation", "self-approval", "self-review"],
  },
  {
    displayName: "Charlie",
    memberId: "charlie",
    role: "backend execution",
    abilityClass: "scoped repository write",
    returnCard: "implementation card, gates, diff receipt",
    forbiddenActions: ["approve", "review own work", "merge"],
  },
  {
    displayName: "Patty",
    memberId: "patty",
    role: "frontend execution",
    abilityClass: "scoped repository write",
    returnCard: "implementation card, sensory evidence, diff receipt",
    forbiddenActions: ["approve", "review own work", "merge"],
  },
  {
    displayName: "Lucy",
    memberId: "lucy",
    role: "cold review",
    abilityClass: "read-only artifact review",
    returnCard: "cited APPROVE/FIX_FIRST/REJECT card",
    forbiddenActions: ["edit implementation", "receive author transcript", "merge"],
  },
  {
    displayName: "Bobby",
    memberId: "bobby",
    role: "architecture",
    abilityClass: "read-only contract review",
    returnCard: "seam/contract verdict",
    forbiddenActions: ["implement product", "merge"],
  },
  {
    displayName: "Billy",
    memberId: "billy",
    role: "security",
    abilityClass: "read-only threat review",
    returnCard: "threat verdict and cited controls",
    forbiddenActions: ["implement product", "merge"],
  },
  {
    displayName: "Jimmy",
    memberId: "jimmy",
    role: "exploration",
    abilityClass: "read-only discovery",
    returnCard: "grounded findings card",
    forbiddenActions: ["ratify alone", "edit product"],
  },
  {
    displayName: "Rosie",
    memberId: "rosie",
    role: "documentation",
    abilityClass: "scoped docs write",
    returnCard: "docs evidence card",
    forbiddenActions: ["decide product behavior"],
  },
  {
    displayName: "Frankie",
    memberId: "frankie",
    role: "process audit",
    abilityClass: "read-only process/ledger audit",
    returnCard: "audit verdict",
    forbiddenActions: ["implement product", "merge"],
  },
])

export function createRoster(members: readonly RosterMember[]): Roster {
  const memberIds = new Set<string>()
  return Object.freeze(
    members.map((member) => {
      if (!canonicalMemberId(member.memberId)) throw new Error(`Roster memberId must be canonical: ${member.memberId}`)
      if (memberIds.has(member.memberId)) throw new Error(`Roster memberId must be unique: ${member.memberId}`)
      memberIds.add(member.memberId)
      return Object.freeze({ ...member, forbiddenActions: Object.freeze([...member.forbiddenActions]) })
    }),
  )
}

export function lookupRosterMember(memberId: unknown, members: Roster = roster): RosterLookup {
  if (!canonicalMemberId(memberId)) {
    return { status: "HOLD", reason: "malformed-member-id" }
  }
  const member = members.find((candidate) => candidate.memberId === memberId)
  if (!member) return { status: "HOLD", reason: "unknown-member-id" }
  return { status: "FOUND", member }
}

function canonicalMemberId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]+(?:-[a-z]+)*$/.test(value)
}
