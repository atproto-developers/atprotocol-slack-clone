import { NextResponse, type NextRequest } from "next/server";
import { getOAuthClient, oauthScopeFromMetadataParams } from "@/auth/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const scope = oauthScopeFromMetadataParams(request.nextUrl.searchParams);
    return NextResponse.json((scope ? getOAuthClient(scope) : getOAuthClient()).clientMetadata, {
      headers: { "cache-control": "public, max-age=300" },
    });
  } catch {
    return NextResponse.json({ error: "Invalid OAuth client metadata descriptor." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
