import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/auth/session";
import { fetchInboxWriters, operatorRemoteHttpStatus } from "@/operator/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const workspace = request.nextUrl.searchParams.get("workspace") ?? "";
    const result = await fetchInboxWriters(session, workspace);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch inbox writers.";
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : operatorRemoteHttpStatus(error) ?? 400;
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
