import {
  acceptanceRecordKey,
  channelUri,
  decisionRecordKey,
  isSkey,
  parseSpaceRecordUri,
  reactionRecordKey,
  requestRecordKey,
  subjectKey,
} from "./keys";

export type RecordValidation = { valid: true } | { valid: false; reason: string };

export type RecordContext = {
  authorityDid: string;
  spaceUri: string;
  repoDid: string;
  rkey: string;
  knownTopLevelMessages?: ReadonlySet<string>;
  knownMessages?: ReadonlySet<string>;
};

const AUTHORITY_COLLECTIONS = new Set([
  "org.slack.directory",
  "org.slack.workspace.profile",
  "org.slack.workspace.roster",
  "org.slack.admin",
  "org.slack.joinDecision",
  "org.slack.channel.roster",
]);

export function validateSpaceRecord(collection: string, value: unknown, context: RecordContext): RecordValidation {
  if (!isPlainObject(value)) return invalid("record must be an object");
  if (value.$type !== undefined && value.$type !== collection) return invalid("record type does not match its collection");
  const expectedSpaceType = collectionSpaceType(collection);
  if (!expectedSpaceType || !context.spaceUri.includes(`/space/${expectedSpaceType}/`)) {
    return invalid("collection does not belong to this space type");
  }
  if (AUTHORITY_COLLECTIONS.has(collection) && context.repoDid !== context.authorityDid) {
    return invalid("authority record has the wrong author");
  }

  const record = { ...value };
  delete record.$type;

  switch (collection) {
    case "org.slack.workspace.profile":
      return validateProfile(record, context);
    case "org.slack.directory":
      return validateDirectory(record, context);
    case "org.slack.workspace.roster":
    case "org.slack.admin":
    case "org.slack.channel.roster":
      return validateRoster(record, context);
    case "org.slack.acceptance":
      return validateAcceptance(record, context);
    case "org.slack.joinRequest":
      return validateJoinRequest(record, context);
    case "org.slack.joinDecision":
      return validateJoinDecision(record, context);
    case "org.slack.channel.message":
      return validateMessage(record, context);
    case "org.slack.channel.reaction":
      return validateReaction(record, context);
    default:
      return invalid("unknown collection");
  }
}

export function validateMessageParent(
  parentUri: string,
  spaceUri: string,
  knownTopLevelMessages: ReadonlySet<string>,
  knownMessages: ReadonlySet<string>,
): RecordValidation {
  if (!parseSpaceRecordUri(parentUri, spaceUri, "org.slack.channel.message")) return invalid("parent must be a canonical message URI in this channel");
  if (!knownMessages.has(parentUri)) return invalid("parent message is not in this channel");
  if (!knownTopLevelMessages.has(parentUri)) return invalid("nested replies are not supported");
  return { valid: true };
}

function validateDirectory(record: Record<string, unknown>, context: RecordContext): RecordValidation {
  if (!hasOnly(record, ["skey", "name", "visibility"])) return invalid("directory record has unknown fields");
  if (!isSkey(record.skey) || context.rkey !== record.skey) return invalid("directory key must equal skey");
  if (!boundedString(record.name, 1, 80)) return invalid("channel name must contain 1 to 80 characters");
  if (!oneOf(record.visibility, ["public", "private", "transitioning", "archived"])) return invalid("invalid channel visibility");
  return { valid: true };
}

function validateProfile(record: Record<string, unknown>, context: RecordContext): RecordValidation {
  if (!hasOnly(record, ["name", "createdAt"])) return invalid("workspace profile has unknown fields");
  if (context.rkey !== "self" || !boundedString(record.name, 1, 80) || !isDatetime(record.createdAt)) return invalid("invalid workspace profile");
  return { valid: true };
}

function validateRoster(record: Record<string, unknown>, context: RecordContext): RecordValidation {
  if (!hasOnly(record, ["subject", "active", "updatedAt"])) return invalid("roster record has unknown fields");
  if (!isDid(record.subject) || context.rkey !== subjectKey(record.subject)) return invalid("roster key must equal the subject hash");
  if (typeof record.active !== "boolean" || !isDatetime(record.updatedAt)) return invalid("invalid roster state");
  if (context.spaceUri.includes("/space/org.slack.channel/") && context.repoDid !== context.authorityDid) {
    return invalid("private roster must be authored by the workspace authority");
  }
  return { valid: true };
}

