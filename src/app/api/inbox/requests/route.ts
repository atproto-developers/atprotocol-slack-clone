import { NextResponse, type NextRequest } from "next/server";
import type * as ListRecords from "@/lexicons/api/types/com/atproto/space/listRecords";
import type * as GetRecord from "@/lexicons/api/types/com/atproto/space/getRecord";
import { assertBoundedRecordPage, listBoundedRepos } from "@/atproto/record-pages";
import { isMissingXrpcResource } from "@/atproto/xrpc";
import { requireSession } from "@/auth/session";
import { resolvePds } from "@/atproto/identity";
import { mintSpaceCredential } from "@/atproto/space-credential";
import { registerSpaceNotifications } from "@/atproto/notifications";
import { fetchInboxWriters } from "@/operator/client";
import { channelUri, decisionRecordKey, inboxUri, requestRecordKey, spaceRecordUri } from "@/protocol/keys";
import { validateSpaceRecord } from "@/protocol/records";
import { requireWorkspaceSummary, WorkspaceEnvelopeError, workspaceDegradedMessage } from "@/workspaces/read-model";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const workspace = request.nextUrl.searchParams.get("workspace") ?? "";
    const summary = await requireWorkspaceSummary(session, workspace);
    if (!summary.isAdmin) return NextResponse.json({ error: "Active workspace admin permission is required." }, { status: 403 });
    if (summary.degradedReasons.length > 0) {
      return NextResponse.json({ error: workspaceDegradedMessage(summary.degradedReasons) }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    const candidates = await fetchInboxWriters(session, workspace);
    const inbox = inboxUri(summary.authorityDid, summary.skey);
    const inboxCredential = await mintSpaceCredential(session, inbox);
    await registerSpaceNotifications(inboxCredential, inbox);
    const authorityClient = inboxCredential.client(await resolvePds(summary.authorityDid));
    const repoScan = await listBoundedRepos(authorityClient, { space: inbox, maxRepos: 2_000 });
    if (repoScan.truncated) throw new WorkspaceEnvelopeError("Inbox writer set exceeds the 2,000-repo scan limit; inbox results are incomplete.");
    const repos = repoScan.repos;
    const candidateDids = new Set([...candidates.writers, ...repos.map((repo) => repo.did)]);
    const privateChannels = new Set(summary.channels.filter((channel) => channel.visibility === "private").map((channel) => channel.skey));
    const requests = await mapLimited([...candidateDids], 8, async (repoDid) => {
      const client = inboxCredential.client(await resolvePds(repoDid));
      const page = await client.query<ListRecords.OutputSchema>("com.atproto.space.listRecords", {
        space: inbox, repo: repoDid, collection: "org.slack.joinRequest", limit: 101,
      }).catch((error) => {
        if (isMissingXrpcResource(error)) return { records: [], cursor: undefined };
        throw error;
      });
      try { assertBoundedRecordPage(page, { collection: "org.slack.joinRequest", limit: 101 }); }
      catch { throw new WorkspaceEnvelopeError("One inbox writer returned a malformed request page; inbox results are incomplete."); }
      if (page.records.length > 100 || page.cursor) throw new WorkspaceEnvelopeError("One inbox writer has more than 100 current request records; inbox results are incomplete.");
      return page.records.flatMap((record) => {
        const value = record.value;
        if (!value || typeof value.channelSkey !== "string" || !privateChannels.has(value.channelSkey)) return [];
        if (record.rkey !== requestRecordKey(channelUri(summary.authorityDid, value.channelSkey), repoDid)) return [];
        if (!validateSpaceRecord("org.slack.joinRequest", value, {
          authorityDid: summary.authorityDid, spaceUri: inbox, repoDid, rkey: record.rkey,
        }).valid) return [];
        const channel = summary.channels.find((entry) => entry.skey === value.channelSkey);
        return [{
          uri: spaceRecordUri(inbox, repoDid, "org.slack.joinRequest", record.rkey),
          repoDid,
          channelSkey: value.channelSkey,
          channelName: channel?.name ?? value.channelSkey,
          requestId: String(value.requestId),
          createdAt: String(value.createdAt),
        }];
      });
    });
    const currentRequests = await mapLimited(requests.flat(), 8, async (joinRequest) => {
      try {
        const rkey = decisionRecordKey(joinRequest.uri);
        const decision = await authorityClient.query<GetRecord.OutputSchema>("com.atproto.space.getRecord", {
          space: inbox, repo: summary.authorityDid, collection: "org.slack.joinDecision", rkey,
        });
        const valid = validateSpaceRecord("org.slack.joinDecision", decision.value, {
          authorityDid: summary.authorityDid, spaceUri: inbox, repoDid: summary.authorityDid, rkey,
        }).valid;
        return valid && decision.value.request === joinRequest.uri && decision.value.requestId === joinRequest.requestId
          ? null
          : joinRequest;
      } catch (error) {
        if (isMissingXrpcResource(error)) return joinRequest;
        throw error;
      }
    });
    return NextResponse.json({ requests: currentRequests.flatMap((joinRequest) => joinRequest ? [joinRequest] : []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync the admin inbox.";
    const status = message === "Unauthorized" ? 401 : error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 400;
    return NextResponse.json({ error: message.slice(0, 500) }, { status, headers: { "cache-control": "no-store" } });
  }
}

async function mapLimited<T, R>(items: T[], concurrency: number, action: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      result[current] = await action(items[current]);
    }
  }));
  return result;
}
