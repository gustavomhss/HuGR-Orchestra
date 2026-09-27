# Method: Request Approval

Status: proposed V2 method. ID: `request-approval`. Composition: M3 Contract.

V1 evidence: `v1-portability-register.md` ports exact-bound, fail-closed approval. V2 redesigns V1 local-key/
JSONL transport as durable direct user conversation approval.

## Purpose

Show one mechanically `VALID` immutable `PlanRevision` to user in Maestro conversation, then record user's
explicit approve/decline reply bound to exact presentation/revision/validation evidence.

```text
PENDING   exact revision shown; waiting for direct user reply
APPROVED  explicit user reply bound to exact revision
DECLINED  explicit user decline/cancel bound to exact revision
HOLD      evidence/reply relation/current state is ambiguous or invalid
```

`APPROVED` makes only that revision eligible for later governed work. No Task, child Session, work packet, or
dispatch happens in this method.

## Trigger

Committed `PlanValidationRecord` verdict is `VALID`, or user replies to currently displayed pending approval.

## Inputs

```text
planRevisionId       immutable PROPOSED revision identity + content hash
validationRecordId   current VALID validation record identity + input/policy hashes
contextRecordId      exact current GROUNDED or UNGROUNDED ContextRecord bound by validation
currentContextEvidence current trusted capability/inspection verification for ContextRecord binding
currentEvidenceIdentityHash canonical current-evidence identity + hash bound to validation and ContextRecord
actor                exact ComposedActor { projectId, sessionId, memberId }
approvalMessageId    explicit user reply message identity; absent while creating presentation
methodVersion        version of this contract
```

`ApprovalPresentation` renders revision number, full field/provenance view, assumptions, validation ledger,
context state, revision hash, and natural-language prompt: “Approve this plan?” User can reply normally
`aprovo`/`approve`, decline/cancel, or ask a question. No GitHub, key, account login, PR, Issue, or special
approval syntax is required.

## Preconditions

1. Revision and validation record resolve, remain immutable, and hash-match presentation.
2. Validation is currently `VALID` and carries same `currentEvidenceIdentityHash` as current-context evidence for its
   bound `GROUNDED` or `UNGROUNDED` ContextRecord before presentation and decision.
3. Presentation belongs to same project/session, precedes user reply, and no newer plan revision, validation,
   or approval presentation intervenes.
4. Reply is durable direct user conversation input, not Maestro/member/model/tool output.
5. No decision already exists for same reply message ID.

Any failed precondition is `HOLD`; stale/ambiguous conversation cannot approve another plan.

## Procedure

### 1. Create Pending Presentation

Write exact assistant presentation as durable OpenCode Session message before visible delivery. Its message ID and
rendered bytes are `ApprovalPresentation` evidence; no separate presentation table exists.

### 2. Classify Direct Reply

`approval-reply-guard` requires same-session message ordering after current presentation and explicit user intent:

```text
approve   clear affirmative for displayed plan
decline   clear rejection/cancel for displayed plan
question  uncertainty or plan question; remain PENDING
ambiguous no clear decision; ask focused confirmation, remain PENDING
```

Maestro may recognize natural direct approval language in conversation. It must ask confirmation rather than
guess from “looks good”, silence, assistant text, tool output, unrelated message, or changed-plan discussion.

Initial V2 kernel recognizes only normalized exact commands: `approve`/`aprovo` and
`decline`/`declino`/`cancel`/`cancelar`, optionally followed by `.` or `!`. Any broader natural-language grammar
needs an explicit acceptance case before it can decide.

### 3. Record Immutable Decision

For approve/decline, persist `ApprovalDecision` with ComposedActor, user reply message ID, presentation ID, decision,
plan+validation/context record identities/hashes, exact `currentEvidenceIdentityHash`, policy/context versions, and
timestamp. Any freshness change appends durable `SUPERSEDED_FOR_EXECUTION` projection: old decision remains immutable
history, cannot authorize Task/child Session, and transfers nowhere. Only new context, validation, presentation, and
direct user approval can authorize execution.

## Tools and Guards

| Capability                         | Purpose                                                                   | Boundary                            |
| ---------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| `plan-revision-read`               | read exact immutable revision                                             | Maestro durable evidence read       |
| `plan-validation-record-read`      | verify current VALID result                                               | Maestro durable evidence read       |
| `current-context-evidence-read`    | verify exact ContextRecord currentness before display/decision            | bounded adapter evidence read       |
| `session-message-read`             | verify direct user reply, order, role, and current presentation           | OpenCode durable conversation read  |
| `session-message-write`            | persist exact visible approval target                                     | OpenCode durable conversation write |
| `approval-decision-write`          | append immutable ApprovalDecision after valid direct reply                | before any governed Task           |
| `approval-input-guard`             | require exact revision/validation/session/current state                   | before display/reply                |
| `approval-reply-guard`             | require explicit user reply after current presentation                    | before decision persistence         |
| `no-governed-task-before-approval` | require durable direct-user ApprovalDecision bound to same immutable revision, current VALID validation, ContextRecord, and current-evidence identity/hash; any mismatch denies before child creation | Session/Task boundary |

