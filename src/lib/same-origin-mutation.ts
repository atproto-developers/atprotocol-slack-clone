import { NextResponse } from "next/server";
import { getConfig } from "./config";

export function rejectCrossOriginMutation(request: Request): NextResponse | null {
  if (request.headers.get("origin") === getConfig().appUrl.origin) return null;
  return NextResponse.json({ error: "Cross-origin requests are not allowed." }, {
    status: 403,
    headers: { "cache-control": "no-store" },
  });
}
