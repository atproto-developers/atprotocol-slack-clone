import { NextResponse } from "next/server";
import { operatorHttpFailure } from "./errors";

export function stalledOperationsErrorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Unable to read stalled operator operations.";
  const upstreamFailure = operatorHttpFailure(error);
  if (upstreamFailure) {
    return NextResponse.json({ error: upstreamFailure.name, message: upstreamFailure.message }, {
      status: upstreamFailure.status,
      headers: { "cache-control": "no-store" },
    });
  }
  const status = message === "Unauthorized" ? 401 : error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 400;
  return NextResponse.json({ error: message.slice(0, 500) }, { status, headers: { "cache-control": "no-store" } });
}
