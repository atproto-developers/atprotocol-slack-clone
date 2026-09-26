import assert from "node:assert/strict";
import test from "node:test";
import { channelPageHasMore } from "./channel-sync";

test("channel history pagination stops at the configured cap while retaining earlier pages", () => {
  assert.equal(channelPageHasMore(19_800, 100, 19_900, 19_900, true), true);
  assert.equal(channelPageHasMore(19_900, 100, 20_000, 20_000, true), false);
  assert.equal(channelPageHasMore(19_950, 100, 20_000, 20_000, true), false);
});

test("channel history pagination stops offering empty pages after raw invalid records exhaust the scan cap", () => {
  assert.equal(channelPageHasMore(0, 100, 500, 20_000, true), true);
  assert.equal(channelPageHasMore(400, 100, 500, 20_000, true), false);
  assert.equal(channelPageHasMore(500, 100, 500, 20_000, true), false);
});
