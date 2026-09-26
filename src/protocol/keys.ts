import { createHash, randomInt } from "node:crypto";

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const TID_BASE32 = "234567abcdefghijklmnopqrstuvwxyz";

export function isSkey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._~:-]{1,128}$/.test(value);
}

export function stableHash(value: string): string {
  const digest = createHash("sha256").update(value, "utf8").digest();
  return base32(digest);
}

export function recordKeyHash(value: string): string {
  return stableHash(value).split("").join(":");
}

export function subjectKey(did: string): string {
  return `d-${recordKeyHash(did)}`;
}

export function requestRecordKey(channelUri: string, requesterDid: string): string {
  return `r-${recordKeyHash(joinParts(channelUri, requesterDid))}`;
}

export function acceptanceRecordKey(workspaceUri: string): string {
  return `a-${recordKeyHash(workspaceUri)}`;
}

export function reactionRecordKey(messageUri: string, emoji: string, authorDid: string): string {
  return `x-${recordKeyHash(joinParts(messageUri, emoji, authorDid))}`;
}

export function decisionRecordKey(requestUri: string): string {
  return `q-${recordKeyHash(requestUri)}`;
}

export function workspaceUri(authorityDid: string, skey = "workspace"): string {
  return `at://${authorityDid}/space/org.slack.workspace/${skey}`;
}

export function inboxUri(authorityDid: string, skey = "workspace"): string {
  return `at://${authorityDid}/space/org.slack.inbox/${skey}`;
}

export function channelUri(authorityDid: string, skey: string): string {
  return `at://${authorityDid}/space/org.slack.channel/${skey}`;
}

export function spaceRecordUri(spaceUri: string, repoDid: string, collection: string, rkey: string): string {
  if (!/^at:\/\/did:[^/\s]+\/space\/[A-Za-z0-9.-]+\/[A-Za-z0-9._~:-]{1,128}$/.test(spaceUri) ||
    !/^did:[^/\s]+$/.test(repoDid) || !/^[A-Za-z0-9.-]+$/.test(collection) || !/^[A-Za-z0-9._~:-]+$/.test(rkey)) {
    throw new TypeError("Invalid space record URI components.");
  }
  return `${spaceUri}/${repoDid}/${collection}/${rkey}`;
}

export function parseSpaceRecordUri(
  uri: string,
  spaceUri: string,
  collection: string,
): { repo: string; rkey: string } | null {
  const prefix = `${spaceUri}/`;
  if (!uri.startsWith(prefix)) return null;
  const parts = uri.slice(prefix.length).split("/");
  if (parts.length !== 3 || parts[1] !== collection || !/^did:[^/\s]+$/.test(parts[0]) || !/^[A-Za-z0-9._~:-]+$/.test(parts[2])) return null;
  try {
    return spaceRecordUri(spaceUri, parts[0], collection, parts[2]) === uri
      ? { repo: parts[0], rkey: parts[2] }
      : null;
  } catch {
    return null;
  }
}

export function tidNow(nowMs = Date.now(), clockId = randomClockId()): string {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || clockId < 0 || clockId > 1023) {
    throw new RangeError("Invalid TID timestamp or clock identifier.");
  }
  let value = (BigInt(nowMs) * 1000n << 10n) | BigInt(clockId);
  let encoded = "";
  for (let index = 0; index < 13; index += 1) {
    encoded = TID_BASE32[Number(value & 31n)] + encoded;
    value >>= 5n;
  }
  return encoded;
}

export function canonicalJson(value: unknown): string {
  return canonicalValue(value);
}

export function requestDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function joinParts(...parts: string[]): string {
  return parts.join("\u0000");
}

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let accumulator = 0;
  let output = "";
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32[(accumulator >>> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32[(accumulator << (5 - bits)) & 31];
  return output;
}

function canonicalValue(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON cannot encode non-finite numbers.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError("Canonical JSON accepts only plain objects.");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => {
      if (record[key] === undefined) throw new TypeError("Canonical JSON cannot encode undefined values.");
      return `${JSON.stringify(key)}:${canonicalValue(record[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`Canonical JSON cannot encode ${typeof value}.`);
}

function randomClockId(): number {
  return randomInt(1024);
}
