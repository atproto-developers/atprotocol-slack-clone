import assert from "node:assert/strict";
import test from "node:test";
import { permissionScopeFor, WORKSPACE_DISCOVERY_SCOPE, workspaceAuthorityScopes } from "./permission-sets";

const serviceRef = "did:web:slack.example#atproto_slack_admin";

test("member leave authorization grants only execute", () => {
  assert.deepEqual(permissionScopeFor("operatorLeave", {
    workspaceDid: "did:plc:owner", workspaceSkey: "acme", serviceRef,
  }), ["rpc:org.slack.operator.execute?aud=did:web:slack.example%23atproto_slack_admin"]);
});

test("admin authorization includes only the three published operator methods", () => {
  const scopes = permissionScopeFor("operatorAdmin", { workspaceDid: "did:plc:owner", serviceRef });
  assert.equal(scopes.length, 1);
  assert.equal(scopes[0], "rpc?lxm=org.slack.operator.execute&lxm=org.slack.operator.getOperation&lxm=org.slack.operator.listInboxWriters&aud=did:web:slack.example%23atproto_slack_admin");
});

test("operator RPC scopes preserve percent-encoded DID web ports", () => {
  assert.deepEqual(permissionScopeFor("operatorLeave", {
    workspaceDid: "did:plc:owner",
    workspaceSkey: "acme",
    serviceRef: "did:web:localhost%3A3000#atproto_slack_admin",
  }), ["rpc:org.slack.operator.execute?aud=did:web:localhost%253A3000%23atproto_slack_admin"]);
});

test("workspace authority scopes contain no message or reaction writes", () => {
  const scopes = workspaceAuthorityScopes();
  assert.ok(scopes.some((scope) => scope.includes("manage=create&manage=update")));
  assert.ok(scopes.some((scope) => scope.includes("collection=org.slack.channel.roster")));
  assert.ok(scopes.every((scope) => !scope.includes("channel.message") && !scope.includes("channel.reaction")));
});

test("login discovery scope is read-self only across workspace authorities", () => {
  assert.equal(WORKSPACE_DISCOVERY_SCOPE, "space:org.slack.workspace?authority=*&collection=org.slack.acceptance&action=read_self");
});

test("workspace authority combines equivalent read actions into compact scopes", () => {
  const scopes = workspaceAuthorityScopes();
  assert.ok(scopes.includes("space:org.slack.workspace?authority=self&skey=*&action=read_self&action=read&manage=create&manage=update"));
  assert.ok(scopes.includes("space:org.slack.inbox?authority=self&skey=*&action=read_self&action=read&manage=create&manage=update"));
  assert.ok(scopes.includes("space:org.slack.channel?authority=self&skey=*&action=read_self&action=read&manage=create&manage=update"));
});

test("member permission scopes reject keys that can inject OAuth parameters", () => {
  for (const skey of ["general&action=create", "general=other", "*"]) {
    assert.throws(() => permissionScopeFor("channelRead", {
      workspaceDid: "did:plc:owner", skey,
    }), /Invalid space key/);
    assert.throws(() => permissionScopeFor("workspaceRead", {
      workspaceDid: "did:plc:owner", workspaceSkey: skey,
    }), /Invalid space key/);
  }
});

test("channel write scopes reject injected keys and preserve the exact valid scope", () => {
  for (const skey of ["*", "x&skey=*"]) {
    assert.throws(() => permissionScopeFor("channelWrite", {
      workspaceDid: "did:plc:owner", skey,
    }), /Invalid space key/);
  }
  assert.deepEqual(permissionScopeFor("channelWrite", {
    workspaceDid: "did:plc:owner", skey: "general",
  }), ["space:org.slack.channel?authority=did:plc:owner&skey=general&collection=org.slack.channel.message&collection=org.slack.channel.reaction&action=create&action=update&action=delete"]);
});
