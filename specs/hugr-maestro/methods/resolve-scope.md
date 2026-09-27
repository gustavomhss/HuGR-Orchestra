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
inspectionReceipt   immutable receipt keyed by inspectionSha: inspected file paths and discovered symbols per path
stakeholderEvidence direct stakeholder evidence identities and exact anchors for every InspectionBoundary
projectId           exact project identity from ComposedActor
target              initial-draft | revision
methodVersion       version of this contract
```

`GROUNDED` uses `READY` capability and current verified catalog/version/project evidence. `UNGROUNDED` is allowed only
with `ABSENT` or `BOOTSTRAP` capability and exact capability/memory receipt plus current inspection SHA. Unbounded
paths, globs, V1 territory objects, LLM-invented names, and repository-wide fallback scans are invalid input.

`InspectionBoundary` is non-Atlas scope:

```text
{
  path: normalized repository-relative file path,
  symbol?: exact source symbol,
  stakeholderEvidenceId: exact durable direct-stakeholder evidence identity,
  stakeholderAnchor: exact path/symbol candidate named by that evidence
}
```

An immutable inspection receipt, keyed by exact inspected repository SHA, contains inspected file paths and
discovered symbols per path. Every boundary has direct-stakeholder evidence identity/anchor naming its exact candidate
path and optional symbol; every boundary path must occur in same-SHA receipt and optional symbol must occur under that
path. Receipt may contain only candidates named by direct-stakeholder anchors. A generic, project-wide, or
repository-wide anchor/enumeration is invalid. Boundaries are non-empty and explicit. Reject absolute paths, `.`/`..`
traversal segments, glob metacharacters, directory paths, missing/nonexistent receipt path, missing/nonexistent
symbol, SHA mismatch, all Atlas metadata, missing direct evidence, or broad anchor. Valid file-only boundary is
allowed in `UNGROUNDED` only. No generic repository scan. Canonical scope is mode-dependent: `GROUNDED` contains typed
canonical Atlas `Territory` identifiers only; `UNGROUNDED` contains an `InspectionBoundary` list plus explicit
exclusions.

## Preconditions

1. Scope subject and `ComposedActor.projectId` resolve and agree.
2. `GROUNDED` capability is `READY`; catalog/version/project evidence is current, non-empty, versioned, and maps project
   identity without a cross-project fallback.
3. `UNGROUNDED` capability is exactly `ABSENT` or `BOOTSTRAP`, with exact capability/memory receipt and current
   inspection SHA; its immutable receipt is keyed by that SHA and its non-empty explicit `InspectionBoundary` list
   has exact direct-stakeholder evidence identity/anchor matching every candidate path/symbol and receipt paths and
   symbols.

Precondition failure is `HOLD`. Empty grounded catalog is not an empty scope success.

## Procedure

### 1. Read Catalog

For `GROUNDED`, read typed canonical territory identifiers, owner, tier, and catalog address/version only. `resolve-scope` does not read
Pack or `globs`; Atlas owns territory membership semantics. For `UNGROUNDED`, read only capability/memory receipt
inspection SHA, and immutable same-SHA inspection receipt; derive only explicit receipt-verified
`InspectionBoundary` entries whose direct-stakeholder anchors name their exact candidates and exclusions, and make no
Atlas address, ownership, or fact claim.

### 2. Frame Candidate Scope

Run bounded `frame-scope` skill against scope subject and mode evidence. `GROUNDED` emits included typed canonical
territory identifiers, exclusions, and source labels. `UNGROUNDED` emits explicit non-empty `InspectionBoundary`
entries plus exclusions and no Atlas claim. Both emit one `ClarificationNeed` when intent cannot distinguish honest
scope; neither may mint or normalize Atlas names.

### 3. Validate and Persist

`scope-proposal-guard` requires non-empty scope, no inclusion/exclusion intersection, source labels, and exact mode
evidence. `GROUNDED` requires catalog-present typed identifiers and catalog/version/project binding. `UNGROUNDED`
requires ABSENT/BOOTSTRAP capability/memory receipt plus inspection SHA and immutable same-SHA inspection receipt,
non-empty explicit `InspectionBoundary` list with each path and optional symbol receipt-verified, explicit
direct-stakeholder evidence identity/anchor per boundary, receipt candidates limited to those anchors, exclusions,
and no Atlas claim. A missing/broad anchor is `HOLD` with `ClarificationNeed`, not model judgment. Persist immutable
`ScopeProposal`; later plan methods receive proposal ID and exact binding, not model text.

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
| `scope-proposal-guard`             | reject receipt-invalid/unanchored/broad boundary or Atlas metadata | before persistence   |
| `no-governed-task-before-approval` | deny Task/child Session without approved revision identity | Session/Task boundary          |

No Pack read, Atlas write, shell, generic repository scan, product edit, member tool, Task, plan, approval, or
dispatch capability exists.

## Authority

Maestro may propose mode-bound scope. Stakeholder resolves ambiguity. In `GROUNDED`, Atlas catalog decides valid
territory identity. In `UNGROUNDED`, Maestro cannot claim Atlas address, ownership, or fact.

## Evidence, Output, and Idempotence

`ScopeProposal` stores subject ID/hash, project ID, mode, scope, field sources, status, timestamp, and next owner.
`GROUNDED` stores typed canonical territory identifiers and current verified catalog/version/project evidence.
`UNGROUNDED` stores `InspectionBoundary` list, explicit exclusions, exact capability/memory receipt, and inspection
SHA plus immutable same-SHA inspection receipt and direct-stakeholder evidence identities/anchors; every boundary
path and optional symbol is receipt-verified and every receipt candidate is anchor-named.
Deduplication key is `(scopeSubject, scopeMode, evidenceIdentity, target, methodVersion)`. Replay returns stored
output; changed evidence or intent produces linked new proposal, never mutation.

## Refusal and Recovery

| Condition                                                           | Result                                     |
| ------------------------------------------------------------------- | ------------------------------------------ |
| READY catalog/version/project evidence unratified, missing, empty, stale, or cross-project | `HOLD`; no guessed scope |
| UNGROUNDED without ABSENT/BOOTSTRAP receipt and inspection SHA            | `HOLD`; no Atlas claim                |
| Empty, absolute, traversal, glob, directory, or Atlas-bearing InspectionBoundary | `HOLD`; no broad fallback       |
| Missing/nonexistent receipt path or symbol, or inspection SHA mismatch | `HOLD`; no generic scan or invented scope |
| Missing direct-stakeholder evidence/anchor or project-wide/repository-wide anchor | `HOLD`; request clarification |
| Unknown/invented territory identifier or inclusion/exclusion collision | `HOLD`; preserve named violation         |
| Multiple compatible territory choices                               | `CLARIFY`; ask one scope-boundary question |
| Duplicate trigger                                                   | return stored proposal/question            |

## Acceptance After Ratification

1. `GROUNDED` known goal resolves only typed canonical current territory identifiers, stores current evidence, and creates no plan/Task.
2. Hallucinated V1 territory, raw path, glob, unknown name, or cross-project name is rejected before proposal.
3. Ambiguous multi-territory goal asks one boundary question rather than widening scope.
4. Catalog version change produces a new linked proposal before draft/revision; no old proposal silently binds.
5. Missing/empty READY catalog holds; it never becomes an all-repository scope.
6. `ABSENT` or `BOOTSTRAP` capability plus exact capability/memory receipt, inspection SHA, immutable same-SHA
   receipt, non-empty explicit receipt-verified `InspectionBoundary` list, and exclusions creates an `UNGROUNDED`
   proposal with no Atlas address, ownership, or fact claim.
7. A boundary whose optional symbol is absent from its receipt path holds; it never creates an ungrounded proposal.
8. Receipt-wide enumeration without one exact direct-stakeholder anchor per candidate holds; it cannot reach plan or
   validation.

## Anti-Overengineering Boundary

One skill, one catalog read, one record, two guards, no file classifier, path resolver, glob engine, vector search,
pack read, cache, Atlas write, or task capability. This method has two consumers (`draft-plan`, `revise-plan`) and
closes one named failure: guessed plan scope cannot reach Atlas retrieval.
