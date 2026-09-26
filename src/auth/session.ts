import type { OAuthSession } from "@atproto/oauth-client-node";
import { cookies } from "next/headers";
import { getOAuthClientForSession } from "./oauth";
import { isTransientOAuthInfrastructureError } from "./oauth-request-lock";
import { deleteWebSession, resolveWebSession, WEB_SESSION_COOKIE } from "./web-session";

export async function getSession(): Promise<OAuthSession | null> {
  const token = (await cookies()).get(WEB_SESSION_COOKIE)?.value;
  if (!token) return null;
  const did = await resolveWebSession(token);
  if (!did) return null;
  try {
    const session = await (await getOAuthClientForSession(did)).restore(did);
    if (session.did !== did) throw new Error("OAuth session subject mismatch.");
    return session;
  } catch (error) {
    // A failed shared lock or SQLite operation is temporary infrastructure
    // trouble. Surface it and keep the browser session so a later request can
    // restore it. Authentication failures still invalidate the web session.
    if (isTransientOAuthInfrastructureError(error)) throw error;
    await deleteWebSession(token);
    return null;
  }
}

export async function requireSession(): Promise<OAuthSession> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}
