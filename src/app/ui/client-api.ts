export type Message = { uri: string; rkey: string; repo: string; value: { text?: string; createdAt?: string; parent?: string }; reactions?: Array<{ emoji: string; count: number; active: boolean }> };
export type Reaction = { repo: string; value: { subject?: string; emoji?: string } };
export type InboxRequest = { uri: string; repoDid: string; channelSkey: string; channelName: string; requestId: string; createdAt: string };
export type ChannelSelection = { workspace: string; skey: string; name: string; visibility: string };
export type PendingOperation = { workspace: string; operationId: string; request: Record<string, unknown> };
export type StalledOperation = { actor: string; operationId: string; state: string; error: string | null; updatedAt: string };
export type RunOperation = (request: Record<string, unknown>, workspace?: string, operationId?: string) => Promise<void>;
export type Grant = (action: string, workspaceUri?: string, skey?: string) => Promise<void>;

export const TRANSITIONING_STATUS = "This channel is transitioning. Sync and posting are paused until its access changes finish.";

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers }, cache: "no-store" });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new ApiError(response.status, body && typeof body.error === "string" ? body.error : `Request failed (${response.status}).`);
  return body as T;
}

export class ApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export function httpStatus(error: unknown): number | undefined { return error instanceof ApiError ? error.status : undefined; }
export function isAccessFailure(error: unknown): boolean { return [401, 403, 409].includes(httpStatus(error) ?? 0); }
export function messageOf(error: unknown): string { return error instanceof Error ? error.message : "Request failed."; }

export function parseWorkspaceUri(uri: string): { authorityDid: string; skey: string } | null {
  const match = /^at:\/\/(did:[^/]+)\/space\/org\.slack\.workspace\/([A-Za-z0-9._~:-]{1,128})$/.exec(uri.trim());
  return match ? { authorityDid: match[1], skey: match[2] } : null;
}

export function withReactions(messages: Array<Omit<Message, "reactions">>, reactions: Reaction[], viewerDid: string): Message[] {
  const grouped = new Map<string, Map<string, { count: number; active: boolean }>>();
  for (const reaction of reactions) {
    if (typeof reaction.value.subject !== "string" || typeof reaction.value.emoji !== "string") continue;
    const emojis = grouped.get(reaction.value.subject) ?? new Map<string, { count: number; active: boolean }>();
    const current = emojis.get(reaction.value.emoji) ?? { count: 0, active: false };
    current.count += 1;
    if (reaction.repo === viewerDid) current.active = true;
    emojis.set(reaction.value.emoji, current);
    grouped.set(reaction.value.subject, emojis);
  }
  return messages.map((message) => ({
    ...message,
    reactions: [...(grouped.get(message.uri) ?? new Map()).entries()].map(([emoji, value]) => ({ emoji, ...value })),
  }));
}

export function mergeMessages(current: Message[], incoming: Message[], append: boolean): Message[] {
  const combined = append ? [...current, ...incoming] : incoming;
  const unique = new Map(combined.map((message) => [message.uri, message]));
  return [...unique.values()].sort((a, b) => b.rkey.localeCompare(a.rkey));
}

export function splitDids(value: string): string[] { return value.split(/[\s,]+/).filter(Boolean); }

export function makeTid(): string {
  const random = new Uint16Array(1);
  crypto.getRandomValues(random);
  let value = (BigInt(Date.now()) * 1000n << 10n) | BigInt(random[0] & 1023);
  const alphabet = "234567abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let index = 0; index < 13; index += 1) { result = alphabet[Number(value & 31n)] + result; value >>= 5n; }
  return result;
}
export function makeShortId(): string { return makeTid().slice(-5); }
export function toSlug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "channel"; }
