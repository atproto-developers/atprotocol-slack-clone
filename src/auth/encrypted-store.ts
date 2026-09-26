import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { NodeSavedSession, NodeSavedState } from "@atproto/oauth-client-node";
import { getConfig } from "@/lib/config";
import { getRawDb } from "@/lib/db";

type OAuthRow = { key: string; value: string; updated_at: number };
type OAuthValue = NodeSavedSession | NodeSavedState;
type OAuthTable = "oauth_state" | "oauth_session";
const SQLITE_WRITE_RETRY_DELAYS_MS = [100, 250] as const;
const OAUTH_STATE_RETENTION_MS = 30 * 60 * 1000;
type Store<T> = {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
};

export function oauthSqliteStore<K extends OAuthValue>(table: OAuthTable): Store<K> {
  return {
    async get(key) {
      const row = getRawDb().prepare(`SELECT value, updated_at FROM ${table} WHERE key = ?`).get(key) as OAuthRow | undefined;
      if (!row) return undefined;
      const cutoff = Date.now() - OAUTH_STATE_RETENTION_MS;
      if (table === "oauth_state" && row.updated_at < cutoff) {
        await retrySqliteBusyWrite(() => getRawDb().prepare("DELETE FROM oauth_state WHERE key = ? AND updated_at < ?").run(key, cutoff));
        return undefined;
      }
      return decryptJson<K>(row.value);
    },
    async set(key, value) {
      const encryptedValue = encryptJson(value);
      await retrySqliteBusyWrite(() => {
        const db = getRawDb();
        const write = db.transaction(() => {
          const now = Date.now();
          if (table === "oauth_state") {
            db.prepare("DELETE FROM oauth_state WHERE updated_at < ?").run(now - OAUTH_STATE_RETENTION_MS);
          }
          db.prepare(`INSERT INTO ${table}(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
            .run(key, encryptedValue, now);
        });
        write();
      });
    },
    async del(key) {
      await retrySqliteBusyWrite(() => {
        getRawDb().prepare(`DELETE FROM ${table} WHERE key = ?`).run(key);
      });
    },
  };
}

export async function retrySqliteBusyWrite<T>(write: () => T): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return write();
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      const retryable = code === "SQLITE_BUSY" || code === "SQLITE_LOCKED";
      if (!retryable || attempt >= SQLITE_WRITE_RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, SQLITE_WRITE_RETRY_DELAYS_MS[attempt]));
    }
  }
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getConfig().encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptJson<T>(value: string): T {
  const [version, ivPart, tagPart, ciphertextPart, extra] = value.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !ciphertextPart || extra !== undefined) {
    throw new Error("Encrypted OAuth state has an unsupported format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getConfig().encryptionKey, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
