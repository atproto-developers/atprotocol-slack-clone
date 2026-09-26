# Direct messages — implementation plan

Status: **proposed, awaiting approval**. Date: 2026-09-26.
Protocol baseline: proposal 0016 draft, pinned PDS `787a730f` (see `docs/protocol/atproto-spaces-pin.md`).

## 1. Goal and the constraint that drives everything

Add 1:1 and small-group DMs such that **no app-operated component can read, gate, lose, or hold hostage a DM**. Concretely, every DM must remain readable, writable, discoverable, and revocable by its participants if this app's server, database, operator, and notification endpoint all disappear, using only participants' PDSes, published lexicons, and any OAuth client.

Non-goals for v1: end-to-end encryption, attachments, DM search, presence/typing, message retention policies, workspace-admin export of DMs.

## 2. What "app-layer centralization" means here

| # | Risk | Where it exists today for channels | DM design answer |
|---|---|---|---|
| R1 | App/operator is the **space authority** (owns membership) | Channels live under the workspace DID and the operator holds its session | No shared authority. Each participant owns the space holding *their own* messages |
| R2 | App server **holds a session that can read the data** | Server-side `oauth-client-node` sessions | DM scopes are granted only to a **browser-held OAuth session**. The server session never requests DM scopes, and no server route touches DM content |
| R3 | App server **stores plaintext copies** | `channel_record_cache` (encrypted with an app-held key) | No server-side DM cache. DMs are small (≤ 9 writers), so reads go directly to the PDS |
| R4 | App **decides access** | Rejected already (member lists gate reads) | Same: PDS member lists only. `managingAppPolicy` is explicitly forbidden for DM spaces |
| R5 | App is **needed for discovery or delivery** | Workspace invites are out-of-band URIs; the inbox recovery uses the operator | Recipient-owned inbox space discovered through `listRepos` on the recipient's own PDS. Sender-side re-notify handles dropped notifications. No app relay |
| R6 | App **sees the social graph** | Notification registrations name the app's service | Each user's app registers only for spaces its own user reads. Conversation keys are random, so space URIs cannot be computed to probe "do A and B talk?" |
| R7 | **Workspace admin** can read or kill DMs | N/A | DMs are person-scoped, not workspace-owned. Leaving or being removed from a workspace does not touch DMs |

## 3. Design

### 3.1 Two space types, both user-owned

**Personal DM inbox** — `at://<did>/space/org.slack.dm.inbox/self`
- Created once by each user when they enable DMs. The fixed `skey` is `self`, so any app can find it from a DID alone.
- `readPolicy: memberList` (owner only), `writePolicy: public`, `appAccess: open`.
- Senders write `org.slack.dm.request` records **in their own repo** scoped to the recipient's inbox (`com.atproto.space.putRecord` on the sender's PDS). The recipient's PDS learns the writer set from write notifications. The recipient reads it with `listRepos` plus direct record reads, which is the same pattern as the existing workspace inbox.
- If a user has no inbox, they have not enabled DMs, and the UI says so. There is no fallback path through an app.

**Conversation half** — `at://<did>/space/org.slack.dm.conversation/<convKey>`
- Every participant who posts owns one. It holds **only that participant's messages**.
- `readPolicy: memberList` (all participants read=true), `writePolicy: memberList` (owner only write=true), `appAccess: open`.
- `convKey` is a random TID chosen by the initiator and carried in the request. It is **not** a hash of the DIDs, because a deterministic key would let anyone who can probe space existence confirm who talks to whom.
- The **participant set is immutable** per conversation. Adding someone means starting a new conversation, which matches Slack group-DM semantics and removes every membership-mutation race.

This is **symmetric sovereignty**: each person controls exactly their own words. Removing others from your half revokes their read access to *your* messages ("unsend everything"). Nobody can revoke someone else's messages, add a reader to someone else's messages, or delete the conversation for everyone.

### 3.2 Lexicons (new, `org.slack.dm.*`)

| NSID | Kind | Key | Lives in | Purpose |
|---|---|---|---|---|
| `org.slack.dm.inbox` | space type | `self` | recipient | Request mailbox |
| `org.slack.dm.conversation` | space type | random TID | each participant | That participant's half |
| `org.slack.dm.request` | record | `convKey` | sender repo → recipient inbox | `{ convKey, participants[2..9], createdAt }`. Sorted, deduplicated DIDs that include both parties |
| `org.slack.dm.header` | record | `self` | owner repo → own half | `{ convKey, participants, createdAt }`. It must equal the request set, or readers ignore the half |
| `org.slack.dm.message` | record | TID | owner repo → own half | `{ text ≤ 10,000 code points, createdAt, parent? }`. Edits and deletes are by the author only (implicitly, since the record is in their repo) |
| `org.slack.dm.reaction` | record | canonical key (same scheme as channels) | owner repo → own half | Subject must be a message in the same conversation |

