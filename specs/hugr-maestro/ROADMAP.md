# Maestro V2 Delivery Roadmap

Snapshot: 2026-09-28. Current planning baseline: local `dev` at
`311445f3051d3038f266c1321f95879ee8cb0ab6`. Historical `b8f9b03c8550445c48cb204c962f595f5d2a99de`
and `102e763599` baselines remain evidence only.

## Purpose

This file consolidates Maestro/Atlas delivery state, related CI, relevant PRs, and local worktrees. It does not inventory unrelated product branches, close issues, or rewrite issue contracts. Issue bodies own acceptance criteria; this file owns ordering, current disposition, and operational hygiene.

## Sources Of Truth

| Question                           | Source                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Current integration baseline       | `fork/dev` and its GitHub Actions runs                                                            |
| Acceptance and completion criteria | GitHub issues #106 through #114 and their linked native issues                                    |
| Design contracts                   | `specs/hugr-maestro/methods/*.md`, `atlas-context-envelope-*.md`, and `atlas-adapter-research.md` |
| Current delivery posture           | [SESSION-STATE.md](SESSION-STATE.md)                                                              |
| Historical audit material          | Older audit PRs and session records; never use alone as current delivery proof                    |

## Delivered Surface

| Capability                                  | Delivered             | Explicit limit                                                                         |
| ------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| Maestro agent and admission assessment      | Yes                   | Admission is recorded only through explicit Maestro tool invocation.                   |
| Approval presentation and decision evidence | Yes                   | Durable plan and validation readers are missing, so presentation is fail-closed.       |
| Governed Task fence                         | Yes                   | Historical delivery fence protects explicit governed Task calls only. Current contract requires exact current `ELIGIBLE_FOR_EXECUTION` projection; public flow remains unusable. |
| Atlas territory catalog implementation      | Yes, inside Atlas     | It is not exported through an installed host boundary.                                 |
| Static Own snapshot and guard               | Yes                   | Host consumption is not yet canonical/freshness-verified.                              |
| GitHub App fallback                         | Yes                   | Fork uses workflow token; App remains supported when fully configured.                 |
| Generate workflow                           | Yes                   | Generated successor baseline is `102e763599`; no workflow URL is recorded here.        |
| Fork publish workflow                       | Intentionally skipped | Release remains upstream-only.                                                         |
| M0.1 / #184 program contract                | Yes                   | Contract receipt only; no implementation readiness claim.                             |
| M0.2 / #187 baseline evidence               | Yes                   | Evidence is bounded to recorded source and SHA.                                        |
| M0.3 / #183 work-contract validator         | Yes                   | Pure validator only; no runtime wiring, GitHub mutation, or readiness writer.         |

## M0.4 Conflict Map Receipt

M0.4 / #206 is running on base
`b8f9b03c8550445c48cb204c962f595f5d2a99de`. This is a planning receipt,
not product dispatch. `UNFROZEN` is deliberate: no owner, interface, check,
or dependency is inferred beyond recorded inventory. Every implementation WP
remains `HOLD`; #107 and #113 are retained coordination only.

