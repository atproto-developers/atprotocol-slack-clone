import assert from "node:assert/strict";
import test from "node:test";
import { assertWorkspaceRosterMatchesPds, validateOperatorRequest } from "./operations";
import type { OperatorActor } from "./security";

const actor = { workspace: { authorityDid: "did:plc:owner" } } as OperatorActor;

test("operator accepts only exact self-leave shapes and reconciliation request", () => {
  assert.deepEqual(validateOperatorRequest({ kind: "leaveWorkspace" }, actor), { kind: "leaveWorkspace" });
  assert.deepEqual(validateOperatorRequest({ kind: "reconcileWorkspace" }, actor), { kind: "reconcileWorkspace" });
  assert.throws(() => validateOperatorRequest({ kind: "leaveWorkspace", subject: "did:plc:other" }, actor), /unexpected fields/i);
  assert.throws(() => validateOperatorRequest({ kind: "leaveChannel", skey: "general", subject: "did:plc:other" }, actor), /unexpected fields/i);
});

test("private visibility transitions require a selected member list", () => {
  assert.throws(() => validateOperatorRequest({ kind: "transitionChannel", skey: "general", visibility: "private" }, actor), /selected member list/i);
  assert.deepEqual(validateOperatorRequest({ kind: "transitionChannel", skey: "general", visibility: "private", members: ["did:plc:member"] }, actor).members, ["did:plc:member"]);
});

test("workspace channel grants require the roster and live PDS membership to match", () => {
  const authority = "did:plc:owner";
  const member = "did:plc:member";
  assert.doesNotThrow(() => assertWorkspaceRosterMatchesPds(
    new Set([authority, member]),
    [{ did: member, read: true, write: true }],
    authority,
  ));
  assert.throws(() => assertWorkspaceRosterMatchesPds(
    new Set([member]),
    [],
    authority,
  ), /roster has not converged/i);
  assert.throws(() => assertWorkspaceRosterMatchesPds(
    new Set(),
    [{ did: member, read: true, write: true }],
    authority,
  ), /roster has not converged/i);
  assert.throws(() => assertWorkspaceRosterMatchesPds(
    new Set([member]),
    [{ did: member, read: true, write: false }],
    authority,
  ), /roster has not converged/i);
});
