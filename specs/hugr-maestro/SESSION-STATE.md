# Maestro V2 Session State

Snapshot: 2026-09-27. Current `fork/dev` baseline:
`b8f9b03c8550445c48cb204c962f595f5d2a99de` (`chore: generate`). Historical
`102e763599` baseline remains evidence only.

This is the short operational snapshot. Read [ROADMAP.md](ROADMAP.md) for dependency order, work in progress, and cleanup rules. GitHub issues remain the acceptance-contract source of truth.

## Current Position

| Area                         | State                              | Evidence / boundary                                                                                                                      |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Maestro and Atlas foundation | Integrated into `dev`              | PR #11 merged; do not treat its old branch as active integration work.                                                                   |
| Admission evidence           | Partial                            | `maestro_record_admission` records and replays explicit admission. Session prompt handling does not trigger it automatically. See #110.  |
| Approval evidence            | Partial and fail-closed            | Presentation and decision events exist. Presentation refuses until durable PlanRevision and validation readers exist. See #106 and #114. |
| Governed Task                | Internal fence only                | Exact durable event binding is enforced for explicit governed Tasks. It is not public runtime authority.                                 |
| Atlas territory catalog      | Internal Atlas implementation only | `foundation/atlas` has `territoryCatalog(projectId)`. No installed host boundary exists. See #112.                                       |
| Static Own                   | Snapshot and guard exist           | Canonical host consumption boundary is not implemented. See #109.                                                                        |
| Context adapter              | Not implemented                    | AtlasContextEnvelope and ContextToolPlan remain contract-only. See #108.                                                                 |
| M0.3 validator               | Delivered pure validator only       | #183 validates legacy bodies; it has no runtime wiring, GitHub mutation, or readiness writer.                                               |
| M0.4 conflict map            | Active/HOLD queue                   | #206 freezes legacy normalization and conflict facts before any implementation WP can become `READY`.                                       |

## Recent Delivery

- PR #124 made GitHub App credentials optional. Fork workflows use `GITHUB_TOKEN`; malformed partial App configuration fails closed.
- PR #125 fixed malformed Atlas HTML, restored `generate`, and limits final `publish` to upstream `anomalyco/opencode`.
- Historical 2026-09-25 generated successor baseline was `102e763599`; no current-base workflow URL is recorded here.
- Fork `publish` is intentionally skipped.
- Windows Core instability remains tracked in #102. A successful rerun is not root-cause evidence; require a reproducer and focused regression gate before claiming Windows stability.
- GitHub Actions evidence must name its SHA. Do not inherit matrix evidence from historical `688d264010` or `102e763599`.
- #206 runs from `b8f9b03c8550445c48cb204c962f595f5d2a99de`; its map retains
  #107 and #113 for coordination and holds every implementation WP.

## Active Blockers

| Priority | Item                                                       | Why it blocks                                                                                                         |
| -------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| P1       | #107 Atlas/Own remediation ledger                          | Context cannot claim trusted Atlas/Own evidence until source findings have ordered ownership and release disposition. |
| P1       | #112 installed territory catalog boundary                  | #114 and #108 need versioned canonical Territory objects outside direct vendor imports.                               |
| P1       | #114 durable PlanRevision, ContextRecord, ValidationRecord | #108 persists and #106 reads authority; neither reconstructs tool parameters.                                         |
| P1       | #106 durable approval readers                              | Public approval presentation remains disabled without these readers.                                                  |
| P1       | #109 canonical Own host boundary                           | #108 cannot consume static Own context safely without it.                                                             |
| P1       | #108 ContextToolPlan adapter                               | This is required before Atlas-backed governed work can run.                                                           |
| P2       | #102 Windows Core test instability                         | Root cause remains open; do not paper over with broad timeout or serialization changes.                               |
| P2       | #113 safety hardening                                      | #25, #42, #49, #62, #72, and #86 must close or be explicitly non-applicable before #111.                              |

## Do Not Claim

- Do not claim Maestro public governed flow is usable.
- Do not claim Atlas context is injected at runtime.
- Do not use direct relative imports from `foundation/atlas`.
- Do not treat model-supplied plan, validation, policy, or task hashes as authority.
- Do not use stale PR CI or old worktree tests as evidence for current `dev`.

## Next Execution

1. Normalize and validate retained legacy bodies through delivered M0.3.
2. Freeze #107 disposition and #102 Windows lifecycle root evidence.
3. Freeze #112 installed boundary, #114 durable records, #109 Own boundary, then #108 context.
4. Freeze #106/#110 shared seams; run #111 only as fresh current-base integration gate.

## Update Rule

Update this file after a merge, a CI root-cause result, a roadmap dependency change, or a WIP disposition. Record immutable SHA and GitHub URL where available; never replace evidence with a narrative summary.
