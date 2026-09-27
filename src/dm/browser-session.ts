import type { OAuthSession } from "@atproto/oauth-client-browser";
import { buildDmClientMetadata } from "./client-metadata";
import { AtprotoClient } from "@/atproto/xrpc";

export type DmConfig = { appUrl: string; plcUrl: string; scope: string };

export class DmAccountMismatchError extends Error {
  constructor() {
    super("The direct-message session belongs to a different account than the signed-in session.");
    this.name = "DmAccountMismatchError";
  }
}

async function loadDmClient(config: DmConfig) {
  const { BrowserOAuthClient } = await import("@atproto/oauth-client-browser");
  const metadata = buildDmClientMetadata({ appUrl: config.appUrl, scope: config.scope });
  return BrowserOAuthClient.load({
    clientId: metadata.client_id,
    plcDirectoryUrl: config.plcUrl,
    allowHttp: new URL(config.appUrl).protocol === "http:",
  });
}

/** Redirects the browser to the user's PDS to authorize the DM scope set. Never returns normally. */
export async function connectDms(did: string, config: DmConfig): Promise<void> {
  const client = await loadDmClient(config);
  await client.signInRedirect(did);
}

/**
 * Restores an existing DM session (from IndexedDB) or, on the OAuth callback
 * page, completes the redirect and returns the freshly issued session. Either
 * way, a session for a DID other than `expectedDid` is revoked and rejected,
 * so one browser profile can never hold DM permissions for a different
 * account than the one the server session is signed in as.
 */
export async function restoreDmSession(expectedDid: string, config: DmConfig): Promise<OAuthSession | null> {
  const client = await loadDmClient(config);
  const result = await client.init();
  if (!result) return null;
  if (result.session.did !== expectedDid) {
    await client.revoke(result.session.sub);
    throw new DmAccountMismatchError();
  }
  return result.session;
}

export async function disconnectDms(config: DmConfig): Promise<void> {
  const client = await loadDmClient(config);
  const result = await client.initRestore();
  if (result) await client.revoke(result.session.sub);
}

export function dmXrpcClient(session: OAuthSession): AtprotoClient {
  return new AtprotoClient((path, init) => session.fetchHandler(path, init));
}
