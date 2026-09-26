import { type NextRequest } from "next/server";
import { listInboxWriters } from "@/operator/operations";
import { withOperatorActor } from "@/operator/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const workspace = request.nextUrl.searchParams.get("workspace") ?? "";
  return withOperatorActor(request, "org.slack.operator.listInboxWriters", workspace, listInboxWriters);
}
