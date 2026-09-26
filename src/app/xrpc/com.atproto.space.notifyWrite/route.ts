import { NextResponse, type NextRequest } from "next/server";
import { authenticateOperatorRequest, OperatorAuthError } from "@/operator/security";
import { parseSpaceAuthority } from "@/atproto/notifications";
import { getRawDb } from "@/lib/db";
import { readRequestJson, RequestJsonError } from "@/lib/bounded-json";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const issuer = await authenticateOperatorRequest(request, "com.atproto.space.notifyWrite");
    const body = await readRequestJson<Record<string, unknown>>(request, 8 * 1024);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["space", "repo", "rev", "hash"].includes(key))) {
      return xrpcError(400, "InvalidRequest", "Unexpected notification fields.");
    }
    if (typeof body.space !== "string" || typeof body.repo !== "string" || !/^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(body.repo) ||
      typeof body.rev !== "string" || body.rev.length < 1 || body.rev.length > 128 ||
      typeof body.hash !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(body.hash)) {
      return xrpcError(400, "InvalidRequest", "Invalid space write notification.");
    }
    const authorityDid = parseSpaceAuthority(body.space);
    if (issuer !== authorityDid) return xrpcError(403, "Unauthorized", "Notification issuer is not the space authority.");
    const now = Math.floor(Date.now() / 1000);
    const db = getRawDb();
    db.prepare("INSERT INTO space_notification (space_uri,repo_did,rev,notified_at) VALUES (?,?,?,?)")
      .run(body.space, body.repo, body.rev, now);
    db.prepare("UPDATE space_collection_cursor SET checked_at=0 WHERE space_uri=? AND repo_did=?")
      .run(body.space, body.repo);
    db.prepare("DELETE FROM space_notification WHERE notified_at < ?").run(now - 7 * 24 * 60 * 60);
    return NextResponse.json({}, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notification rejected.";
    if (error instanceof OperatorAuthError) return xrpcError(403, "Unauthorized", message);
    if (error instanceof RequestJsonError) return xrpcError(error.status, "InvalidRequest", message);
    return xrpcError(400, "InvalidRequest", message);
  }
}

function xrpcError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message: message.slice(0, 500) }, { status, headers: { "cache-control": "no-store" } });
}
