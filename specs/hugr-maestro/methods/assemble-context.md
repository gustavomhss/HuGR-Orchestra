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
scopeProposalId       immutable historical ScopeProposal identity + content hash retained by revision
canonicalScope        immutable mode-dependent scope/boundaries/anchors from PlanRevision ScopeProposal
scopeMode             immutable `GROUNDED` or `UNGROUNDED` mode from PlanRevision ScopeProposal
scopeEvidence         historical trusted scope evidence retained by PlanRevision ScopeProposal
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

1. Revision and its ScopeProposal are committed, immutable, linked, and have matching historical scope identity/content.
2. `GROUNDED` stored territory identifiers, or `UNGROUNDED` stored boundaries/direct-user anchors, revalidate against
   current trusted capability/inspection evidence. A SHA or evidence receipt change alone does not require new
   ScopeProposal or revision.
3. `UNGROUNDED` stored boundaries have non-empty exact `ABSENT` or `BOOTSTRAP` current capability/memory evidence and
   same-current-SHA inspection receipt; every path and optional symbol revalidates with stored anchor-verification
   receipt and resolved path/anchor relation. A symbol-only anchor resolves to exactly one current receipt path.

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

1. `context-request-schema-guard` validates exact revision hash, immutable ScopeProposal identity/content, and
   mode-dependent stored scope/boundaries/anchors.
2. For `GROUNDED`, read current Atlas context envelope through frozen adapter. Adapter exposes only evidence current
   Atlas proves. For `UNGROUNDED`, bind no Atlas envelope or source.
3. `context-envelope-guard` reads current trusted capability-memory and repository-inspection evidence. It preserves
   historical ScopeProposal identity and revalidates its stored mode, boundaries, direct-user anchors, and resolved
   paths against current evidence. It does not require current evidence identity/hash/SHA to equal historical scope
   evidence: valid SHA-only evidence change creates linked ContextRecord. It holds if stored mode/boundaries/anchors
   no longer validate, or if requested scope changes; those require `resolve-scope` plus `revise-plan` as appropriate.
   On changed current evidence, invoke `execution-eligibility-projection-write` atomically for old
   ApprovalDecision/current-evidence before context persistence; writer failure is `HOLD` with no child creation. It
   never trusts raw anchor input, performs no live scan or scope re-resolution, and does not recreate V1 pack protocol.
4. Persist immutable linked `ContextRecord` bound to same revision hash and historical ScopeProposal. `validate-plan`
   receives record identity only.

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
| `execution-eligibility-projection-write` | invoke sole durable projection owner on changed current evidence | atomic with context write |
| `context-request-schema-guard`     | require exact revision/historical ScopeProposal links       | before Atlas read              |
| `context-envelope-guard`           | revalidate stored scope against current trusted evidence; reject invalid mode/boundary/anchor | before persistence |
| `no-governed-task-before-approval` | require durable direct-user ApprovalDecision bound to same immutable revision, current VALID validation, ContextRecord, and current-evidence identity/hash; any mismatch denies before child creation | Session/Task boundary |

No model skill, shell, live scan, scope re-resolution, product edit, Atlas write, member tool, approval, or task
creation is granted.

## Authority

Maestro binds evidence; it cannot choose scope, promote retrieved text into stakeholder fact, map empty pack or
`UN-SEEDED` orientation to ungrounded context, waive stale context, or invent current-Atlas adapter fields.

## Evidence, Output, and Idempotence

`ContextRecord` mode is exactly `GROUNDED` or `UNGROUNDED`. It stores revision hash, canonical scope, mode, result,
ScopeProposal identity/content hash, trusted capability-memory and repository-inspection record identities+hashes,
timestamp, and next owner. `GROUNDED` stores Atlas adapter/version, envelope address/snapshot, and
freshness/truncation/budget evidence plus current envelope/catalog identities+hashes defined by frozen seam.
`UNGROUNDED` stores exact ABSENT/BOOTSTRAP capability/memory receipt identity+hash, current inspection SHA,
immutable inspection-receipt identity/content hash, and bound
`InspectionBoundary` list, stored anchor-verification receipt identity+hash, plus exclusions; it contains no Atlas source.
`UNGROUNDED` also stores every resolved path/anchor relation.

Deduplication key is `(planRevisionId, scopeMode, currentEvidenceIdentityHash, methodVersion)`. Canonical complete
`currentEvidenceIdentityHash` is GROUNDED capability identity/hash plus current envelope identity/hash plus catalog
identity/hash; UNGROUNDED capability/memory receipt identity/hash plus inspection SHA plus anchor-verification receipt
identity/hash. Replay returns stored record only for exact complete current evidence. Any changed component creates
linked ContextRecord and never replays or replaces prior plan evidence.

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
| Missing/mismatched historical ScopeProposal or its stored inspection-receipt identity/content | `HOLD`; no re-resolution or live scan |
| SHA/evidence receipt change with same valid stored scope/boundaries/anchors | linked ContextRecord refresh; no new ScopeProposal/revision |
| execution-eligibility-projection-write failure | `HOLD`; no child creation                                  |
| Stored mode/boundaries/anchors no longer validate or requested scope changes | `HOLD`; resolve-scope + revise-plan as appropriate |
| Missing/mismatched stored anchor-verification receipt or broad receipt anchor | `HOLD`; request clarification, no enumeration |
| Missing/mismatched resolved path/anchor relation or ambiguous symbol-only anchor | `HOLD`; no context binding                 |
| Duplicate trigger                                            | return stored record                                     |

## Acceptance After Ratification

1. Canonical `GROUNDED` revision scope yields `READY` record bound to exact revision and measured current Atlas envelope.
2. V1-shaped territory/pack input is refused; current foundation adapter is only reader.
3. Empty/uncovered result holds, never fabricates context or unseeded state.
4. SHA/evidence refresh with same valid stored scope/boundaries/anchors requires linked new ContextRecord before
   validation, not ScopeProposal/revision. Changed requested scope or invalid stored mode/boundary/anchor holds for
   resolve-scope + revise-plan as appropriate.
5. No result of this method can create a child Session or Task.
6. `UN-SEEDED` declaration holds unless independent ABSENT/BOOTSTRAP capability with complete ungrounded evidence
   and bounded `InspectionBoundary` scope produces `UNGROUNDED` ContextRecord; that record contains
   ScopeProposal and inspection-receipt identities, capability/memory receipt, inspection SHA, boundaries/exclusions,
   and no Atlas source.

## Anti-Overengineering Boundary

One deterministic binder, zero model skills, one frozen Atlas read adapter, one record, two guards. No V1 store
compatibility layer, generic vector search, context cache, background refresh, Atlas writer, work packet, or
model-chosen query.