| wpId | disposition | baseSha | ownerFiles | sharedFiles/integrationOwner | interfaceAnchor | dependencyIds | pairwiseVerdict | requiredChecks | mergeOrder | validatorReceipt | coldReview |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #106 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN; approval/read seam shared with #114 | `packages/opencode/src/tool/registry.ts`; `packages/opencode/src/tool/task.ts` / UNFROZEN | UNFROZEN | #114, #108 | HOLD: shared #106/#114 approval/read seam | UNFROZEN | 6 | M0.3 delivered; legacy body normalization pending | PENDING |
| #107 | RETAINED COORDINATION | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN | UNFROZEN / lead | UNFROZEN | UNFROZEN | HOLD: coordination only; no implementation WP | UNFROZEN | 2 | M0.3 delivered; legacy body normalization pending | PENDING |
| #108 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN | UNFROZEN / UNFROZEN | UNFROZEN | #112, #114, #109 | HOLD: interface and ownership unresolved | UNFROZEN | 5 | M0.3 delivered; legacy body normalization pending | PENDING |
| #109 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN | `foundation/atlas/packages/index/src/index.ts`; `.github/workflows/test.yml`; unnamed OpenCode host adapter / UNFROZEN | UNFROZEN | #107 | HOLD: interface and host boundary unresolved | UNFROZEN | 4 | M0.3 delivered; legacy body normalization pending | PENDING |
| #110 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN; admission seam shared with #62 | `packages/opencode/src/tool/registry.ts`; `packages/opencode/src/session/prompt.ts`; `packages/opencode/src/tool/task.ts` / UNFROZEN | UNFROZEN | #62 | HOLD: shared #62/#110 admission seam | UNFROZEN | 6 | M0.3 delivered; legacy body normalization pending | PENDING |
| #111 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | `packages/opencode/src/maestro/governed-task.ts`; `packages/opencode/src/maestro/task-hash.ts`; `packages/opencode/src/tool/task.ts` | `packages/opencode/src/session/prompt.ts`; `packages/opencode/src/tool/registry.ts` / UNFROZEN | UNFROZEN | #102, #107, #112, #114, #109, #108, #106, #110, #113 | HOLD: all predecessors unresolved | UNFROZEN | 7 | M0.3 delivered; legacy body normalization pending | PENDING |
| #112 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | `foundation/atlas/packages/index/src/territory-catalog.ts` | `foundation/atlas/packages/index/src/index.ts`; `foundation/atlas/packages/index/package.json`; `.github/workflows/test.yml` / UNFROZEN | UNFROZEN | UNFROZEN | HOLD: installed boundary UNFROZEN | UNFROZEN | 3 | M0.3 delivered; legacy body normalization pending | PENDING |
| #113 | RETAINED COORDINATION | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN | `packages/opencode/src/tool/task.ts` task cluster / UNFROZEN | UNFROZEN | #25, #42, #49, #62, #72, #86 | HOLD: coordination only; child seams unresolved | UNFROZEN | 1 | M0.3 delivered; legacy body normalization pending | PENDING |
| #114 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN; approval/read seam shared with #106 | `packages/opencode/src/tool/registry.ts`; `packages/opencode/src/tool/task.ts` / UNFROZEN | UNFROZEN | #112 | HOLD: durable-record and shared approval/read seam unresolved | UNFROZEN | 4 | M0.3 delivered; legacy body normalization pending | PENDING |
| #25 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN | UNFROZEN / UNFROZEN | UNFROZEN | #113 | HOLD: #113 child unresolved | UNFROZEN | 1 | M0.3 delivered; legacy body normalization pending | PENDING |
| #42 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN | `packages/opencode/src/tool/task.ts` task cluster / UNFROZEN | UNFROZEN | #113 | HOLD: shared task cluster | UNFROZEN | 1 | M0.3 delivered; legacy body normalization pending | PENDING |
| #49 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN | `packages/opencode/src/tool/task.ts` task cluster / UNFROZEN | UNFROZEN | #113 | HOLD: shared task cluster | UNFROZEN | 1 | M0.3 delivered; legacy body normalization pending | PENDING |
| #62 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN; admission seam shared with #110 | `packages/opencode/src/tool/registry.ts`; `packages/opencode/src/session/prompt.ts`; `packages/opencode/src/tool/task.ts` / UNFROZEN | UNFROZEN | #113 | HOLD: shared #62/#110 admission seam | UNFROZEN | 1 | M0.3 delivered; legacy body normalization pending | PENDING |
| #72 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN | `packages/opencode/src/tool/task.ts` task cluster / UNFROZEN | UNFROZEN | #113 | HOLD: shared task cluster | UNFROZEN | 1 | M0.3 delivered; legacy body normalization pending | PENDING |
| #86 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN | `packages/opencode/src/tool/task.ts` task cluster / UNFROZEN | UNFROZEN | #113 | HOLD: shared task cluster | UNFROZEN | 1 | M0.3 delivered; legacy body normalization pending | PENDING |
| #94 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN | UNFROZEN / UNFROZEN | UNFROZEN | UNFROZEN | HOLD: Atlas tracker | UNFROZEN | 1 | M0.3 delivered; legacy body normalization pending | PENDING |
| #102 | HOLD | `b8f9b03c8550445c48cb204c962f595f5d2a99de` | UNFROZEN | `.github/workflows/test.yml` / lead | UNFROZEN | UNFROZEN | HOLD: Windows lifecycle root evidence UNFROZEN | UNFROZEN | 2 | M0.3 delivered; legacy body normalization pending | PENDING |

