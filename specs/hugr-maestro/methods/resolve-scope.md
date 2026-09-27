# Method: Resolve Scope

Status: proposed V2 method, blocked on OpenCode-to-Atlas adapter freeze. ID: `resolve-scope`. Composition:
M1 Frame + M2 Ground.

V1 internal territory names are reference only. Current Atlas `Territory` is a distinct contract
`{ name, owner, tier, globs }`; retrieval accepts exact territory identity. This method exists because
`draft-plan` and `revise-plan` both require canonical scope, while admitted goal prose has none.

## Purpose

Turn one initial `PlanIntent` or revision subject `(priorRevision, changeRecord)` plus current capability evidence
into a `ScopeProposal` in `GROUNDED` or `UNGROUNDED` mode, or one blocking clarification.
It proposes scope; it does not create PlanRevision, retrieve Pack, change Atlas, or create work.

```text
RESOLVED  mode-bound canonical scope proposal; next owner draft-plan or revise-plan
CLARIFY   one scope decision cannot be honestly selected from mode evidence
HOLD      catalog/identity/adapter is unavailable or invalid
```

## Trigger

Committed `AdmissionRecord` is `READY_TO_DRAFT`, or a plan revision change needs new scope resolution.

## Inputs

```text
scopeSubject        initial PlanIntent ID | revision parent revision ID + change record ID
atlasCapability     current Atlas capability receipt: READY | ABSENT | BOOTSTRAP | STALE
territoryCatalog    current verified Atlas territory records and immutable catalog version/address; READY only
memoryReceipt       exact current capability/memory receipt; ABSENT or BOOTSTRAP only
inspectionSha       exact current repository inspection SHA; ABSENT or BOOTSTRAP only
inspectionBoundaries non-empty explicit InspectionBoundary list; ABSENT or BOOTSTRAP only
projectId           exact project identity from ComposedActor
target              initial-draft | revision
methodVersion       version of this contract
```

`GROUNDED` uses `READY` capability and current verified catalog/version/project evidence. `UNGROUNDED` is allowed only
with `ABSENT` or `BOOTSTRAP` capability and exact capability/memory receipt plus current inspection SHA. Unbounded
paths, globs, V1 territory objects, LLM-invented names, and repository-wide fallback scans are invalid input.

`InspectionBoundary` is non-Atlas scope: exact repository-relative file path and optional exact inspected symbol in
that file. Each boundary binds one current inspection SHA. Boundaries are non-empty and explicit: no glob, directory,
repository-wide scan, V1 territory object, Atlas address/ownership/fact, or invented name. Canonical scope is
mode-dependent: `GROUNDED` contains typed canonical Atlas `Territory` identifiers only; `UNGROUNDED` contains an
`InspectionBoundary` list plus explicit exclusions.

## Preconditions

1. Scope subject and `ComposedActor.projectId` resolve and agree.
2. `GROUNDED` capability is `READY`; catalog/version/project evidence is current, non-empty, versioned, and maps project
   identity without a cross-project fallback.
3. `UNGROUNDED` capability is exactly `ABSENT` or `BOOTSTRAP`, with exact capability/memory receipt and current
   inspection SHA; its non-empty explicit `InspectionBoundary` list binds that SHA.

Precondition failure is `HOLD`. Empty grounded catalog is not an empty scope success.

## Procedure

### 1. Read Catalog

For `GROUNDED`, read typed canonical territory identifiers, owner, tier, and catalog address/version only. `resolve-scope` does not read
Pack or `globs`; Atlas owns territory membership semantics. For `UNGROUNDED`, read only capability/memory receipt
and inspection SHA; derive only explicit `InspectionBoundary` entries and exclusions, and make no Atlas address,
ownership, or fact claim.

### 2. Frame Candidate Scope

Run bounded `frame-scope` skill against scope subject and mode evidence. `GROUNDED` emits included typed canonical
territory identifiers, exclusions, and source labels. `UNGROUNDED` emits explicit non-empty `InspectionBoundary`
entries plus exclusions and no Atlas claim. Both emit one `ClarificationNeed` when intent cannot distinguish honest
scope; neither may mint or normalize Atlas names.

### 3. Validate and Persist

