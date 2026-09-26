import { createHash, randomBytes } from "node:crypto";
import type { JoseKey } from "@atproto/jwk-jose";

const SIGNING_ALGORITHM = "ES256";

export async function createSpaceDpopProof(
  key: JoseKey,
  options: { htm: string; htu: string; credential?: string },
): Promise<string> {
  const jwk = key.bareJwk;
  if (!jwk || !key.algorithms.includes(SIGNING_ALGORITHM)) {
    throw new Error("A space DPoP key must be an asymmetric ES256 key.");
  }
  const header = {
    alg: SIGNING_ALGORITHM,
    typ: "dpop+jwt",
    jwk,
  };
  const payload = {
    jti: randomBytes(16).toString("hex"),
    htm: options.htm,
    htu: normalizeHtu(options.htu),
    ...(options.credential
      ? { ath: createHash("sha256").update(options.credential).digest("base64url") }
      : {}),
    iat: Math.floor(Date.now() / 1000),
  };
  return key.createJwt(header, payload);
}

function normalizeHtu(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}