M0.4 execution order: normalize and validate legacy bodies; freeze #107
disposition and #102 root evidence; freeze #112 installed boundary; #114
durable records; #109 Own boundary; #108 context; #106 and #110; then #111
gate. No product dispatch follows from this map.

## Revised Team-First Execution Plan

Status: proposed replacement for the blocked Atlas-first DAG below. This plan
delivers a small governed Maestro team before Atlas-backed work. It does not
add plan-version storage or duplicate Atlas context.

### Cut

Defer #94, #102, #107, #108, #109, #112, #196, #199, #200, #201, #202,
#203, #204, and #205. Atlas remains a later context provider; when present,
Maestro stores only the Atlas receipt identity/hash it consumed. It never
rebuilds an Atlas ContextRecord.

### Wave 0: Packet Freeze

Owner: #206 lead only. Freeze exact files, interfaces, checks, mutation probes,
and merge order for Waves 1-3. Missing field is HOLD. Reuse OpenCode EventV2,
Task resume, deterministic reservation, and permission snapshots. Reuse only
local reimplementations of TechLead's ordered-fold, policy, and cold-review
behavior; never import its runtime, storage, hooks, shell, MCP registration,
or `master` assumptions.

#181 belongs here as a feasibility proof. Prove native Task resumes one exact
child with exact parent, agent, permission snapshot, and prior context. Until
this passes, later authorization may be recorded but is non-dispatchable.
Order is: freeze #181 packet in #206, execute #181, then dispatch Wave 1.

### Wave 1: Team And Validation

Owners: #188 roster, #189 route/grants, #190 review cards, and #114
ValidationRecord.

1. Materialize Maestro plus eight seats with immutable `memberId`, role, and
   prohibited actions. Markdown roster is doctrine; typed roster is authority.
2. Route each supported work type to one seat and issue only its scoped grant.
   Maestro routes/spawns; no seat self-grants, self-approves, self-reviews, or
   merges.
3. Add one durable `ValidationRecord`: immutable work-card bytes/hash,
   direct-request ID/hash, roster/route/grant/review-policy revision hashes,
   validator ID/version, deterministic named check results, and
   `VALID|INVALID|HOLD`. It validates that exact subject; no PlanRevision
   table/event exists.
4. Define artifact-only work cards and Lucy review receipt. Reviewer receives
   card, diff, and check evidence, never author transcript; identity collision
   holds.

Exit: a valid work card has one routed seat, grant, ValidationRecord, and
independent-review requirement. Tests cover unknown seat/work type, grant
escalation, self-review, malformed card, failed validation, and replay.

### Wave 2: Approval Authorization

Owners: #110 admission boundary and #106 direct approval.

1. Persisted direct-user messages admit once; synthetic, assistant, tool,
   stale, and duplicate messages do not.
2. Present one validated work card. Direct user reply is the only approval
   source; model output, tool output, and historical event injection hold.
3. On exact approval, append one durable `AuthorizationGranted` event. It
   contains reply ID, ValidationRecord ID/hash, immutable work-card hash,
   routed seat, immutable roster/grant/review-policy revision hashes, reviewer
   requirement, and task intent hash. This one event is Task authority; no
   separate eligibility projection or general transaction framework exists.
4. Card, roster, grant, review policy, validation, or approval binding change
   makes old authorization non-dispatchable; it never reinterprets an old hash
   through current policy. A new presentation and authorization are required.
   Atlas is optional and absent from this path.

