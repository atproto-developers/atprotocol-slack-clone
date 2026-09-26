import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getConfig } from "@/lib/config";

export type CachedRecordContext = {
  accountDid: string;
  spaceUri: string;
  repoDid: string;
  collection: string;
  rkey: string;
  uri: string;
};

export function encryptCachedValue(value: unknown, context: CachedRecordContext): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getConfig().encryptionKey, iv);
  cipher.setAAD(associatedData(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptCachedValue<T>(value: string, context: CachedRecordContext): T {
  const [version, ivText, tagText, bodyText] = value.split(".");
  if (version !== "v2" || !ivText || !tagText || !bodyText) throw new Error("Unsupported encrypted cache value.");
  const decipher = createDecipheriv("aes-256-gcm", getConfig().encryptionKey, Buffer.from(ivText, "base64url"));
  decipher.setAAD(associatedData(context));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(bodyText, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as T;
}

function associatedData(context: CachedRecordContext): Buffer {
  return Buffer.from(JSON.stringify([
    "atproto-slack-clone:channel-record-cache:v2",
    context.accountDid,
    context.spaceUri,
    context.repoDid,
    context.collection,
    context.rkey,
    context.uri,
  ]), "utf8");
}
