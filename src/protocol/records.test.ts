import assert from "node:assert/strict";
import test from "node:test";
import { channelUri, requestRecordKey, spaceRecordUri, subjectKey } from "./keys";
import { validateSpaceRecord } from "./records";

const authorityDid = "did:plc:owner";
const memberDid = "did:plc:member";
const workspace = "at://did:plc:owner/space/org.slack.workspace/workspace";
const channel = channelUri(authorityDid, "general");
const otherChannel = channelUri(authorityDid, "private");
const now = "2026-09-24T12:00:00.000Z";

test("authority records require the authority author and canonical roster key", () => {
  const value = { subject: memberDid, active: true, updatedAt: now };
  assert.equal(validateSpaceRecord("org.slack.workspace.roster", value, {
    authorityDid, spaceUri: workspace, repoDid: authorityDid, rkey: subjectKey(memberDid),
  }).valid, true);
  assert.equal(validateSpaceRecord("org.slack.workspace.roster", value, {
    authorityDid, spaceUri: workspace, repoDid: memberDid, rkey: subjectKey(memberDid),
  }).valid, false);
  assert.equal(validateSpaceRecord("org.slack.workspace.roster", value, {
    authorityDid, spaceUri: workspace, repoDid: authorityDid, rkey: "wrong",
  }).valid, false);
});

test("workspace profile records are authority authored and use the self key", () => {
  const profile = { $type: "org.slack.workspace.profile", name: "Acme", createdAt: now };
  assert.equal(validateSpaceRecord("org.slack.workspace.profile", profile, {
    authorityDid, spaceUri: workspace, repoDid: authorityDid, rkey: "self",
  }).valid, true);
  assert.equal(validateSpaceRecord("org.slack.workspace.profile", profile, {
    authorityDid, spaceUri: workspace, repoDid: memberDid, rkey: "self",
  }).valid, false);
  assert.equal(validateSpaceRecord("org.slack.workspace.profile", profile, {
    authorityDid, spaceUri: workspace, repoDid: authorityDid, rkey: "other",
  }).valid, false);
});

test("validators bind collections to space types and directory keys to channel keys", () => {
  assert.equal(validateSpaceRecord("org.slack.directory", {
    skey: "general", name: "General", visibility: "public",
  }, { authorityDid, spaceUri: channel, repoDid: authorityDid, rkey: "general" }).valid, false);
  assert.equal(validateSpaceRecord("org.slack.directory", {
    skey: "general", name: "General", visibility: "public",
  }, { authorityDid, spaceUri: workspace, repoDid: authorityDid, rkey: "general" }).valid, true);
});

test("messages reject oversized, cross-channel and nested reply references", () => {
  const top = spaceRecordUri(channel, "did:plc:alice", "org.slack.channel.message", "2222222222222");
  const nested = spaceRecordUri(channel, "did:plc:bob", "org.slack.channel.message", "2222222222223");
  const baseContext = {
    authorityDid, spaceUri: channel, repoDid: "did:plc:alice", rkey: "2222222222224",
    knownMessages: new Set([top, nested]), knownTopLevelMessages: new Set([top]),
  };
  assert.equal(validateSpaceRecord("org.slack.channel.message", { text: "hello", createdAt: now, parent: top }, baseContext).valid, true);
  assert.equal(validateSpaceRecord("org.slack.channel.message", { text: "hello", createdAt: now, parent: nested }, baseContext).valid, false);
  assert.equal(validateSpaceRecord("org.slack.channel.message", { text: "😀".repeat(10_000), createdAt: now }, baseContext).valid, true);
  assert.equal(validateSpaceRecord("org.slack.channel.message", { text: "😀".repeat(10_001), createdAt: now }, baseContext).valid, false);
  assert.equal(validateSpaceRecord("org.slack.channel.message", { text: "hello", createdAt: now, parent: `${otherChannel}/x` }, baseContext).valid, false);
});

test("request records use the workspace inbox URI shape and canonical key", () => {
  const request = { channelSkey: "general", requestId: "2222222222222", createdAt: now };
  const valid = validateSpaceRecord("org.slack.joinRequest", request, {
    authorityDid, spaceUri: "at://did:plc:owner/space/org.slack.inbox/inbox", repoDid: memberDid,
    rkey: requestRecordKey(channel, memberDid),
  });
  assert.equal(valid.valid, true);
});
