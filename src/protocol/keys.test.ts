import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptanceRecordKey,
  canonicalJson,
  decisionRecordKey,
  parseSpaceRecordUri,
  recordKeyHash,
  reactionRecordKey,
  requestDigest,
  requestRecordKey,
  spaceRecordUri,
  stableHash,
  subjectKey,
  tidNow,
} from "./keys";

test("stable hashes use UTF-8 SHA-256 and lowercase unpadded base32", () => {
  assert.equal(stableHash("abc"), "xj4bnp4pahh6uqkbidpf3lrceoyagyndsylxvhfucd7wd4qacwwq");
  assert.equal(recordKeyHash("abc"), "x:j:4:b:n:p:4:p:a:h:h:6:u:q:k:b:i:d:p:f:3:l:r:c:e:o:y:a:g:y:n:d:s:y:l:x:v:h:f:u:c:d:7:w:d:4:q:a:c:w:w:q");
  assert.equal(subjectKey("did:plc:alice"), `d-${recordKeyHash("did:plc:alice")}`);
  assert.equal(requestRecordKey("at://did:plc:owner/space/org.slack.channel/general", "did:plc:alice"),
    `r-${recordKeyHash("at://did:plc:owner/space/org.slack.channel/general\u0000did:plc:alice")}`);
  assert.equal(acceptanceRecordKey("at://did:plc:owner/space/org.slack.workspace/workspace"),
    `a-${recordKeyHash("at://did:plc:owner/space/org.slack.workspace/workspace")}`);
  const messageUri = spaceRecordUri("at://did:plc:owner/space/org.slack.channel/general", "did:plc:alice", "org.slack.channel.message", "abc");
  assert.equal(reactionRecordKey(messageUri, "💜", "did:plc:alice"),
    `x-${recordKeyHash(`${messageUri}\u0000💜\u0000did:plc:alice`)}`);
  const requestUri = spaceRecordUri("at://did:plc:owner/space/org.slack.inbox/inbox", "did:plc:alice", "org.slack.joinRequest", "r-abc");
  assert.equal(decisionRecordKey(requestUri), `q-${recordKeyHash(requestUri)}`);
  assert.ok(subjectKey("did:plc:alice").length <= 512);
  assert.match(subjectKey("did:plc:alice"), /^d-[a-z2-7](?::[a-z2-7]){51}$/);
  assert.deepEqual(parseSpaceRecordUri(messageUri, "at://did:plc:owner/space/org.slack.channel/general", "org.slack.channel.message"), {
    repo: "did:plc:alice", rkey: "abc",
  });
  assert.equal(parseSpaceRecordUri("at://did:plc:alice/org.slack.channel.message/abc", "at://did:plc:owner/space/org.slack.channel/general", "org.slack.channel.message"), null);
  assert.equal(parseSpaceRecordUri(messageUri, "at://did:plc:owner/space/org.slack.channel/other", "org.slack.channel.message"), null);
});

test("canonical JSON sorts keys and rejects values outside its JSON domain", () => {
  assert.equal(canonicalJson({ z: -0, a: [true, "x"] }), '{"a":[true,"x"],"z":0}');
  assert.equal(requestDigest({ b: 2, a: 1 }), requestDigest({ a: 1, b: 2 }));
  assert.throws(() => canonicalJson({ a: undefined }), /undefined/);
  assert.throws(() => canonicalJson(Number.NaN), /non-finite/);
  assert.throws(() => canonicalJson(new Date()), /plain objects/);
});

test("TIDs use the protocol alphabet and are sortable by millisecond", () => {
  const first = tidNow(1_700_000_000_000, 1);
  const second = tidNow(1_700_000_000_001, 1);
  assert.match(first, /^[234567abcdefghijklmnopqrstuvwxyz]{13}$/);
  assert.ok(first < second);
  assert.notEqual(tidNow(1_700_000_000_000, 1), tidNow(1_700_000_000_000, 2));
});