Validation lives in `src/protocol/records.ts`, next to the channel rules: authority == repo for every `header/message/reaction`, `convKey` equals the space `skey`, and participant counts and bounds are checked.

### 3.3 Flows

1. **Enable DMs:** create your inbox space and add yourself as a read member.
2. **Start a conversation** (initiator A; participants P, with 2 ≤ |P| ≤ 9):
   - Before creating anything new, check local conversations (from `listSpaces(type=org.slack.dm.conversation)` on A's own PDS) for the same participant set, and reuse one if found.
   - Create A's half with a fresh `convKey` and add P as read members. Write the header.
   - For each other participant, write `org.slack.dm.request` into their inbox.
3. **Discovery (recipient B):** B's client periodically runs `listRepos` on B's own inbox, fetches new requests, and applies a **local** allow policy. The default shows requests from DIDs that share a workspace with B or that B has written to before; everything else goes to a "Requests" folder. Nothing is decided server-side.
4. **Accept / reply:** B creates B's half with the same `convKey` and participants, writes a header, then posts. Declining is simply never creating a half; B can also hide the request locally.
5. **Read:** for each participant in P, mint a space credential for `at://<p>/space/org.slack.dm.conversation/<convKey>` (a missing half means "hasn't replied"), read that owner's records, validate them, and merge by `createdAt`/TID. At most 9 credentials are needed, and they are cached up to their ≤ 2 h expiry.
6. **Real-time:** the browser client registers **its own app's** notify service on the halves it reads. On the server, the notify handler only fans out a content-free "space changed" SSE event, so the server never sees record bodies. Correctness never depends on notifications: the client also polls every 60 s and reads on open.
7. **Dropped-notification recovery:** A cannot read B's inbox, so an unaccepted request and an undelivered one look the same to A. For requests without a reply half, A's client re-puts the same record (same rkey, new rev, which triggers a fresh notification) on a bounded backoff: 1 min, 10 min, 1 h, 1 day, then stop. This is idempotent on B's side.
8. **Leave / block:** remove the other participants from your half (`removeMember`) and hide the conversation locally. **Delete everything:** delete your half. Copies other people already fetched are not recalled; this is the same caveat as in `SPEC.md`.
9. **Cross-app recovery:** everything above can be rebuilt from the user's own PDS (their `listSpaces` of their conversation halves, each half's member list, and their inbox) plus the other participants' halves. No app database is involved.

### 3.4 Client architecture

- **Browser DM session:** add `@atproto/oauth-client-browser` with a separate public `client_id` whose metadata requests **only** DM scopes:
  - own inbox: read
  - own conversation halves: create/update/delete, plus member management
  - requests: `create` on `org.slack.dm.inbox?authority=*` restricted to collection `org.slack.dm.request`
  - reads of other participants' halves

  DPoP keys are non-extractable WebCrypto keys. The Next server's session keeps its current workspace scopes and never gains DM scopes, so a compromised app server cannot read DMs using stored tokens.
- **Code sharing:** move `src/atproto/dpop.ts`, `space-credential.ts`, and `record-pages.ts` to isomorphic code (WebCrypto in place of `node:crypto`) so server channels and browser DMs share one audited implementation. `src/reader/independent.ts` gains a DM reader built from the same modules, which proves second-app parity.
- **No DM routes, tables, or cache on the server.** The only server involvement is the content-free SSE fan-out from step 6. A lint rule (an `eslint` `no-restricted-imports` boundary) keeps `src/dm/**` from importing `@/lib/db`, `@/auth/*`, or `@/operator/*`.
- **UI:** a DM section in the sidebar, filtered by default to co-members of the active workspace; a "Requests" folder; conversation view reusing `ChannelView` rendering where it fits.

### 3.5 Relationship to workspaces

DMs belong to people, not workspaces. The workspace is only a *UI filter* and a *default trust signal* for the request allow policy. Consequences: workspace admins cannot read or delete DMs, workspace removal does not cut off DMs, and there is no DM export for admins. This deliberately differs from Slack Enterprise and needs a product sign-off (see §7).