No Atlas read/write, shell, product edit, external account/authentication API, GitHub API, member tool, Task
creation, or dispatch is granted.

## Authority

Direct user conversation decides approve/decline. Maestro presents exact evidence, recognizes only explicit reply,
and records it. Maestro/member/model/tool output cannot approve itself or infer approval from user sentiment.

## Evidence, Output, and Idempotence

`ApprovalPresentation` is durable assistant Session message evidence. `request-approval` appends one immutable
`ApprovalDecision` after a valid direct reply, storing ordered presentation/user message IDs, exact
revision/validation hashes, and current-evidence identity/hash. It is prerequisite to every later governed Task;
Task fence reads existing exact decision/current evidence only. No PlanRevision or PlanValidationRecord table is
introduced until those methods have a real runtime consumer.

Presentation deduplication key is `(planRevisionId, validationRecordId, sessionId, methodVersion)`. Decision
deduplication key is `(approvalMessageId, methodVersion)`. Same reply returns stored decision. Reusing one reply
message against different presentation/revision holds with visible mismatch reason.

## Refusal and Recovery

| Condition                                                                                       | Result                                                                            |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Unavailable current-context evidence                                                        | `HOLD`; no presentation or decision                                               |
| Changed mode/capability receipt/SHA/anchor/current-evidence identity                          | `SUPERSEDED_FOR_EXECUTION`; require new context, validation, and presentation     |
| Validation/approval current-evidence mismatch                                                  | `HOLD`; named mismatch rejection before child creation                            |
| Invalid/stale/mismatched revision, validation, context, session, presentation, or message order | `HOLD`; require new presentation                                                |
| Assistant/member/tool/unrelated reply                                                           | `HOLD`; no decision/task                                                          |
| Ambiguous user reply/question                                                                   | remain `PENDING`; Maestro asks one confirmation/question                          |
| Explicit user decline/cancel                                                                    | `DECLINED`; preserve decision; no task                                            |
| Duplicate exact reply                                                                           | return stored decision                                                            |
| Interrupted display/write                                                                       | recover pending/decision from durable Session records, never conversation summary |

## Runtime Seams

| System   | Seam                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| OpenCode | exact plan display, durable ordered user/assistant messages, Session identity, decision records, Task/child-Session fence |
| Atlas    | no read/write; context only through revision/validation evidence hashes                                                   |
| GitHub   | delivery provenance only: commit, PR, review, and merge; never approval gate                                              |

## Acceptance

1. User sees exact v3 and replies explicit `aprovo`/`approve`; `APPROVED` records same presentation/revision/
   validation hashes, current-evidence identity/hash, and user message ID before any Task. No Task is created here.
2. One-file plan has same direct explicit conversation approval as larger plan.
3. Scope, acceptance, constraint, review, or policy field change invalidates old approval and requires new displayed
   revision plus user reply. Context freshness requires new ContextRecord, validation, presentation, and user reply
   on same immutable revision.
4. “Looks good”, assistant text, tool output, unrelated user message, stale presentation, altered hash, silence,
   or changed-plan discussion cannot produce `APPROVED`.
5. User decline/cancel records `DECLINED` visibly and creates no governed work.
6. Same user reply replays same decision; one reply bound to another presentation/revision holds.
7. An ABSENT/BOOTSTRAP capability/memory receipt and inspection SHA with bounded `InspectionBoundary` scope proceeds
   only through `UNGROUNDED` ScopeProposal, `PENDING` PlanRevision, `UNGROUNDED` ContextRecord, and exact `VALID`
   validation before this approval; invalid or unbounded boundary holds earlier.
8. Current-context verification is required before presentation and decision. Changed mode, SHA, receipt, or anchor
   binding requires new ContextRecord, validation, presentation, and direct ApprovalDecision on same immutable
   revision; unavailable verification holds.
9. Task/child Session fence requires exact current `VALID` validation and approved decision bound to same
   `currentEvidenceIdentityHash`. Freshness change supersedes old approval; revalidation cannot reactivate it.

## Anti-Overengineering Boundary

One durable presentation message, one approval-method conversation decision event, two guards, four results. No external auth,
GitHub workflow, PlanRevision/PlanValidation tables, sentiment parser, silent timeout approval, task creation, fast
path, or campaign approval.
