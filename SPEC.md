# atproto Slack specification

## Product

Build a Slack-style team workspace on atproto permissioned data. Accounts own their messages and requests in their own PDS repos. PDS space membership is the read-access gate. Published records and lexicons define the shared view; application databases may hold OAuth state, sync cursors, caches, and operator operation journals, but never decide who can read.

## V1 scope

- Multiple workspaces, workspace invitations and acceptance markers.
- Public and private channels, text messages, one-level replies, reactions, and private-channel requests.
- Admin promotion/demotion, workspace and channel leave/removal, privacy transitions, archive, retries and restart recovery.
- Independent app interoperability. No direct messages, uploads, presence, calls, search, internet-public channels, workspace transfer, or guaranteed erasure of already copied data.

## Protocol invariants

- Workspace, channel, and inbox spaces use member-list read and write policies and open app access.
- Ordinary workspace members have inbox `read=false, write=true`; active admins and the workspace DID have both true.
- `listRepos` is a writer set, not membership. Inbox reconciliation unions it with the owner-authorized operator `listInboxWriters` candidate set; the admin client reads candidates itself using its inbox credential.
- Workspace and private-channel roster/admin/decision records count only when authored by the workspace DID. Message and reaction edits/deletes are limited to the author.
- Admin mutations go through an authenticated operator. Every call validates a PDS-issued service-auth JWT and derives the actor from its verified `iss`, then checks current workspace, inbox, and admin state.
- Mutations are serialized, journaled, idempotent by `(workspace DID, actor DID, operationId, canonical request hash)`, and remain pending until PDS state matches the desired state.
- Removing membership blocks new credentials. Existing space credentials may work until their signed expiry, at most two hours by default.
- Stable mutable records use canonical deterministic record keys as defined in the PRD. Message text is plain text, at most 10,000 Unicode code points.

## Acceptance envelope

The launch envelope is 200 members, 100 channels, and 20,000 messages per channel. Channel open initially loads the latest 100 messages and pages older history. Writer-set recovery runs at least once per minute; operations stalled for five minutes alert an operator. Two independent apps must render the same canonical workspace state using only published lexicons, OAuth, and space credentials.

## Source documents

- Product details and acceptance criteria: `docs/prd/atproto-slack-clone.md`
- Execution order and phase gates: `docs/prd/atproto-slack-implementation-plan.md`
- Exact protocol pin and conformance evidence: `docs/protocol/atproto-spaces-pin.md`
- Operator wire contract: `docs/protocol/operator-contract.md`
- BDD scenarios: `features/`
