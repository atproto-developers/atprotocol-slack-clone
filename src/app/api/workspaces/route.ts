import { NextResponse } from "next/server";
import { requireSession } from "@/auth/session";
import { isTransientOAuthInfrastructureError } from "@/auth/oauth-request-lock";
import { UpstreamResponseTooLargeError } from "@/lib/bounded-json";
import { discoverWorkspaceState } from "@/workspaces/read-model";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();
    return NextResponse.json(await discoverWorkspaceState(session), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to discover workspaces.";
    const status = message === "Unauthorized" ? 401 : error instanceof UpstreamResponseTooLargeError ? 502 :
      isTransientOAuthInfrastructureError(error) ? 503 :
        error && typeof error === "object" && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status <= 599
          ? error.status : 400;
    const safeMessage = status === 503 ? "A required identity or PDS service is temporarily unavailable." : message;
    return NextResponse.json({ error: safeMessage }, { status, headers: { "cache-control": "no-store" } });
  }
}