`scope-proposal-guard` requires non-empty scope, no inclusion/exclusion intersection, source labels, and exact mode
evidence. `GROUNDED` requires catalog-present typed identifiers and catalog/version/project binding. `UNGROUNDED`
requires ABSENT/BOOTSTRAP capability/memory receipt plus inspection SHA, non-empty explicit `InspectionBoundary`
list with each entry bound to that SHA, explicit exclusions, and no Atlas claim. Persist immutable `ScopeProposal`;
later plan methods receive proposal ID and exact binding, not model text.

## Skills

| Skill         | Stage                        | Output                                 | Stop condition                                             |
| ------------- | ---------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| `frame-scope` | select bounded mode scope | `ScopeProposal` or `ClarificationNeed` | identifiers exist or boundaries validate, or one decision blocks honest selection |

## Tools and Guards

| Capability                         | Purpose                                                    | Boundary                       |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `scope-subject-read`               | read PlanIntent or prior revision/change record            | Maestro durable evidence read  |
| `atlas-capability-read`            | read current capability and mode evidence                  | Atlas read only                |
| `atlas-territory-catalog-read`     | frozen current-Atlas territory catalog adapter; GROUNDED only | Atlas read only             |
| `scope-proposal-write`             | persist immutable proposal                                 | Maestro durable evidence write |
| `scope-input-guard`                | require project and mode evidence identity                 | before reasoning               |
| `scope-proposal-guard`             | reject invalid mode scope, empty/unbounded boundary, or Atlas claim | before persistence      |
| `no-governed-task-before-approval` | deny Task/child Session without approved revision identity | Session/Task boundary          |

No Pack read, Atlas write, shell, product edit, member tool, Task, plan, approval, or dispatch capability exists.

## Authority

Maestro may propose mode-bound scope. Stakeholder resolves ambiguity. In `GROUNDED`, Atlas catalog decides valid
territory identity. In `UNGROUNDED`, Maestro cannot claim Atlas address, ownership, or fact.

## Evidence, Output, and Idempotence

`ScopeProposal` stores subject ID/hash, project ID, mode, scope, field sources, status, timestamp, and next owner.
`GROUNDED` stores typed canonical territory identifiers and current verified catalog/version/project evidence.
`UNGROUNDED` stores `InspectionBoundary` list, explicit exclusions, exact capability/memory receipt, and inspection
SHA bound by every boundary.
Deduplication key is `(scopeSubject, scopeMode, evidenceIdentity, target, methodVersion)`. Replay returns stored
output; changed evidence or intent produces linked new proposal, never mutation.

## Refusal and Recovery

| Condition                                                           | Result                                     |
| ------------------------------------------------------------------- | ------------------------------------------ |
| READY catalog/version/project evidence unratified, missing, empty, stale, or cross-project | `HOLD`; no guessed scope |
| UNGROUNDED without ABSENT/BOOTSTRAP receipt and inspection SHA            | `HOLD`; no Atlas claim                |
| Empty, glob, directory, repository-wide, unbound, or invented InspectionBoundary | `HOLD`; no broad fallback       |
| Unknown/invented territory identifier or inclusion/exclusion collision | `HOLD`; preserve named violation         |
| Multiple compatible territory choices                               | `CLARIFY`; ask one scope-boundary question |
| Duplicate trigger                                                   | return stored proposal/question            |

## Acceptance After Ratification

1. `GROUNDED` known goal resolves only typed canonical current territory identifiers, stores current evidence, and creates no plan/Task.
2. Hallucinated V1 territory, raw path, glob, unknown name, or cross-project name is rejected before proposal.
3. Ambiguous multi-territory goal asks one boundary question rather than widening scope.
4. Catalog version change produces a new linked proposal before draft/revision; no old proposal silently binds.
5. Missing/empty READY catalog holds; it never becomes an all-repository scope.
6. `ABSENT` or `BOOTSTRAP` capability plus exact capability/memory receipt, inspection SHA, non-empty explicit
   `InspectionBoundary` list, and exclusions creates an `UNGROUNDED` proposal with no Atlas address, ownership, or fact claim.

## Anti-Overengineering Boundary

One skill, one catalog read, one record, two guards, no file classifier, path resolver, glob engine, vector search,
pack read, cache, Atlas write, or task capability. This method has two consumers (`draft-plan`, `revise-plan`) and
closes one named failure: guessed plan scope cannot reach Atlas retrieval.
