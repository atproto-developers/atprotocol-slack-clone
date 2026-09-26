# Implementation plan

Source gate: `docs/prd/atproto-slack-implementation-plan.md`. Work one milestone at a time and update `PROGRESS.md` with evidence.

| Milestone | Status | Exit evidence |
|---|---|---|
| M0 Protocol and scaffold | Partially complete; release-blocked | Pinned PDS documented; six conformance suites passed, but its five-second post-expiry grace fails the PRD's strict cutoff requirement |
| M1 Lexicons and auth | Complete | Generated pinned lexicon artifacts; validators, scopes, OAuth/service auth, encrypted storage, operator journal, and tests implemented |
| M2 Workspace | Complete | Workspace/inbox bootstrap, invites, acceptance discovery, directory, public-channel setup, and roster UI implemented |
| M3 Messaging and sync | Complete | Message/reply/reaction flows, latest-page sync, PDS notifications, and 60-second fallback implemented |
| M4 Private requests | Complete | Request generations/withdrawal, inbox reconciliation, approval/denial, and private roster implemented |
| M5 Lifecycle | Complete | Admin/member/channel lifecycle, journal recovery, reconciliation, pause, and stalled-operation status implemented |
| M6 Independent reader and operations | Implemented; release evidence pending | Stateless reader and operator runbooks/backup/reconcile tools implemented; local scale workload passed, while the live two-app matrix and pilot verification remain pending |

Execution order was M0 → M1 → M2 → M3/M4 → M5 → M6. The remaining M6 evidence requires a deployed pilot; it is not represented as completed by local build or protocol tests. Deployment and pilot remain separate release work.
