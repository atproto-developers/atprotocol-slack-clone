# Architecture

## Runtime boundaries

- **Browser client:** renders channels and records; uses the signed-in member's OAuth session for writes to their own repo and member-authorized space operations. It never stores the workspace authority session.
- **Next.js server:** hosts the application UI, OAuth callback/session integration, authenticated API routes, and the workspace authority operator. Browser input is treated as untrusted.
- **PDS spaces:** hold the durable interoperable workspace, inbox, channel, roster, request, decision, message, and reaction state. Their member lists enforce reads.
- **Operator journal:** SQLite persists operation identity, canonical request hash, target state, completed step markers, status, and audit events. It is not a membership or role source. Authority OAuth session material is encrypted at rest with AES-256-GCM using a deployment key.
- **Independent reader:** a separate package consumes only published lexicons and protocol clients; no imports from application database/cache code.

## Data flow

1. A member signs in through atproto OAuth. Their session and refresh state are stored separately from the authority session.
2. The app requests the narrow operation scopes declared in `src/auth/permission-sets.ts`.
3. For reads, the signed-in user exchanges a PDS delegation token for a DPoP-bound space credential. A reader syncs writers and their records from each selected space, validating author, schema, key, and same-channel references.
4. For admin actions, the client obtains a `com.atproto.server.getServiceAuth` JWT with the operator DID service ref as `aud` and the exact method NSID as `lxm`. The operator verifies all claims and re-reads current authority records and PDS member lists before acting.
5. The operator journals the desired state and applies resumable PDS membership and authority-record writes. It completes only after read-back reconciliation.
6. Inbox clients reconcile `listRepos` and owner-authorized `listInboxWriters` at least once per minute, then fetch candidate request records directly with their own inbox credential.

## Storage rules

- SQLite tables are limited to encrypted auth state, per-account sync cursors, app cache data, operation journal, and audit history.
- Never persist a locally authoritative member/admin ACL.
- Message/request ownership remains in the member's PDS repo. The operator never reads or proxies request bodies.
- On failure to renew a private space credential, stop sync and remove that account's cached private data.

## Protocol compatibility

The protocol adapter isolates the draft `com.atproto.simplespace.*` membership APIs and `com.atproto.space.*` record/credential APIs. The implementation is pinned to PDS commit `787a730fcd22ed7791e2636beb509a943017ba1c` and the exact lexicon hashes in `docs/protocol/atproto-spaces-pin.md`. Proposal 0016 is still draft; any pin drift blocks release until the conformance suite passes again.
