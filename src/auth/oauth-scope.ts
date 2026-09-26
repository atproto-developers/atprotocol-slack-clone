import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
export const MAX_OAUTH_SCOPE_BYTES = 128 * 1024;
const MAX_SCOPE_DESCRIPTOR_CHARS = 4096;
const SCOPE_DESCRIPTOR_PATTERN = /^[A-Za-z0-9_-]{1,4096}$/;

export function canonicalOAuthScope(scopes: string | readonly string[]): string {
  const sourceBytes = typeof scopes === "string"
    ? Buffer.byteLength(scopes, "utf8")
    : scopes.reduce((total, scope) => total + Buffer.byteLength(scope, "utf8") + 1, 0);
  if (sourceBytes > MAX_OAUTH_SCOPE_BYTES) throw new Error("OAuth scope is too large.");
  const items: readonly string[] = typeof scopes === "string" ? scopes.split(" ") : scopes;
  const tokens = items
    .flatMap((scope) => scope.split(" "))
    .filter(Boolean);
  if (!tokens.length || tokens.some((scope) => !SCOPE_TOKEN.test(scope))) {
    throw new Error("Invalid OAuth scope.");
  }
  const canonical = [...new Set(tokens)].sort().join(" ");
  if (!canonical.split(" ").includes("atproto")) throw new Error('OAuth scope must include "atproto".');
  if (Buffer.byteLength(canonical, "utf8") > MAX_OAUTH_SCOPE_BYTES) throw new Error("OAuth scope is too large.");
  return canonical;
}

export function encodeOAuthScopeDescriptor(scope: string, key: Buffer): { scope: string; signature: string } {
  const canonical = canonicalOAuthScope(scope);
  if (canonical !== scope) throw new Error("OAuth scope is not canonical.");
  const descriptor = deflateRawSync(Buffer.from(scope, "utf8")).toString("base64url");
  if (descriptor.length > MAX_SCOPE_DESCRIPTOR_CHARS) throw new Error("OAuth scope descriptor is too large.");
  return { scope: descriptor, signature: sign(scope, key) };
}

export function decodeOAuthScopeDescriptor(scopeDescriptor: string, signature: string, key: Buffer): string | null {
  if (!SCOPE_DESCRIPTOR_PATTERN.test(scopeDescriptor) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  try {
    const decoded = inflateRawSync(Buffer.from(scopeDescriptor, "base64url"), { maxOutputLength: MAX_OAUTH_SCOPE_BYTES }).toString("utf8");
    if (canonicalOAuthScope(decoded) !== decoded) return null;
    const expected = Buffer.from(sign(decoded, key));
    const actual = Buffer.from(signature);
    return actual.length === expected.length && timingSafeEqual(actual, expected) ? decoded : null;
  } catch {
    return null;
  }
}

function sign(scope: string, key: Buffer): string {
  return createHmac("sha256", key).update("oauth-client-scope\0").update(scope).digest("base64url");
}