Exit: one direct user request produces one exact AuthorizationGranted event
bound to a real team seat. Tests prove forged approval, stale card, changed
grant, and duplicate reply cannot authorize dispatch.

### Wave 3: Governed Dispatch

Owners: #111 and only #113 children required by its Task boundary. #181 is
already a Wave 0 prerequisite.

1. Prove native Task resume continues exact child context for exact child ID,
   parent, agent, permission snapshot, and controlled next input. Missing or
   mismatched governed ID holds; generic Task behavior remains unchanged.
2. Task reads only AuthorizationGranted plus current work-card route/grant.
   It rejects arbitrary `subagent_type`, wrong seat, grant, reviewer state,
   parent, agent, project, session, or task hash before child creation.
3. Use one narrow atomic reservation transaction keyed by authorization ID and
   task-intent hash: reserve one deterministic child ID, then bind
   create/resume and consume receipt to it. This is dispatch serialization, not
   an eligibility writer framework. Duplicate delivery and recovery reuse one
   bound child and never create a second prompt or provider turn.
4. Require Lucy approval receipt before delivery completion where card requires
   review. Runner prose and author claim never advance work state.
5. At reservation and every recovery/resume, compare current roster, route,
   grant, and review-policy hashes with AuthorizationGranted. Any roster-only
   drift holds; policy may not reinterpret an old authorization.

Exit: one approved team work card dispatches exactly once to its routed seat,
resumes exactly its child, and requires independent review before completion.
Tests cover concurrent delivery, post-reservation crash, foreign child/seat,
grant drift, self-review, missing review, and duplicate provider turn.

### Wave Rules

- Wave N+1 cannot implement around an unresolved Wave N interface.
- Each WP has one conflict-map row, named consumer, exact commands, mutation
  probe, and cold review before dispatch.
- Helpers without a Wave 1-3 runtime consumer remain HOLD, not authority.

## Historical Delivery DAG

```text
CI root cause (#102) ------------> reliable current-base evidence

#107 remediation ledger ---------> trusted Atlas/Own release disposition

#112 catalog boundary -----------> #114 durable plan/context/validation records
                                           |
#109 Own host boundary --------------------+--> #108 context adapter -----> #106 approval readers -----> #111 current-base integration gate

#110 automatic admission -----------------------------------------------> #111 current-base integration gate

#113 safety children (#25, #42, #49, #62, #72, #86) --------------------> #111 current-base integration gate

#102 CI root cause + #107 remediation ledger + all applicable #113 P1/P2 -> #111 current-base integration gate
```

## Ordered Backlog

| Order | Issue   | State                     | Entry condition                                                                                                                                                                                          | Exit condition                                                                                  |
| ----- | ------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 0     | legacy bodies | M0.4 active/HOLD | Validate each retained legacy body through delivered M0.3 pure validator | No retained item becomes `READY` without validator receipt. |
| 1     | #107 / #102 | HOLD | Freeze #107 disposition and #102 root evidence | Coordination disposition and focused Windows root-cause evidence are frozen. |
| 2     | #112 | HOLD | Freeze installed read boundary | No interface is inferred from internal Atlas implementation. |
| 3     | #114 | HOLD | #112 boundary frozen | Durable-record interface is frozen. |
| 4     | #109 | HOLD | #107 disposition and #114 records frozen | Own host boundary is frozen. |
| 5     | #108 | HOLD | #112, #114, and #109 boundaries frozen | Context interface and ownership are frozen. |
| 6     | #106 / #110 | HOLD | #114 / #108 and #62 seams frozen | Approval/read and admission shared seams are sequenced. |
| 7     | #111 | HOLD | All applicable predecessors and current-base evidence frozen | Fresh current-base integration-gate evidence. |

## Work In Progress And PR Triage

### Current-Base Work

