import assert from "node:assert/strict";
import test from "node:test";
import { TokenRefreshError } from "@atproto/oauth-client-node";
import { stalledOperationsErrorResponse } from "@/operator/stalled-route-error";

test("stalled operation route returns the classified authority-session error without raw details", async () => {
  const response = stalledOperationsErrorResponse(new TokenRefreshError("did:plc:authority", "secret session token was rejected"));

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "AuthoritySessionUnavailable",
    message: "The workspace authority session was rejected and must be reauthorized.",
  });
});
