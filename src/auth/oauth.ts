import { isIP } from "node:net";
import { NodeOAuthClient, type NodeSavedSession, type NodeSavedState } from "@atproto/oauth-client-node";
import { fetchValidatedEndpoint } from "@/atproto/identity";
import { getConfig } from "@/lib/config";
import { oauthSqliteStore } from "./encrypted-store";
import { oauthSqliteRequestLock } from "./oauth-request-lock";
import { canonicalOAuthScope, decodeOAuthScopeDescriptor, encodeOAuthScopeDescriptor } from "./oauth-scope";
import { trackOAuthStateStore, type OAuthFlowClient } from "./oauth-flow";

type ScopedSavedSession = NodeSavedSession & { oauthClientScope?: string };
type ScopedSavedState = NodeSavedState & { oauthClientScope?: string };
type Store<T> = {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
};

const MAX_CACHED_OAUTH_CLIENTS = 64;
const MAX_LOOPBACK_CLIENT_ID_BYTES = 256 * 1024;
const oauthClients = new Map<string, OAuthFlowClient & NodeOAuthClient>();
let savedStateStore: Store<ScopedSavedState> | undefined;
let savedSessionStore: Store<ScopedSavedSession> | undefined;

export function getOAuthClient(scope?: string): OAuthFlowClient & NodeOAuthClient {
  const canonicalScope = scope === undefined ? undefined : canonicalOAuthScope(scope);
  const cacheKey = canonicalScope ?? "legacy";
  const existing = takeCachedOAuthClient(cacheKey);
  if (existing) return existing;

  const { appUrl, plcDirectoryUrl, encryptionKey } = getConfig();
  const origin = appUrl.toString().replace(/\/$/, "");
  const loopbackRedirectUri = new URL(appUrl);
  if (isLoopbackHostname(appUrl.hostname) && loopbackRedirectUri.protocol === "http:") {
    loopbackRedirectUri.hostname = "127.0.0.1";
  }
  const redirectUri = `${loopbackRedirectUri.origin}/oauth/callback`;
  const loopbackClient = loopbackRedirectUri.protocol === "http:" && isLoopbackHostname(appUrl.hostname);
  const clientId = canonicalScope === undefined
    ? (loopbackClient
        ? `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}`
        : `${origin}/oauth/client-metadata.json`)
    : buildScopedClientId(origin, redirectUri, loopbackClient, canonicalScope, encryptionKey);
  const stateStore = createTrackedStateStore(canonicalScope);
  const client = new NodeOAuthClient({
    clientMetadata: {
      client_id: clientId,
      client_name: "Spaces",
      ...(loopbackClient ? {} : { client_uri: origin }),
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      scope: canonicalScope ?? "atproto",
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: loopbackClient ? "native" : "web",
      dpop_bound_access_tokens: true,
    },
    fetch: fetchValidatedEndpoint,
    requestLock: oauthSqliteRequestLock,
    allowHttp: appUrl.protocol === "http:",
    plcDirectoryUrl,
    stateStore: stateStore.store,
    sessionStore: scopedSessionStore(canonicalScope),
  });
  const flowClient = Object.assign(client, {
    takeProtocolStateForAppState: stateStore.takeProtocolStateForAppState,
  });
  cacheOAuthClient(cacheKey, flowClient);
  return flowClient;
}

export async function getOAuthClientForSession(did: string): Promise<OAuthFlowClient & NodeOAuthClient> {
  const saved = await getSavedSessionStore().get(did);
  return saved?.oauthClientScope ? getOAuthClient(saved.oauthClientScope) : getOAuthClient();
}

export async function getOAuthClientForState(state: string, expectedAppState: string): Promise<OAuthFlowClient & NodeOAuthClient> {
  const saved = await getSavedStateStore().get(state);
  if (!saved || saved.appState !== expectedAppState) throw new Error("OAuth callback state is missing or mismatched.");
  return saved.oauthClientScope ? getOAuthClient(saved.oauthClientScope) : getOAuthClient();
}

export function oauthScopeFromMetadataParams(params: URLSearchParams): string | null {
  const descriptors = params.getAll("scope");
  const signatures = params.getAll("signature");
  if (!descriptors.length && !signatures.length) return null;
  if (descriptors.length !== 1 || signatures.length !== 1 || [...params.keys()].some((key) => key !== "scope" && key !== "signature")) {
    throw new Error("Invalid OAuth client metadata descriptor.");
  }
  const scope = decodeOAuthScopeDescriptor(descriptors[0], signatures[0], getConfig().encryptionKey);
  if (!scope) throw new Error("Invalid OAuth client metadata descriptor.");
  return scope;
}

function buildScopedClientId(origin: string, redirectUri: string, loopback: boolean, scope: string, key: Buffer): string {
  if (loopback) {
    const parameters = new URLSearchParams();
    parameters.set("scope", scope);
    parameters.set("redirect_uri", redirectUri);
    const clientId = `http://localhost?${parameters.toString()}`;
    if (Buffer.byteLength(clientId, "utf8") > MAX_LOOPBACK_CLIENT_ID_BYTES) throw new Error("OAuth loopback client ID is too large.");
    return clientId;
  }
  const descriptor = encodeOAuthScopeDescriptor(scope, key);
  const clientId = new URL("/oauth/client-metadata.json", origin);
  clientId.searchParams.set("scope", descriptor.scope);
  clientId.searchParams.set("signature", descriptor.signature);
  return clientId.toString();
}

function createTrackedStateStore(scope: string | undefined): ReturnType<typeof trackOAuthStateStore<ScopedSavedState>> {
  const store = getSavedStateStore();
  return trackOAuthStateStore<ScopedSavedState>({
    get: (key) => store.get(key),
    async set(key, value) {
      await store.set(key, { ...value, ...(scope ? { oauthClientScope: scope } : {}) });
    },
    del: (key) => store.del(key),
  });
}

function takeCachedOAuthClient(key: string): (OAuthFlowClient & NodeOAuthClient) | undefined {
  const client = oauthClients.get(key);
  if (!client) return undefined;
  oauthClients.delete(key);
  oauthClients.set(key, client);
  return client;
}

function cacheOAuthClient(key: string, client: OAuthFlowClient & NodeOAuthClient): void {
  oauthClients.delete(key);
  oauthClients.set(key, client);
  while (oauthClients.size > MAX_CACHED_OAUTH_CLIENTS) {
    const oldest = oauthClients.keys().next().value;
    if (oldest === undefined) return;
    oauthClients.delete(oldest);
  }
}

function getSavedStateStore(): Store<ScopedSavedState> {
  if (!savedStateStore) savedStateStore = oauthSqliteStore<ScopedSavedState>("oauth_state");
  return savedStateStore;
}

function getSavedSessionStore(): Store<ScopedSavedSession> {
  if (!savedSessionStore) savedSessionStore = oauthSqliteStore<ScopedSavedSession>("oauth_session");
  return savedSessionStore;
}

function scopedSessionStore(scope: string | undefined): Store<NodeSavedSession> {
  const store = getSavedSessionStore();
  return {
    get: (key) => store.get(key),
    async set(key, value) {
      const existing = await store.get(key);
      const savedScope = scope ?? existing?.oauthClientScope;
      await store.set(key, { ...value, ...(savedScope ? { oauthClientScope: savedScope } : {}) });
    },
    del: (key) => store.del(key),
  };
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "::1" || (isIP(normalized) === 4 && normalized.startsWith("127."));
}
