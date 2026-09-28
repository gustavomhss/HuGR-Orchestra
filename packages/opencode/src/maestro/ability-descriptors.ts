import type { AbilityDescriptor } from "./ability-registry"

export const abilityDescriptors = [
  {
    id: "repository",
    summary: "Manage repository state.",
    requiredConfig: ["workspace"],
    allowedSeats: ["maestro", "charlie", "patty", "rosie"],
    tools: [],
  },
  {
    id: "github",
    summary: "Coordinate GitHub work.",
    requiredConfig: ["project-config"],
    allowedSeats: ["maestro"],
    tools: [],
  },
  {
    id: "tests",
    summary: "Run verification work.",
    requiredConfig: ["verification-plan"],
    allowedSeats: ["maestro", "charlie", "lucy"],
    tools: [],
  },
  {
    id: "ci",
    summary: "Coordinate continuous integration.",
    requiredConfig: ["github-project"],
    allowedSeats: ["maestro"],
    tools: [],
  },
  {
    id: "relay",
    summary: "Reserve delegated tasks.",
    requiredConfig: ["task-reservation"],
    allowedSeats: ["maestro"],
    tools: [],
  },
  {
    id: "atlas",
    summary: "Use Atlas project services.",
    requiredConfig: ["atlas-provider"],
    allowedSeats: ["maestro", "jimmy"],
    tools: [],
  },
] as const satisfies readonly AbilityDescriptor[]
