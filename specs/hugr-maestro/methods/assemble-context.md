# Method: Assemble Context

Status: proposed V2 method, blocked on OpenCode-to-Atlas adapter freeze. ID: `assemble-context`. Composition: M2 Ground.

V1 internal `atlas/` is reference only. Current Atlas foundation source has a distinct candidate seam:
`@atlas/retrieval` `BoundedPack` and `@atlas/memory` Awareness/Orientation. Selected named tests are measured
green; no V2 OpenCode adapter, field mapping, or behavior is frozen until its own contract/proof exists. See
`atlas-foundation-seam-register.md`.

## Purpose

Bind one immutable `PlanRevision` with canonical scope to one immutable, read-only current-Atlas context result
before deterministic plan validation. Context cannot be assembled from an admitted goal: current Atlas retrieval
accepts a `Territory`, and territory does not exist until `draft-plan` proposes canonical scope.

```text
READY      bound `GROUNDED` or `UNGROUNDED` ContextRecord; next owner validate-plan
HOLD       scope, capability, Atlas seam, context evidence, or freshness is unverified
```

This method retrieves and binds context. It does not infer scope, draft/revise a plan, write Atlas, approve, or
create child work.

## Trigger

Committed `PlanRevision` is `PROPOSED` with canonical scope and `PENDING` context requirement, or a previously
bound result became stale. `UN-SEEDED` provider declaration is orientation-only and emits `HOLD` unless independent
`ABSENT` or `BOOTSTRAP` capability evidence completes an ungrounded binding.

## Inputs

```text
planRevisionId       immutable proposed revision identity + content hash
scopeProposalId       immutable ScopeProposal identity + content hash matching revision scope
canonicalScope        mode-dependent scope from immutable ScopeProposal; explicit exclusions
scopeMode             `GROUNDED` or `UNGROUNDED` from immutable ScopeProposal
scopeCapabilityMemoryRecord trusted capability/memory record identity + hash from ScopeProposal
scopeInspectionSha    inspected SHA from trusted ScopeProposal repository-inspection record; UNGROUNDED only
scopeInspectionReceiptId immutable inspection receipt identity + content hash from ScopeProposal; UNGROUNDED only
currentCapabilityMemoryRecord trusted current capability/memory record identity + hash
currentRepositoryInspectionRecord trusted current repository inspection record identity + hash
anchorVerificationReceiptId stored immutable anchor-verification receipt identity + hash from ScopeProposal; UNGROUNDED only
orientationRef        current Atlas Awareness/Orientation reference; UN-SEEDED is orientation-only
atlasEnvelopeVersion  frozen current-Atlas adapter contract version; absent until foundation corpus ratifies
methodVersion         version of this contract
```

An admitted `PlanIntent`, prose goal, broad repository path, or V1 territory format is not valid scope input.
`UNGROUNDED` is valid only with independently proven `ABSENT` or `BOOTSTRAP` capability plus complete receipt and SHA.

## Preconditions

1. Revision and ScopeProposal are committed, immutable, linked, and have matching scope identity/content.
2. `GROUNDED` scope identifiers resolve through current Atlas territory identity seam and current adapter/version is
   ratified and test-measured.
3. `UNGROUNDED` scope trusted evidence has exact `ABSENT` or `BOOTSTRAP` capability/memory record, current inspection SHA, and
   immutable same-SHA inspection receipt; every non-empty explicit `InspectionBoundary` path and optional symbol
    matches that receipt and has stored direct-user anchor-verification receipt and resolved path/anchor relation.
    A symbol-only anchor resolves to exactly one receipt path. Receipt candidates are limited to those verified
    anchors. It is not treated as territory.

Failure emits `HOLD` with durable reason. An uncovered/malformed current Atlas lookup is `HOLD`, never silently
treated as `UN-SEEDED`: current `BoundedPack` empty result is total and cannot distinguish those cases. An explicit
`UN-SEEDED` declaration also holds unless independent ABSENT/BOOTSTRAP evidence satisfies ungrounded requirements.

## Candidate Current-Atlas Evidence

Current source candidates, not frozen V2 contract:

```text
@atlas/retrieval/src/pack.ts
  Territory -> BoundedPack { axisHash, invariants, tokenEstimate, stale, truncated, tail }
  deterministic T0/T1 bounded packing under PACK_CAP; truncation receipt has no silent drops

@atlas/memory/src/awareness.ts
  derived shared Awareness; facet-level UN-SEEDED is explicit and never fabricated

@atlas/memory/src/orient.ts
  derived shared Orientation from DEFINE + event log
```

Measured command:

```text
npm test -- --run packages/retrieval/test/wp-6.19-retr.pack.test.ts \
  packages/memory/test/wp-6.24-a-mem.test.ts \
  packages/memory/test/wp-6.24-b-mem.test.ts
```

After `npm ci && npm run build`: `3` files, `30` tests passed. The remaining blocker is adapter identity/envelope
freeze, not foundation source evidence.

## Procedure After Seam Freeze

1. `context-request-schema-guard` validates exact revision hash, immutable ScopeProposal identity/content,
   mode-dependent canonical scope, and required evidence.
2. For `GROUNDED`, read current Atlas context envelope through frozen adapter. Adapter exposes only evidence current
   Atlas proves. For `UNGROUNDED`, bind no Atlas envelope or source.
3. `context-envelope-guard` reads current trusted capability-memory and repository-inspection identities, verifies
   their exact identity/hash/mode/receipt/SHA/anchor match with ScopeProposal evidence, then checks grounded envelope version, territory identity, snapshot/address, freshness,
   truncation receipt, and configured budget evidence; or checks ungrounded ABSENT/BOOTSTRAP capability/memory
   receipt plus inspection SHA and immutable inspection receipt identity. For every ungrounded boundary, it verifies
   path and optional symbol against receipt at exact SHA, revalidates stored anchor-verification receipt identity,
   and verifies persisted resolved path/anchor relation; it holds symbol-only zero/multiple-path resolution;
   it rejects broad anchors and receipt candidates absent a verified anchor. It never trusts a raw supplied anchor ID,
   performs no live scan or re-resolution, and does not recreate V1 pack protocol.
