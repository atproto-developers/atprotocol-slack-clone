import assert from "node:assert/strict";
import test from "node:test";
import { AtprotoClient, isMissingXrpcResource } from "./xrpc";

test("XRPC missing-record errors retain their lexicon error code", async () => {
  const client = new AtprotoClient(async () => Response.json({ error: "RecordNotFound", message: "Missing record." }, { status: 400 }));
  await assert.rejects(client.query("com.atproto.space.getRecord"), (error: unknown) => {
    assert.equal(isMissingXrpcResource(error), true);
    return true;
  });
});

test("XRPC authorization and server errors are not treated as missing records", async () => {
  const client = new AtprotoClient(async () => Response.json({ error: "Unauthorized", message: "Denied." }, { status: 401 }));
  await assert.rejects(client.query("com.atproto.space.getRecord"), (error: unknown) => {
    assert.equal(isMissingXrpcResource(error), false);
    return true;
  });
});
