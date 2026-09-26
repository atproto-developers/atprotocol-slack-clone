import assert from "node:assert/strict";
import test from "node:test";
import { OAuthRequestLockError } from "./oauth-request-lock";
import { classifyOAuthRouteError } from "./oauth-route-error";

test("OAuth route errors distinguish transient failures from invalid requests", () => {
  assert.deepEqual(classifyOAuthRouteError(new OAuthRequestLockError("busy"), "Fallback."), {
    message: "OAuth is temporarily unavailable. Please try again shortly.",
    status: 503,
    retryAfterSeconds: 5,
  });
  assert.deepEqual(classifyOAuthRouteError(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }), "Fallback."), {
    message: "OAuth is temporarily unavailable. Please try again shortly.",
    status: 503,
    retryAfterSeconds: 5,
  });
  assert.deepEqual(classifyOAuthRouteError({ status: 429 }, "Fallback."), {
    message: "OAuth is temporarily unavailable. Please try again shortly.",
    status: 503,
    retryAfterSeconds: 5,
  });
  assert.deepEqual(classifyOAuthRouteError(new Error("Invalid handle."), "Fallback."), {
    message: "Invalid handle.",
    status: 400,
  });
});