Open PRs targeting `dev` include unrelated product work (#5, #12, #13). They are not part of the Maestro/Atlas path unless their issue contracts say so.

### Historical Maestro Line

PRs #87, #88, #89, #115, and #116 target `maestro/rebuild-fork-dev-clean`, not current `dev`. They are historical candidates, not active delivery proof.

Before any of them is resumed:

1. Compare its contract against current issue scope.
2. Rebase or transplant only intended commits onto current `dev`.
3. Rerun current CI and independent review.
4. Close or replace the old PR when its evidence is superseded.

### Known Experimental Worktrees

| Worktree                             | State at snapshot                                                           | Disposition                                                      |
| ------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `orchestra-dev`                      | Clean; local `dev` tracks `fork/feat/app-dock-chromium`, ahead 1/behind 112 | Do not use as integration baseline.                              |
| `orchestra-maestro`                  | Clean `maestro-core` branch                                                 | Preserve until owner classifies branch contents against roadmap. |
| `orchestra-maestro-rebuild`          | Clean; 85 commits behind `fork/dev`                                         | Historical integration branch; do not merge directly.            |
| `orchestra-maestro-rebuild-clean`    | User untracked config/status files                                          | Preserve; never clean or switch over its untracked files.        |
| `agent-issue-110-admission-trigger`  | Clean experiment branch                                                     | Review only through refreshed #110 scope.                        |
| `agent-issue-25-approval-redisplay`  | Clean; 43 commits behind `fork/dev`                                         | Rebase/revalidate or close through #113 P2 safety contract.      |
| `agent-issue-72-consume-attribution` | Clean; 43 commits behind `fork/dev`                                         | Rebase/revalidate or close through #113 P2 safety contract.      |
| `agent-issue-112-territory-catalog*` | Clean experiment branches                                                   | Review only through #112 installed-boundary contract.            |

No worktree is removed, reset, or force-updated by this roadmap. Cleanup requires an owner, a merged/superseded PR decision, clean status, and a worktree-specific command.

## CI Operating Policy

| Workflow    | Fork policy                                 | Current condition                                                                                                                                            |
| ----------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generate`  | Must run and may commit generated output    | Historical 2026-09-25 successor was `102e763599`; record current-base workflow URL before claiming matrix health.                                             |
| `publish`   | Must skip                                   | Fork policy is upstream-only release; record workflow URL when used as evidence.                                                                             |
| `typecheck` | Must pass                                   | No current-base run citation recorded; historical `102e763599` evidence does not transfer.                                                                   |
| `test`      | Must pass on Linux and Windows              | Historical `688d264010` run passed: [36169196802](https://github.com/gmhelmold/HuGR-Orchestra/actions/runs/36169196802). No current-base evidence; #102 remains open. |
| `nix-eval`  | Must complete its defined evaluation policy | No current-base run citation recorded; historical `102e763599` evidence does not transfer.                                                                   |

Rules:

- A rerun may classify a failure as intermittent, but cannot close a root-cause issue without a reproducer and regression gate.
- No blanket timeout increase, full-suite serialization, `continue-on-error`, skipped required test, or waiver is a CI fix.
- A generated successor commit needs its own current CI evidence; parent-run green is not inherited.

## Milestone Definition

Maestro V2 is ready for governed Atlas-backed work only when all conditions hold:

1. Direct stakeholder message admission is durable and exactly-once.
2. Plan, validation, context, policy, actor, and task intent are immutable and exact-bound.
3. Catalog and Own context cross only installed, read-only, verified boundaries.
4. Every unknown, stale, malformed, cross-project, or cross-session path returns named HOLD before Task creation.
5. Governed Task dispatches once from exact current `ELIGIBLE_FOR_EXECUTION` projection bound to durable decision,
   immutable revision, `VALID` validation, ContextRecord, and current-evidence hash.
6. Current-base Linux and Windows evidence is green, including root-cause closure for required CI defects.
7. Independent review verifies contracts, implementation, and mutation probes.

## Cadence

At each merge or scope change:

1. Update [SESSION-STATE.md](SESSION-STATE.md) with current SHA and observed result.
2. Update this roadmap only for dependency, WIP, or disposition changes.
3. Update affected GitHub issue with command, SHA, CI URL, and remaining limitation.
4. Reconcile stale PRs and worktrees; preserve user-owned untracked work until an owner explicitly decides otherwise.
