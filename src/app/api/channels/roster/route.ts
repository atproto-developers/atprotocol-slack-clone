import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/auth/session";
import { readPrivateChannelRoster } from "@/workspaces/channels";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const workspace = request.nextUrl.searchParams.get("workspace") ?? "";
    const skey = request.nextUrl.searchParams.get("skey") ?? "";
    const members = await readPrivateChannelRoster(session, workspace, skey);
    return NextResponse.json({ members }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read the private channel roster.";
    const status = message === "Unauthorized" ? 401 : error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 400;
    return NextResponse.json({ error: message.slice(0, 500) }, { status, headers: { "cache-control": "no-store" } });
  }
}