4. Persist immutable `ContextRecord` bound to revision hash. `validate-plan` receives record identity only.

## Tools and Guards

| Capability                         | Purpose                                                    | Boundary                       |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `plan-revision-read`               | read exact proposed revision and canonical scope           | Maestro durable evidence read  |
| `scope-proposal-read`              | read immutable scope identity/content bound to revision    | Maestro durable evidence read  |
| `inspection-receipt-read`          | read immutable exact-SHA receipt; UNGROUNDED only          | Maestro durable evidence read  |
| `anchor-verification-receipt-read` | read stored immutable anchor verification; UNGROUNDED only | Maestro durable evidence read  |
| `capability-memory-read`           | read current trusted capability/memory identity             | bounded adapter read           |
| `repository-inspection-read`       | read current trusted inspection identity                    | bounded adapter read           |
| `atlas-context-envelope-read`      | frozen adapter over measured current Atlas seam            | Atlas read only                |
| `context-record-write`             | persist immutable bound result                             | Maestro durable evidence write |
| `context-request-schema-guard`     | require exact revision/ScopeProposal links                 | before Atlas read              |
| `context-envelope-guard`           | require current trusted evidence exact match plus envelope/receipt verification | before persistence |
| `no-governed-task-before-approval` | require exact durable ApprovalDecision bound to same revision, current VALID validation, ContextRecord, and current-evidence identity/hash; deny missing/stale/mismatch before child creation | Session/Task boundary |

No model skill, shell, live scan, scope re-resolution, product edit, Atlas write, member tool, approval, or task
creation is granted.

## Authority

Maestro binds evidence; it cannot choose scope, promote retrieved text into stakeholder fact, map empty pack or
`UN-SEEDED` orientation to ungrounded context, waive stale context, or invent current-Atlas adapter fields.

## Evidence, Output, and Idempotence

`ContextRecord` mode is exactly `GROUNDED` or `UNGROUNDED`. It stores revision hash, canonical scope, mode, result,
ScopeProposal identity/content hash, trusted capability-memory and repository-inspection record identities+hashes,
timestamp, and next owner. `GROUNDED` stores Atlas adapter/version, envelope address/snapshot, and
freshness/truncation/budget evidence defined by frozen seam. `UNGROUNDED` stores exact ABSENT/BOOTSTRAP
capability/memory receipt, current inspection SHA, immutable inspection-receipt identity/content hash, and bound
`InspectionBoundary` list, stored anchor-verification receipt identity+hash, plus exclusions; it contains no Atlas source.
`UNGROUNDED` also stores every resolved path/anchor relation.

Deduplication key is `(planRevisionId, scopeMode, evidenceIdentity, methodVersion)`. Grounded `evidenceIdentity` is
envelope snapshot/version. Ungrounded `evidenceIdentity` is capability/memory receipt plus inspection SHA plus
inspection-receipt identity. Replay returns stored record; new evidence creates linked result and never replaces
prior plan evidence.

## Refusal and Recovery

| Condition                                                    | Result                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| Non-canonical/empty scope                                    | `HOLD`; no broad lookup or plan/task                     |
| Atlas adapter unratified for GROUNDED                        | `HOLD`; no direct foundation import from Maestro runtime |
| Empty/uncovered/malformed current Atlas pack                 | `HOLD`; never mislabel as unseeded                       |
| Stale, mismatched, provenance-free, or receipt-free envelope | `HOLD`; preserve reason/evidence                         |
| UN-SEEDED provider declaration without independent ABSENT/BOOTSTRAP evidence | `HOLD`; preserve declaration identity |
| UNGROUNDED without complete capability/memory receipt and inspection SHA | `HOLD`; no context binding                         |
| Empty, glob, directory, repository-wide, or SHA-unbound InspectionBoundary | `HOLD`; no broad fallback                      |
| Missing/mismatched ScopeProposal or inspection-receipt identity/content | `HOLD`; no re-resolution or live scan             |
| Changed current mode, capability/inspection receipt, SHA, or anchor binding | `HOLD`; require newly resolved scope/context      |
| Missing/mismatched stored anchor-verification receipt or broad receipt anchor | `HOLD`; request clarification, no enumeration |
| Missing/mismatched resolved path/anchor relation or ambiguous symbol-only anchor | `HOLD`; no context binding                 |
| Duplicate trigger                                            | return stored record                                     |

## Acceptance After Ratification

1. Canonical `GROUNDED` revision scope yields `READY` record bound to exact revision and measured current Atlas envelope.
2. V1-shaped territory/pack input is refused; current foundation adapter is only reader.
3. Empty/uncovered result holds, never fabricates context or unseeded state.
4. Stale context, changed scope, or changed adapter version requires new linked record before validation.
5. No result of this method can create a child Session or Task.
6. `UN-SEEDED` declaration holds unless independent ABSENT/BOOTSTRAP capability with complete ungrounded evidence
   and bounded `InspectionBoundary` scope produces `UNGROUNDED` ContextRecord; that record contains
   ScopeProposal and inspection-receipt identities, capability/memory receipt, inspection SHA, boundaries/exclusions,
   and no Atlas source.

## Anti-Overengineering Boundary

One deterministic binder, zero model skills, one frozen Atlas read adapter, one record, two guards. No V1 store
compatibility layer, generic vector search, context cache, background refresh, Atlas writer, work packet, or
model-chosen query.
