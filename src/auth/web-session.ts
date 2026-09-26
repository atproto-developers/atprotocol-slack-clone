import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, getRawDb } from "@/lib/db";
import { getConfig } from "@/lib/config";

export const WEB_SESSION_COOKIE = "spaces_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export async function createWebSession(did: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  await getDb()
    .insertInto("web_session")
    .values({ token_hash: hashToken(token), did, created_at: now, expires_at: now + SESSION_SECONDS })
    .execute();
  return token;
}

export async function resolveWebSession(token: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = getRawDb()
    .prepare("SELECT did, expires_at FROM web_session WHERE token_hash = ?")
    .get(hashToken(token)) as { did: string; expires_at: number } | undefined;
  if (!row || row.expires_at <= now) {
    await deleteWebSession(token);
    return null;
  }
  return row.did;
}

export async function deleteWebSession(token: string): Promise<void> {
  await getDb().deleteFrom("web_session").where("token_hash", "=", hashToken(token)).execute();
}

export async function setWebSessionCookie(token: string): Promise<void> {
  const { appUrl } = getConfig();
  const store = await cookies();
  store.set(WEB_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: appUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearWebSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(WEB_SESSION_COOKIE);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
