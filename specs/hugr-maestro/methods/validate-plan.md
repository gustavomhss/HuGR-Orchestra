# Method: Validate Plan

Status: proposed V2 method. ID: `validate-plan`. Composition: M3 Contract.

V1 evidence: `v1-portability-register.md` ports measured compiler/plan-check refusals. V2 keeps only typed,
reproducible checks at this plan layer; decomposition-specific gates remain later methods.

## Purpose

Deterministically decide whether one immutable `PlanRevision` is structurally eligible for stakeholder
approval. This method validates record shape, authority/provenance binding, revision lineage, context
freshness, and machine-decidable internal conflicts. It does not judge whether stakeholder goal is wise,
whether prose is good, or whether proposed acceptance is sufficient.

```text
VALID    exact PlanRevision is approval-eligible; next owner request-approval
INVALID  durable issue list; next owner revise-plan or clarify-decision
HOLD     required evidence/context cannot be checked; no approval/task
```

## Trigger

Committed `PlanRevision` status is `PROPOSED` with supplied exact current `ContextRecord` and current-evidence
binding. Detection that prior ContextRecord is stale routes to `assemble-context` or `HOLD` before this method;
validator never claims to validate a nonexistent refreshed record.

## Inputs

```text
planRevisionId       immutable PROPOSED revision identity
planRevision         complete revision fields and field provenance
contextRecord        supplied exact current GROUNDED or UNGROUNDED ContextRecord
currentContextEvidence supplied current trusted capability/inspection verification for that ContextRecord binding
currentEvidenceIdentityHash canonical current-evidence identity + hash for ContextRecord mode/SHA/receipt/anchor binding
priorApprovalDecisions immutable approval decisions for this revision, if any
priorRevision        optional immutable parent revision
validationPolicy     frozen deterministic schema/policy version
methodVersion        version of this contract
```

`validationPolicy` is product configuration, versioned and recorded. It contains only mechanically decidable
rules: required fields, allowed source tags, current context freshness bound, canonical scope/exclusion
collision rules, and valid revision/status transitions. It cannot contain prose-quality or model judgment.

## Preconditions

1. Revision, context record, and policy are committed and resolvable.
2. Revision status is exactly `PROPOSED`.
3. Context record/project identity matches revision binding.

Unresolvable input produces `HOLD`, not `INVALID`: an unavailable validator must not pretend it found a
product defect.

## Procedure

### 1. Reconstruct Required Checks

Load pinned `validationPolicy`; refuse missing, empty, unknown-version, or malformed policy. Reconstruct check
list from policy and revision schema. An empty check list is validator failure, never a successful validation.

### 2. Evaluate Deterministic Rules

Run rules over the stored revision only:

```text
all required fields present and non-empty
field source tag is stakeholder | maestro | atlas:<bound-address>
every atlas address appears in bound GROUNDED ContextRecord
UNGROUNDED revision contains no atlas source tag
UNGROUNDED ContextRecord has ABSENT/BOOTSTRAP capability/memory receipt and current inspection SHA
UNGROUNDED ContextRecord persists matching ScopeProposal and inspection-receipt identities
UNGROUNDED ContextRecord persists stored anchor-verification receipt identity+hash matching ScopeProposal binding
UNGROUNDED ContextRecord persists resolved path/anchor relation; symbol-only anchor resolves to exactly one receipt path
assumptions contain every maestro-sourced unconfirmed decision
revision parent/version/status transition is legal and immutable
bound context identity/revision/freshness still holds
current trusted capability/inspection evidence exactly matches ContextRecord mode/SHA/receipt/anchor binding
canonical scope inclusion/exclusion sets do not intersect
GROUNDED scope contains typed canonical territory identifiers only
UNGROUNDED scope contains non-empty explicit receipt-verified, direct-user-anchored SHA-bound InspectionBoundary list plus exclusions, never territory
```

