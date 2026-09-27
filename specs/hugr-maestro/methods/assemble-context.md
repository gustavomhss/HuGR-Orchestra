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
canonicalScope        GROUNDED typed territory identifiers or UNGROUNDED InspectionBoundary list; explicit exclusions
scopeMode             `GROUNDED` or `UNGROUNDED` from immutable ScopeProposal
capabilityReceipt     exact current Atlas capability/memory receipt
inspectionSha         exact current repository inspection SHA; required for UNGROUNDED
orientationRef        current Atlas Awareness/Orientation reference; UN-SEEDED is orientation-only
atlasEnvelopeVersion  frozen current-Atlas adapter contract version; absent until foundation corpus ratifies
methodVersion         version of this contract
```

An admitted `PlanIntent`, prose goal, broad repository path, or V1 territory format is not valid scope input.
`UNGROUNDED` is valid only with independently proven `ABSENT` or `BOOTSTRAP` capability plus complete receipt and SHA.

## Preconditions

1. Revision is committed, immutable, `PROPOSED`, and has canonical non-empty scope.
2. `GROUNDED` scope identifiers resolve through current Atlas territory identity seam and current adapter/version is
   ratified and test-measured.
3. `UNGROUNDED` scope has exact `ABSENT` or `BOOTSTRAP` capability/memory receipt, current inspection SHA, and
   non-empty explicit receipt-verified `InspectionBoundary` list whose entries bind that SHA; it is not treated as territory.

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

1. `context-request-schema-guard` validates exact revision hash, mode-dependent canonical scope, and required evidence.
2. For `GROUNDED`, read current Atlas context envelope through frozen adapter. Adapter exposes only evidence current
   Atlas proves. For `UNGROUNDED`, bind no Atlas envelope or source.
3. `context-envelope-guard` checks grounded envelope version, territory identity, snapshot/address, freshness,
   truncation receipt, and configured budget evidence; or checks ungrounded ABSENT/BOOTSTRAP capability/memory
   receipt plus inspection SHA and bound receipt-verified `InspectionBoundary` list. It does not recreate V1 pack protocol.
4. Persist immutable `ContextRecord` bound to revision hash. `validate-plan` receives record identity only.

## Tools and Guards

| Capability                         | Purpose                                                    | Boundary                       |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `plan-revision-read`               | read exact proposed revision and canonical scope           | Maestro durable evidence read  |
| `atlas-context-envelope-read`      | frozen adapter over measured current Atlas seam            | Atlas read only                |
| `context-record-write`             | persist immutable bound result                             | Maestro durable evidence write |
| `context-request-schema-guard`     | reject prose, broad, or uncanonical scope                  | before Atlas read              |
| `context-envelope-guard`           | require measured adapter/version and envelope evidence     | before persistence             |
| `no-governed-task-before-approval` | deny Task/child Session without approved revision identity | Session/Task boundary          |

No model skill, shell, product edit, Atlas write, member tool, approval, or task creation is granted.

## Authority

Maestro binds evidence; it cannot choose scope, promote retrieved text into stakeholder fact, map empty pack or
`UN-SEEDED` orientation to ungrounded context, waive stale context, or invent current-Atlas adapter fields.

## Evidence, Output, and Idempotence

`ContextRecord` mode is exactly `GROUNDED` or `UNGROUNDED`. It stores revision hash, canonical scope, mode, result,
timestamp, and next owner. `GROUNDED` stores Atlas adapter/version, envelope address/snapshot, and
freshness/truncation/budget evidence defined by frozen seam. `UNGROUNDED` stores exact ABSENT/BOOTSTRAP
capability/memory receipt, current inspection SHA, and bound `InspectionBoundary` list plus exclusions; it contains
no Atlas source.

Deduplication key is `(planRevisionId, scopeMode, evidenceIdentity, methodVersion)`. Grounded `evidenceIdentity` is
envelope snapshot/version. Ungrounded `evidenceIdentity` is capability/memory receipt plus inspection SHA. Replay
returns stored record; new evidence creates linked result and never replaces prior plan evidence.

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
| Duplicate trigger                                            | return stored record                                     |

## Acceptance After Ratification

1. Canonical `GROUNDED` revision scope yields `READY` record bound to exact revision and measured current Atlas envelope.
2. V1-shaped territory/pack input is refused; current foundation adapter is only reader.
3. Empty/uncovered result holds, never fabricates context or unseeded state.
4. Stale context, changed scope, or changed adapter version requires new linked record before validation.
5. No result of this method can create a child Session or Task.
6. `UN-SEEDED` declaration holds unless independent ABSENT/BOOTSTRAP capability with complete ungrounded evidence
   and bounded `InspectionBoundary` scope produces `UNGROUNDED` ContextRecord; that record contains
   capability/memory receipt, inspection SHA, boundaries/exclusions, and no Atlas source.

## Anti-Overengineering Boundary

One deterministic binder, zero model skills, one frozen Atlas read adapter, one record, two guards. No V1 store
compatibility layer, generic vector search, context cache, background refresh, Atlas writer, work packet, or
model-chosen query.