function validateAcceptance(record: Record<string, unknown>, context: RecordContext): RecordValidation {
  if (!hasOnly(record, ["workspace", "createdAt"])) return invalid("acceptance record has unknown fields");
  if (!isSpaceUri(record.workspace, "org.slack.workspace") || context.rkey !== acceptanceRecordKey(record.workspace)) return invalid("acceptance key must match its workspace");
  if (!isDatetime(record.createdAt)) return invalid("invalid acceptance timestamp");
  return { valid: true };
}

function validateJoinRequest(record: Record<string, unknown>, context: RecordContext): RecordValidation {
  if (!hasOnly(record, ["channelSkey", "requestId", "createdAt"])) return invalid("join request has unknown fields");
  if (!isSkey(record.channelSkey) || !isTid(record.requestId) || !isDatetime(record.createdAt)) return invalid("invalid join request fields");
  const channel = channelUri(context.authorityDid, record.channelSkey);
  if (context.rkey !== requestRecordKey(channel, context.repoDid)) return invalid("join request key is not canonical");
  return { valid: true };
}

function validateJoinDecision(record: Record<string, unknown>, context: RecordContext): RecordValidation {
  if (!hasOnly(record, ["request", "requestId", "decision", "updatedAt"])) return invalid("join decision has unknown fields");
  const request = typeof record.request === "string" ? parseSpaceRecordUri(record.request, context.spaceUri, "org.slack.joinRequest") : null;
  if (!request || request.repo === context.authorityDid || context.rkey !== decisionRecordKey(record.request as string)) return invalid("join decision key must match a canonical request in this inbox");
  if (!isTid(record.requestId) || !oneOf(record.decision, ["approve", "deny"]) || !isDatetime(record.updatedAt)) return invalid("invalid join decision fields");
  return { valid: true };
}

function validateMessage(record: Record<string, unknown>, context: RecordContext): RecordValidation {
  if (!hasOnly(record, ["text", "createdAt", "parent"])) return invalid("message has unknown fields");
  if (!isTid(context.rkey)) return invalid("message key must be a TID");
  if (typeof record.text !== "string" || codePointLength(record.text) < 1 || codePointLength(record.text) > 10000) return invalid("message text must contain 1 to 10000 Unicode code points");
  if (!isDatetime(record.createdAt)) return invalid("invalid message timestamp");
  if (record.parent !== undefined) {
    if (typeof record.parent !== "string") return invalid("parent must be an AT URI");
    const parent = validateMessageParent(record.parent, context.spaceUri, context.knownTopLevelMessages ?? new Set(), context.knownMessages ?? new Set());
    if (!parent.valid) return parent;
  }
  return { valid: true };
}

function validateReaction(record: Record<string, unknown>, context: RecordContext): RecordValidation {
  if (!hasOnly(record, ["subject", "emoji", "createdAt"])) return invalid("reaction has unknown fields");
  if (typeof record.subject !== "string" || !parseSpaceRecordUri(record.subject, context.spaceUri, "org.slack.channel.message") || !context.knownMessages?.has(record.subject)) return invalid("reaction target is not a message in this channel");
  if (!boundedString(record.emoji, 1, 32) || !isDatetime(record.createdAt)) return invalid("invalid reaction fields");
  if (context.rkey !== reactionRecordKey(record.subject, record.emoji, context.repoDid)) return invalid("reaction key is not canonical");
  return { valid: true };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnly(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}

function boundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isDid(value: unknown): value is string {
  return typeof value === "string" && /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(value);
}

function isSpaceUri(value: unknown, spaceType: string): value is string {
  return typeof value === "string" && new RegExp(`^at:\\/\\/did:[^/\\s]+\\/space\\/${spaceType}\\/[A-Za-z0-9._~:-]{1,128}$`).test(value);
}

function collectionSpaceType(collection: string): string | undefined {
  if (["org.slack.workspace.profile", "org.slack.directory", "org.slack.workspace.roster", "org.slack.admin", "org.slack.acceptance"].includes(collection)) return "org.slack.workspace";
  if (["org.slack.joinRequest", "org.slack.joinDecision"].includes(collection)) return "org.slack.inbox";
  if (["org.slack.channel.message", "org.slack.channel.reaction", "org.slack.channel.roster"].includes(collection)) return "org.slack.channel";
  return undefined;
}

function isTid(value: unknown): value is string {
  return typeof value === "string" && /^[234567abcdefghijklmnopqrstuvwxyz]{13}$/.test(value);
}

function isDatetime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function invalid(reason: string): RecordValidation {
  return { valid: false, reason };
}
