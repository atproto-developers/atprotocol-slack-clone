# Implementation Plan: atproto Slack

Status: ready to execute after Phase 0 passes
Source: [atproto Slack PRD](./atproto-slack-clone.md)
Date: 2026-09-24

## Goal

Build a small, interoperable Slack-style workspace on atproto spaces. PDS member lists enforce read access; shared records define workspace/channel state; a workspace authority operator performs serialized administrative changes. Do not begin feature work until a compatible PDS implementation and exact lexicon/API revision pass Phase 0.

## Execution assumptions

- Build Slack as a separate app checkout. Use Bulletin as a reference for OAuth, space credentials, lexicon code generation, multi-PDS development, and incremental sync. Do not add Slack product code to the Bulletin app.
- The current workspace wrapper has no Git metadata. Before Phase 1, identify/provision the app checkout and keep the PRD and plan available to that checkout.
- Target proposal 0016's split read/write semantics. Pin one atproto/PDS commit and generated lexicons before coding. Proposal 0016 and its implementation are drafts; an API-name mapping is not sufficient evidence by itself.
- The workspace owner provisions a dedicated DID and the authority operator's workspace-DID session with `manage=update` and the required record operations. The operator authenticates human admins separately and treats the PDS membership state as authoritative.
- The initial launch envelope is 200 members, 100 channels, and 20,000 messages per channel. Attachment/blob handling is out of scope.
- This plan describes future acceptance checks. No application code or tests are being run in this document task.

## Phase 0 — Pin and prove the protocol

**Purpose:** Resolve the only external dependency capable of invalidating the product model before building on it.

1. Select and pin a compatible atproto/PDS commit, its space lexicons, OAuth scopes implementation, and multi-PDS test environment. Record commit SHAs and setup commands in the app checkout.
2. Map proposal operations to the pinned implementation, including space create/update, member read/write state (`putMember` or equivalent), removal, `listMembers`, credential minting, record create/update/delete, writer-set enumeration, and account-level space discovery.
3. Prove workspace and channel member-list policies with independent read/write booleans, including the authority DID's own access and the owner's initial admin membership.
4. Prove the inbox configuration: ordinary workspace member has `read=false, write=true`; admin and workspace authority have `read=true, write=true`. A requester can write a request to their own PDS; `listRepos` exposes that repo to an inbox reader; requester and ordinary member cannot obtain an inbox read credential or fetch another request repo.
5. Prove that workspace acceptance markers make the workspace discoverable from a second app, that writer notifications can be missed and repaired by a sweep, and that removing membership blocks new credential minting while existing credentials expire at the documented maximum.
6. Prove the workspace DID OAuth session can perform management calls and authority-authored writes, and that a user admin record alone cannot grant protocol management access.
7. Define a stable authority-operator request contract that another app can call for admin actions, actor authentication, serialized operation journal, and exact scope list. Pin stable-key/hash encoding in a short protocol note and generate the lexicon/client artifacts.

**Exit gate:** A multi-PDS conformance run passes every proof above; the exact commit and API mapping are documented; the authority operator has a concrete authenticated request contract. If the inbox cannot support read-only admins and write-only workspace members with member-list policies, stop and revise the PRD before feature work. Do not replace the PDS read gate with app-database checks.

## Phase 1 — App foundation and authority records

1. Create the separate app checkout and establish build, lint, typecheck, deployment configuration, and the pinned PDS development environment.
2. Publish and generate `org.slack.*` lexicons and space-type permission sets. Define validators for stable record keys, request generations, same-channel reply references, message length, and authority authorship.
3. Implement OAuth login, narrowly scoped member permissions, space credential acquisition/renewal, and shared repo sync primitives. Keep user OAuth sessions, workspace authority sessions, and space credentials separate.
4. Implement the authority operator's authenticated admin request contract. Persist only an operation journal and audit events; never use its database as the current membership or role source.
5. Implement canonical upsert/read helpers for the directory, workspace roster, admin state, private roster, join requests, and decisions. Stable keys use the PRD's exact hash encoding.

**Acceptance:** Two PDS accounts can create and read the protocol records. A record with an invalid schema, wrong authority author, noncanonical key, or cross-channel target is rejected or ignored as specified. OAuth consent asks only for operations needed by the current user action.

## Phase 2 — Workspace setup, invitations, and public channels

1. Create the workspace DID's workspace and inbox spaces with the pinned policies. Ensure the authority and owner have the required member-list entries; the owner becomes the first active admin.
2. Invite a DID through the authority operator. Apply workspace `read=true/write=true`, inbox `read=false/write=true`, and public-channel `read=true/write=true` membership before reporting invite completion. Write the workspace roster and send the workspace URI to the invitee. Membership begins on invite; acceptance is the recipient's later discovery marker.
3. Let the invitee write the workspace acceptance marker. Discover the workspace on a second account session using the account's spaces index, then read its directory and roster.
4. Create public channel spaces. Add all current workspace members with read/write membership before publishing the directory record as public.
5. Implement channel listing, private-name display, and member/channel navigation.

**Acceptance:** Adding a workspace member updates workspace, inbox, and all public channel member lists before the invite is reported complete. A forwarded workspace URI gives no access to a DID absent from the member list. A second app discovers the invited-and-accepted workspace and renders the same directory and roster. Removal fan-out is accepted in Phase 5.

## Phase 3 — Public-channel messages and sync

1. Implement text message create/edit/delete, one-level replies to top-level messages in the same channel, and per-user emoji reactions.
2. Restrict edits/deletes to the record author in the UI and validate all records when syncing.
3. Sync repos from `listRepos`, retain each repo revision, use notifications for prompt updates, and sweep at least once per minute to recover missed notifications.
4. Page history and show the latest 100 messages first. Do not fetch every workspace channel when a user opens one channel.

