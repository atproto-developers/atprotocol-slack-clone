import type * as GetDelegationToken from "@/lexicons/api/types/com/atproto/space/getDelegationToken";
import { readUpstreamJson } from "@/lib/bounded-json";
import { parseSpaceUri } from "@/protocol/keys";
import { createSpaceDpopProof, type DpopKey } from "./dpop";
import { AtprotoClient } from "./xrpc";

const CREDENTIAL_LIFETIME_MS = 2 * 60 * 60 * 1000;
const GET_SPACE_CREDENTIAL = "/xrpc/com.atproto.space.getSpaceCredential";

export type SpaceCredentialDeps = {
  memberClient: AtprotoClient;
  resolvePds(did: string): Promise<string>;
  fetchEndpoint(request: Request): Promise<Response>;
  generateKey(): Promise<DpopKey>;
};

export class SpaceCredentialError extends Error {
  constructor(message: string, readonly status: 401 | 403) {
    super(message);
    this.name = "SpaceCredentialError";
  }
}

export class SpaceCredential {
  readonly expiresAt: number;

  constructor(
    readonly space: string,
    readonly token: string,
    readonly key: DpopKey,
    private readonly fetchEndpoint: (request: Request) => Promise<Response>,
    expiresAt = Date.now() + CREDENTIAL_LIFETIME_MS,
  ) {
    this.expiresAt = expiresAt;
  }

  client(service: string | URL): AtprotoClient {
    const token = this.token;
    const key = this.key;
    const fetchEndpoint = this.fetchEndpoint;
    const base = service instanceof URL ? service : new URL(service);
    return new AtprotoClient(async (path, init) => {
      const request = new Request(new URL(path, base), { ...init, redirect: "error" });
      request.headers.set("authorization", `DPoP ${token}`);
      request.headers.set(
        "dpop",
        await createSpaceDpopProof(key, {
          htm: request.method,
          htu: request.url,
          credential: token,
        }),
      );
      return fetchEndpoint(request);
    });
  }
}

export async function mintSpaceCredentialWith(deps: SpaceCredentialDeps, space: string): Promise<SpaceCredential> {
  const parsed = parseSpaceUri(space);
  if (!parsed) throw new Error("Invalid permissioned space URI.");
  const delegation = await deps.memberClient.query<GetDelegationToken.OutputSchema>(
    "com.atproto.space.getDelegationToken",
    { space },
  );
  const authorityPds = await deps.resolvePds(parsed.authorityDid);
  const key = await deps.generateKey();
  const token = await exchangeSpaceCredential({
    authorityPds,
    delegationToken: delegation.token,
    space,
    key,
    fetchEndpoint: deps.fetchEndpoint,
  });
  return new SpaceCredential(space, token, key, deps.fetchEndpoint);
}

export async function exchangeSpaceCredential(input: {
  authorityPds: string;
  delegationToken: string;
  space: string;
  key: DpopKey;
  fetchEndpoint: (request: Request) => Promise<Response>;
}): Promise<string> {
  const endpoint = new URL(GET_SPACE_CREDENTIAL, input.authorityPds);
  const request = new Request(endpoint, {
    method: "POST",
    redirect: "error",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.delegationToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ space: input.space }),
  });
  request.headers.set(
    "dpop",
    await createSpaceDpopProof(input.key, { htm: "POST", htu: endpoint.toString() }),
  );
  const response = await input.fetchEndpoint(request);
  const body = await readUpstreamJson<{ credential?: unknown; message?: unknown; error?: unknown }>(response, 64 * 1024);
  if (!response.ok || typeof body?.credential !== "string" || body.credential.length === 0) {
    const message = typeof body?.message === "string" ? body.message : `Space credential exchange failed (${response.status}).`;
    // The pinned PDS reports a validly authenticated non-member as HTTP 400
    // with the protocol-specific UserNotAuthorized error code. Normalize that
    // authorization denial so routes clear access-bound caches consistently.
    if (response.status === 401 || response.status === 403 || (response.status === 400 && body?.error === "UserNotAuthorized")) {
      throw new SpaceCredentialError(message, response.status === 401 ? 401 : 403);
    }
    throw new Error(message);
  }
  return body.credential;
}
