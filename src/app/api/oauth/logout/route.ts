import { NextResponse, type NextRequest } from "next/server";
import { getOAuthClientForSession } from "@/auth/oauth";
import { deleteWebSession, resolveWebSession, WEB_SESSION_COOKIE } from "@/auth/web-session";
import { rejectCrossOriginMutation } from "@/lib/same-origin-mutation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const token = request.cookies.get(WEB_SESSION_COOKIE)?.value;
  if (token) {
    const did = await resolveWebSession(token);
    if (did) await getOAuthClientForSession(did).then((client) => client.restore(did)).then((session) => session.signOut()).catch(() => undefined);
    await deleteWebSession(token);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(WEB_SESSION_COOKIE);
  return response;
}
