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
capabilityMemoryRecord trusted `capability-memory-read` canonical record identity + content hash
territoryCatalog    current verified Atlas territory records and immutable catalog version/address; READY only
repositoryInspectionRecord trusted `repository-inspection-read` canonical record identity + content hash
inspectionBoundaries non-empty explicit InspectionBoundary list; ABSENT or BOOTSTRAP only
directUserMessages  trusted durable direct-user-message records named by InspectionBoundary message IDs
projectId           exact project identity from ComposedActor
target              initial-draft | revision
methodVersion       version of this contract
```

Raw input cannot assert capability, inspection, or anchor receipt. `capability-memory-read`,
`repository-inspection-read`, and durable direct-user-message read are trusted bounded adapters. Each emits canonical
schema plus content hash, producer ID/version, project/session binding where applicable, inspected SHA, actor/anchor
binding, and adapter-owned grant/boundary. Scope reads these records only; raw, foreign, malformed, altered, or
ungranted records are `HOLD`. `GROUNDED` uses `READY` capability and current verified catalog/version/project
evidence. `UNGROUNDED` is allowed only with `ABSENT` or `BOOTSTRAP` capability and exact trusted capability/memory
record plus trusted inspection record. Unbounded paths, globs, V1 territory objects, LLM-invented names, and
repository-wide fallback scans are invalid input.

`InspectionBoundary` is non-Atlas scope:

```text
{
  path: normalized repository-relative file path,
  symbol?: exact source symbol,
  stakeholderMessageId: exact durable direct-user message identity,
  stakeholderByteRange: exact byte range in that message,
  stakeholderAnchorText: exact bytes in range exactly naming path or optional symbol,
  anchorKind: path | symbol,
  resolvedPath: boundary path bound to anchor
}
```

An immutable inspection receipt, keyed by exact inspected repository SHA, contains inspected file paths and
discovered symbols per path. Every boundary references a durable direct-user message identity and exact byte range.
Exact range text must exactly name its boundary path or optional symbol. A path anchor binds that exact path. A
symbol-only anchor is valid only when same-SHA inspection receipt proves symbol exists in exactly one path; its
resolved path must equal boundary path. Every boundary path must occur in same-SHA receipt and optional symbol must
occur under that path. Receipt may contain only candidates named by direct-user anchor text.
A generic, project-wide, or repository-wide anchor/enumeration is invalid. Boundaries are non-empty and explicit.
Reject assistant/member/tool/model/forged/mismatched anchor, absolute paths, `.`/`..` traversal segments, glob
metacharacters, directory paths, missing/nonexistent receipt path, missing/nonexistent symbol, SHA mismatch, and all
Atlas metadata. Valid file-only boundary is allowed in `UNGROUNDED` only. No generic repository scan. Canonical scope
is mode-dependent: `GROUNDED` contains typed canonical Atlas `Territory` identifiers only; `UNGROUNDED` contains an
`InspectionBoundary` list plus explicit exclusions.

## Preconditions

1. Scope subject and `ComposedActor.projectId` resolve and agree.
2. `GROUNDED` capability is `READY`; catalog/version/project evidence is current, non-empty, versioned, and maps project
   identity without a cross-project fallback.
3. `UNGROUNDED` trusted capability/memory record is exactly `ABSENT` or `BOOTSTRAP`, and trusted repository
   inspection record supplies current inspected SHA; its immutable receipt is keyed by that SHA and its non-empty explicit `InspectionBoundary` list
   has exact direct-user message identity/byte-range anchor text and resolved path relation matching every candidate
   path/symbol and receipt paths and symbols.

Precondition failure is `HOLD`. Empty grounded catalog is not an empty scope success.

## Procedure

### 1. Read Catalog

For `GROUNDED`, read typed canonical territory identifiers, owner, tier, and catalog address/version only. `resolve-scope` does not read
Pack or `globs`; Atlas owns territory membership semantics. For `UNGROUNDED`, read only trusted capability/memory
and repository inspection records, including inspected SHA and immutable same-SHA inspection receipt; derive only explicit receipt-verified
`InspectionBoundary` entries whose direct-user byte-range anchor text and resolved paths name their exact candidates and exclusions, and make no
Atlas address, ownership, or fact claim.

### 2. Frame Candidate Scope

Run bounded `frame-scope` skill against scope subject and mode evidence. `GROUNDED` emits included typed canonical
territory identifiers, exclusions, and source labels. `UNGROUNDED` emits explicit non-empty `InspectionBoundary`
entries plus exclusions and no Atlas claim. Both emit one `ClarificationNeed` when intent cannot distinguish honest
scope; neither may mint or normalize Atlas names.

### 3. Validate and Persist

`scope-proposal-guard` requires trusted record canonical schema/content hash/producer/version/project-session/
grant-boundary bindings, non-empty scope, no inclusion/exclusion intersection, source labels, and exact mode evidence.
`GROUNDED` requires catalog-present typed identifiers and catalog/version/project binding. `UNGROUNDED`
requires ABSENT/BOOTSTRAP trusted capability/memory record plus trusted inspection SHA and immutable same-SHA inspection receipt,
non-empty explicit `InspectionBoundary` list with each path and optional symbol receipt-verified, direct-user
message role, session/project binding, exact byte-range/text match, and same-SHA receipt match verified per boundary;
symbol-only anchor requires exactly one receipt path and persisted resolved-path relation; receipt candidates are
limited to those anchors, exclusions, and no Atlas claim. A missing/broad/ambiguous anchor is `HOLD` with
`ClarificationNeed`, not model judgment. Persist immutable `ScopeProposal` plus anchor-verification receipt identity;
later plan methods receive proposal ID and exact binding, not model text.

## Skills

| Skill         | Stage                        | Output                                 | Stop condition                                             |
| ------------- | ---------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| `frame-scope` | select bounded mode scope | `ScopeProposal` or `ClarificationNeed` | identifiers exist or boundaries validate, or one decision blocks honest selection |

## Tools and Guards

| Capability                         | Purpose                                                    | Boundary                       |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `scope-subject-read`               | read PlanIntent or prior revision/change record            | Maestro durable evidence read  |
| `durable-direct-user-message-read` | read trusted message role, session/project, and exact bytes | Maestro durable evidence read |
| `capability-memory-read`           | read trusted canonical capability/memory record             | bounded adapter read           |
| `repository-inspection-read`       | read trusted canonical inspection/anchor receipt record     | bounded adapter read           |
| `atlas-territory-catalog-read`     | frozen current-Atlas territory catalog adapter; GROUNDED only | Atlas read only             |
| `scope-proposal-write`             | persist immutable proposal                                 | Maestro durable evidence write |
| `scope-input-guard`                | require trusted record schema/hash/producer/grant, direct-user role, subject session/project, byte range/text, and same-SHA receipt | before reasoning |
| `scope-proposal-guard`             | reject receipt-invalid/unanchored/broad/forged boundary or Atlas metadata | before persistence |
| `no-governed-task-before-approval` | require exact current `ELIGIBLE_FOR_EXECUTION` bound to same decision, revision, current VALID validation, ContextRecord, and current-evidence identity/hash; absent/superseded/mismatched denies before child creation | Session/Task boundary |

No Pack read, Atlas write, shell, generic repository scan, product edit, member tool, Task, plan, approval, or
dispatch capability exists.

## Authority

Maestro may propose mode-bound scope. Stakeholder resolves ambiguity. In `GROUNDED`, Atlas catalog decides valid
territory identity. In `UNGROUNDED`, Maestro cannot claim Atlas address, ownership, or fact.

## Evidence, Output, and Idempotence

`ScopeProposal` stores subject ID/hash, project ID, mode, scope, field sources, status, timestamp, and next owner.
`GROUNDED` stores typed canonical territory identifiers and current verified catalog/version/project evidence.
`ScopeProposal` stores trusted adapter record identities+hashes. `UNGROUNDED` additionally stores
`InspectionBoundary` list, explicit exclusions, trusted capability/memory and repository-inspection record
identities+hashes, inspected SHA, immutable same-SHA inspection receipt, and anchor-verification receipt identity+hash;
every boundary durable direct-user message identity+hash, byte range, exact anchor text, anchor kind, and resolved-path
relation is verified and every
receipt candidate is anchor-named.
Deduplication key is `(scopeSubject, scopeMode, evidenceIdentity, target, methodVersion)`. Replay returns stored
output; changed evidence or intent produces linked new proposal, never mutation.

## Refusal and Recovery

| Condition                                                           | Result                                     |
| ------------------------------------------------------------------- | ------------------------------------------ |
| READY catalog/version/project evidence unratified, missing, empty, stale, or cross-project | `HOLD`; no guessed scope |
| Raw, foreign, malformed, altered, or ungranted capability/inspection/anchor record | `HOLD`; no scope                    |
| UNGROUNDED without ABSENT/BOOTSTRAP trusted record and inspected SHA      | `HOLD`; no Atlas claim                |
| Empty, absolute, traversal, glob, directory, or Atlas-bearing InspectionBoundary | `HOLD`; no broad fallback       |
| Missing/nonexistent receipt path or symbol, or inspection SHA mismatch | `HOLD`; no generic scan or invented scope |
| Symbol-only anchor resolving to zero or multiple receipt paths | `HOLD`; require exact path clarification |
| Assistant/member/tool/model/forged/mismatched anchor, missing direct-user byte range, or broad anchor | `HOLD`; request clarification |
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
8. Receipt-wide enumeration without one exact direct-user anchor per candidate holds; it cannot reach plan or
   validation.
9. Assistant anchor or user message whose role, session/project, byte range, text, or receipt SHA mismatches holds;
   it cannot create ScopeProposal.
10. Symbol-only anchor whose receipt symbol exists in exactly one path persists that resolved path/anchor relation;
    zero or multiple paths hold.

## Anti-Overengineering Boundary

One skill, one catalog read, one record, two guards, no file classifier, path resolver, glob engine, vector search,
pack read, cache, Atlas write, or task capability. This method has two consumers (`draft-plan`, `revise-plan`) and
closes one named failure: guessed plan scope cannot reach Atlas retrieval.