## 4. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| DM spaces owned by the workspace DID and run by the operator | R1, R2 and R7: the operator/workspace owner could add itself as a reader and read every DM |
| One space owned by the initiator | Asymmetric: the initiator can remove the other party from history, add silent readers, or delete the whole conversation |
| App-run relay or `managingAppPolicy` for discovery/access | R4/R5: it puts the app back in the access path and makes the app a single point of failure |
| Deterministic `convKey = hash(sorted DIDs)` | Existence probing leaks the social graph (R6); local dedupe gives the same UX |
| Server-side DM cache (encrypted with an app key) | R3: the app holds the key, so this is custody in all but name. Small DM spaces don't need it |
| Mutable group membership | Needs cross-owner consensus on N halves; immutable sets remove the problem entirely |

## 5. Residual risks (stated, not solved in v1)

1. **PDS hosts see plaintext.** Each participant's PDS stores their messages. This is the same trust level as all atproto data. The follow-up is MLS-based E2EE as a new record type (`org.slack.dm.encryptedMessage`), and the design above needs no structural change to add it.
2. **Served JavaScript.** The app server delivers the browser client and could ship malicious code. Mitigations: independent clients work through the published lexicons, releases have Subresource Integrity (SRI) and reproducible builds, and the independent reader proves parity.
3. **Inbox spam.** `writePolicy: public` lets anyone grow a user's writer set. Mitigations: bounded `listRepos` scans (existing `listBoundedRepos`), the local allow policy, and the requests folder. PDS-level rate limits are out of our control. A `memberList` inbox would block strangers entirely, which is a product choice (see §7).
4. **Draft protocol.** Every assumption below must pass conformance on the pinned PDS before any app code is written.

## 6. Milestones

Each milestone ends with the stated evidence recorded in `PROGRESS.md`. M0 is a hard gate.

**M0 — Protocol conformance (gate).** Extend `protocol-tests/atproto/` against the pinned PDS and prove:
- (a) a non-member can `putRecord` into a `writePolicy: public` space from their own PDS, and the authority's `listRepos` reports them;
- (b) a `memberList` read space denies a non-member credential with the same error whether or not the space exists (no existence oracle; if this fails, document the leak);
- (c) the `authority=*` scope with collection restriction works for request writes;
- (d) `removeMember` blocks new credentials, and existing ones expire at the strict cutoff (the overlay already exists);
- (e) a browser-style public OAuth client can obtain delegation tokens and space credentials with WebCrypto DPoP.

Exit: all pass, or the plan is revised.

**M1 — Lexicons and validation.** Add the six lexicons, codegen, and record validators with unit tests (participant bounds, key rules, authority == repo, header/request equality). Add a BDD `features/direct-messages.feature` covering start, request, accept, read, edit/delete, leave, delete-all, group, and spam filtering.

**M2 — Isomorphic protocol core.** Port DPoP, space credentials, and record paging to WebCrypto. Server channel code switches to the shared modules, and the existing unit and acceptance suites must stay green. Add the lint boundary rule.

**M3 — Browser DM session.** Add the `oauth-client-browser` integration, public client metadata route, DM permission set, and consent UX. Test: the server session's granted scopes contain no DM scope (asserted).

**M4 — DM engine (`src/dm/`).** Covers enabling DMs, starting (with local dedupe), inbox discovery with the allow policy, accept, send/edit/delete, reactions, read/merge with validation, leave, delete-all, and re-notify backoff. Unit tests use protocol fakes. The two-PDS backend acceptance runs 1:1 and 3-person flows across hosts.

**M5 — UI.** Sidebar DM list, requests folder, conversation view, and SSE fan-out (content-free). Playwright: two browsers on two PDSes complete a DM round trip, then one side revokes and the other loses access after credential expiry.

**M6 — Independence proof.** The independent reader renders identical DM state from lexicons only. A "server off" test runs the full DM flow with the Next server's DB deleted and its notify endpoint down (only the static client is served) and must pass. Update `SPEC.md`, `ARCHITECTURE.md`, and `CODE-MAP.md`.

## 7. Decisions needed from you

1. **Browser-held DM OAuth session (recommended)** vs. reusing the server session. The browser session costs a second consent screen, but it is the only option that removes server-side token custody (R2).
2. **Inbox write policy:** `public` (anyone can request; spam handled client-side, recommended for Slack-like reach) vs. `memberList` (you pre-approve who may request, which works for contacts only).
3. **Person-scoped DMs** (recommended) vs. workspace-scoped DMs that admins can govern. The latter reintroduces R7.
4. **Group size cap:** 9 participants (Slack parity, recommended).
