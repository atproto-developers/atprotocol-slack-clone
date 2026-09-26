import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, isAccessFailure, makeTid, mergeMessages, parseWorkspaceUri, splitDids, toSlug, withReactions, type Message } from "./client-api";

const message = (rkey: string): Message => ({ uri: `at://did:plc:a/space/x/${rkey}`, rkey, repo: "did:plc:a", value: { text: rkey } });

test("withReactions counts per emoji and marks the viewer's own reactions", () => {
  const [first, second] = withReactions([message("2"), message("1")], [
    { repo: "did:plc:me", value: { subject: message("2").uri, emoji: "💜" } },
    { repo: "did:plc:b", value: { subject: message("2").uri, emoji: "💜" } },
    { repo: "did:plc:b", value: { subject: message("2").uri, emoji: "👍" } },
    { repo: "did:plc:b", value: { subject: 42 as unknown as string, emoji: "👍" } },
  ], "did:plc:me");
  assert.deepEqual(first.reactions, [{ emoji: "💜", count: 2, active: true }, { emoji: "👍", count: 1, active: false }]);
  assert.deepEqual(second.reactions, []);
});

test("mergeMessages dedupes by URI and sorts newest first", () => {
  assert.deepEqual(mergeMessages([message("3"), message("2")], [message("2"), message("1")], true).map((entry) => entry.rkey), ["3", "2", "1"]);
  assert.deepEqual(mergeMessages([message("3")], [message("1")], false).map((entry) => entry.rkey), ["1"]);
});

test("client helpers parse workspace URIs, DID lists, slugs, TIDs, and access failures", () => {
  assert.deepEqual(parseWorkspaceUri(" at://did:plc:abc/space/org.slack.workspace/team "), { authorityDid: "did:plc:abc", skey: "team" });
  assert.equal(parseWorkspaceUri("at://did:plc:abc/space/org.slack.channel/team"), null);
  assert.deepEqual(splitDids(" did:plc:a, did:plc:b\n"), ["did:plc:a", "did:plc:b"]);
  assert.equal(toSlug("  Project Room!! "), "project-room");
  assert.equal(toSlug("!!!"), "channel");
  assert.match(makeTid(), /^[2-7a-z]{13}$/);
  assert.equal(isAccessFailure(new ApiError(409, "archived")), true);
  assert.equal(isAccessFailure(new ApiError(500, "down")), false);
  assert.equal(isAccessFailure(new Error("plain")), false);
});