Scope rules are mode-dependent: territory checks act only on `GROUNDED` identifiers; boundary checks act only on
`UNGROUNDED` `InspectionBoundary` entries and persisted resolved path/anchor relations. Natural-language contradiction detection is not claimed; unresolved
semantic conflict belongs to stakeholder review or `clarify-decision`.

### 3. Persist Verdict

Persist immutable `PlanValidationRecord`: input hashes, policy version, enumerated checks, per-check verdict,
issue IDs, timestamp, and result. For supplied linked same-mode ContextRecord with changed capability receipt,
inspection SHA, anchor verification, or current-evidence identity/hash, persist durable
`SUPERSEDED_FOR_EXECUTION` projection through `execution-eligibility-projection-write` for each prior approval
decision and its old current-evidence binding, atomically with linked validation. New validation is `VALID` when new evidence passes required
checks, otherwise `INVALID`; unavailable evidence is `HOLD`. Projections preserve immutable history but revoke old
execution eligibility. New `VALID` still requires new presentation and direct ApprovalDecision. Only `VALID` yields
approval eligibility for this exact revision and current-evidence identity/hash.

## Tools and Guards

| Capability                         | Purpose                                                    | Boundary                       |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `plan-revision-read`               | read immutable proposed revision                           | Maestro durable evidence read  |
| `context-record-read`              | verify exact grounding binding                             | Maestro durable evidence read  |
| `current-context-evidence-read`    | verify current trusted capability/inspection binding        | bounded adapter evidence read  |
| `validation-policy-read`           | load pinned deterministic policy                           | Maestro configuration read     |
| `plan-validation-record-write`     | persist checks and verdict                                 | Maestro durable evidence write |
| `execution-eligibility-projection-write` | sole durable owner: atomically write `SUPERSEDED_FOR_EXECUTION` for old ApprovalDecision/current-evidence on changed evidence | validation/currentness lifecycle |
| `validation-input-guard`           | require exact links/status/policy version                  | before evaluation              |
| `approval-eligibility-guard`       | expose only current VALID revision to request-approval     | approval boundary              |
| `no-governed-task-before-approval` | read execution-eligibility projection; deny missing/stale projection before child creation; require unsuperseded durable direct-user ApprovalDecision bound to same immutable revision, current VALID validation, ContextRecord, and current-evidence identity/hash | Session/Task boundary |

No model skill, Atlas read/write, shell, product edit, external network, member tool, plan mutation, approval
write, or task creation is granted.

## Authority

This method can refuse mechanical invalidity only. It cannot change a revision, approve a revision, waive a
failed rule, infer semantic agreement, or turn `INVALID` into stakeholder acceptance.
`execution-eligibility-projection-write` is sole durable projection owner. Validation/currentness lifecycle invokes
it atomically on changed evidence; request-approval writes ApprovalDecision only.

## Evidence, Output, and Idempotence

`PlanValidationRecord` is output and evidence. It contains all inputs/version hashes, complete named check
ledger, exact failure paths, verdict, timestamp, and next owner. The check ledger prevents a policy/parser
failure from looking like a clean empty result.

Deduplication key is `(planRevisionId, contextRecordId, currentEvidenceIdentityHash, validationPolicyVersion,
methodVersion)`. Replay returns stored verdict only for exact canonical current-evidence identity/hash. Current
same-mode capability/inspection SHA, receipt, or anchor binding change creates linked new validation record under
its own required checks; it never replays prior `VALID` or overwrites prior decision evidence. Mode change requires
resolve-scope and revise-plan before any ContextRecord reaches this method.

## Refusal and Recovery

