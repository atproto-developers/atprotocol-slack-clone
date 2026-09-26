import assert from "node:assert/strict";
import test from "node:test";
import { securityHeaderRule } from "./security-headers";

test("all app routes receive browser security headers", () => {
  assert.equal(securityHeaderRule.source, "/:path*");
  const headers = new Map(securityHeaderRule.headers.map(({ key, value }) => [key.toLowerCase(), value]));

  assert.match(headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.match(headers.get("content-security-policy") ?? "", /object-src 'none'/);
  assert.match(headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(headers.get("content-security-policy") ?? "", /style-src[^;]*https:\/\/fonts\.googleapis\.com/);
  assert.match(headers.get("content-security-policy") ?? "", /font-src[^;]*https:\/\/fonts\.gstatic\.com/);
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("strict-transport-security"), "max-age=31536000");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
});