**Acceptance:** Two independent clients show the same public-channel records. A user can create/update/delete only their own records through the app. A dropped notification is repaired on the next sweep. A reply referencing another channel or a nested reply is ignored. Text above 10,000 Unicode code points is rejected.

## Phase 4 — Private-channel requests and approvals

1. Add a private channel for selected members only, with a current authority-authored roster record for each active member.
2. Implement stable-key request upsert with a fresh TID `requestId` per submission, requester withdrawal/deletion, and stale-request grouping.
3. Sync the inbox only with an admin credential. Reconcile its writer set at least once per minute; fetch request repos only as an authorized inbox reader.
4. Implement admin approve/deny. Approval performs channel membership, roster, and matching-generation decision writes as one journaled operation. Denial writes only the decision. Expose pending/error status until the operation reaches its required state.
5. Give an approved requester channel credentials and render the full active private roster, including members with no messages.

**Acceptance:** Requester can read only their own request; ordinary members cannot mint inbox credentials or read request repos; admins can recover a request after a dropped notification; stale decisions do not approve a resubmitted request; denied users receive no channel membership; approved users see the same messages and roster in two apps.

## Phase 5 — Membership, admin, privacy-transition, and archive lifecycle

1. Implement promotion/demotion with inbox read-membership updates. Enforce the invariant that at least one active admin remains.
2. Implement workspace and private-channel self-leave, plus admin removal. Removal updates all applicable channel and inbox memberships, workspace roster, private rosters, and admin state through the serialized operator.
3. Implement public-to-private and private-to-public transitions. Publish `transitioning` first, reconcile the selected desired membership, then publish the final visibility. Clients stop new syncs while transitioning.
4. Implement archive by transitioning, removing channel members, and publishing archived. Keep message records in member repos.
5. Add idempotent retries, restart recovery, per-workspace serialization, pending/failed status, and periodic reconciliation between directory/roster state and PDS member lists.

**Acceptance:** Every injected failure at each mutation step leaves an honest pending/transitioning state and converges after restart. New credentials fail after removal; an existing credential is usable only through its expiration. Public-to-private preserves the same URI and messages. Public membership follows workspace membership. Last-admin removal/leave/demotion is rejected. Archived channels do not issue new credentials.

## Phase 6 — Independent-app conformance, security, and launch

1. Build a small independent reader/conformance client that uses only published lexicons, OAuth, and space credentials; it must not read the first app's database or private cache.
2. Exercise the acceptance matrix from the PRD across at least two PDS hosts, including wrong-author records, absent members, inbox read/write separation, expired credentials, missed notifications, and partial operator failures.
3. Verify the 200-member/100-channel/20,000-message envelope, latest-100 initial rendering, 60-second writer-set recovery, and five-minute stalled-operation alert.
4. Review secrets handling, authority session encryption, OAuth scopes, audit events, plaintext exposure, cache purge after credential renewal fails, HTTPS, and backup/recovery of the operator journal.
5. Deploy behind a limited workspace pilot. Provide operators a pause switch for admin mutations, status view for pending operations, and recovery instructions. Expand only after the pilot acceptance criteria pass.

**Launch gate:** All PRD acceptance criteria pass against the pinned protocol revision; the independent reader agrees with the primary app; no app-database ACL is required for read access; operational recovery and credential expiry behavior are demonstrated. Record protocol drift as a release blocker.

## Dependency order

`Phase 0 → Phase 1 → Phase 2 → Phase 3 and Phase 4 → Phase 5 → Phase 6`

Phase 3 and Phase 4 can proceed in parallel after Phase 2's channel and sync foundation is complete. Phase 5 depends on both because it reconciles message-bearing spaces and private-channel membership. Phase 6 depends on every product flow.

## Risks and responses

| Risk | Response |
|---|---|
| PDS API or policy semantics change while proposal 0016 is still draft | Pin a commit in Phase 0, hide API names behind a small adapter, and block release on conformance drift. |
| Workspace authority credential is compromised | Encrypt it at rest, limit scopes, separate operator auth from member OAuth, audit each mutation, and support credential rotation. |
| A multi-space update partially fails | Serialize by workspace/channel, journal desired state and completed steps, keep the UI pending/transitioning, and reconcile from PDS state after restart. |
| A revoked reader keeps an old credential or downloaded data | Stop compliant sync at transition/removal; document the two-hour default token window and the impossibility of erasing prior copies. |
| Users grant broader OAuth scopes or write nonconforming records | Keep read access PDS-enforced, validate author and schema in every app, and ignore invalid records. |
| Notifications are lost or a PDS is unavailable | Persist last revisions, sweep writer sets at least once per minute, retry transient errors, and alert on five minutes of stalled operations. |
| Workspace/channel count or history exceeds v1 envelope | Page per channel, load latest 100 first, expose degraded state, and do not silently truncate. |

## PRD traceability

| PRD requirement | Plan phase |
|---|---|
| Split policy behavior, inbox write-only membership, credential/revoke semantics | 0, 4, 5 |
| Workspace DID, roles, invite/discovery, authority records | 1, 2, 5 |
| Public channel records and cross-app consistency | 2, 3, 6 |
| Private requests, approvals, decisions, and hidden roster | 4, 6 |
| Member leave/removal and public/private fan-out | 5 |
| Transition, archive, recovery, and data retention | 5, 6 |
| Security, performance envelope, and launch acceptance | 6 |

## Readiness

This plan is ready to execute. Phase 0 is a hard external dependency gate, not a product decision left for implementers. Product behavior, records, permissions, lifecycle, failure handling, and launch acceptance are defined in the PRD and mapped above.