| Condition                                                  | Result                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Missing/empty/malformed policy or check list               | `HOLD`, named validation-instrument failure                                                          |
| Missing/unresolvable revision/context evidence             | `HOLD`, preserve input identity/reason                                                               |
| Currentness evidence unavailable                            | `HOLD`, no approval/task                                                                            |
| execution-eligibility-projection-write failure               | `HOLD`; no child creation                                                                           |
| Prior ContextRecord stale or current evidence unavailable    | route to assemble-context or `HOLD` before validator; no nonexistent refreshed record              |
| Supplied same-mode ContextRecord with receipt/SHA/anchor change | supersede old approval; validate supplied record under required checks                            |
| Any freshness change                                         | atomic durable projection; old approval cannot authorize Task/child Session                         |
| Symbol-only anchor zero/multiple-path or resolved-path relation mismatch | `INVALID`; require resolved scope/context                         |
| Failed required/provenance/lineage/freshness/conflict rule | `INVALID`, durable issue list; no approval/task                                                      |
| Unknown semantic product conflict                          | remain `VALID` mechanically, rendered as stakeholder-visible uncertainty; never hidden auto-approval |
| Duplicate trigger                                          | return stored validation record                                                                      |
| New revision/context/policy                                | require new linked validation record                                                                 |

## Runtime Seams

| System   | Seam                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------- |
| OpenCode | durable proposed-plan and validation records; approval-eligible UI state; Task/child-Session fence |
| Atlas    | no live call; validates addresses/freshness already bound in ContextRecord                         |

## Acceptance

1. Complete sourced revision with current bound context and non-intersecting canonical scope sets yields
   `VALID`, an enumerated check ledger, and approval eligibility only for that exact revision.
2. Missing field source, unbound Atlas address, omitted Maestro assumption, stale context, or illegal revision
   lineage yields `INVALID` with named issue; approval and Task creation are refused.
3. `UNGROUNDED` revision with an `atlas:` source tag yields `INVALID`. An `UNGROUNDED` ContextRecord missing
   ABSENT/BOOTSTRAP capability/memory receipt or current inspection SHA yields `INVALID`; visible Maestro proposals
   may otherwise validate structurally. `UN-SEEDED` remains orientation-only.
4. `UNGROUNDED` ContextRecord missing or mismatching ScopeProposal or inspection-receipt identity yields `INVALID`;
   replay cannot substitute a later boundary receipt.
5. Missing/mismatched stored anchor-verification receipt identity+hash, or project-wide/repository-wide receipt anchor,
   yields `INVALID`; receipt-wide enumeration cannot reach validation.
6. Empty, absolute, traversal, glob, directory, Atlas-bearing, receipt-missing, symbol-unmatched, or SHA-mismatched
   `InspectionBoundary` yields `INVALID`; it never becomes a canonical territory or generic repository scan.
7. Missing, empty, or malformed policy/check list yields `HOLD`, not a green empty validation.
8. Natural-language tension not represented in canonical typed fields is rendered as uncertainty for
   stakeholder; validator does not hallucinate a semantic defect or pass it as approval.
9. Replaying same inputs returns byte-identical stored validation. Changed revision/context/policy yields new
   linked record and never alters prior result.
10. Unavailable currentness evidence yields `HOLD`. Same-mode SHA, receipt, or anchor change supersedes old approval
    and requires supplied linked new ContextRecord plus validation; new verdict is `VALID` only when required checks pass.
11. Canonical current-evidence identity/hash changes never replay a prior `VALID`; symbol-only anchor requires one
    receipt path and matching persisted resolved path/anchor relation.
12. Same-mode freshness change creates `SUPERSEDED_FOR_EXECUTION` projection on existing immutable revision and
    linked new ContextRecord validation. Mode change requires resolve-scope then revise-plan. Revalidation cannot
    revive old approval; a new `VALID` still requires new presentation and direct user ApprovalDecision to authorize execution.

## Anti-Overengineering Boundary

One deterministic evaluator, one policy read, four durable records, two method guards, no LLM judge, no prose
lint, no auto-repair, no generalized rules engine, and no approval/task capability. New rule enters only when
it is typed, reproducible, has a named failure class, and gets positive/negative proof.
