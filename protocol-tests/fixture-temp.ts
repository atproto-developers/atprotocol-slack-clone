import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createFixtureTempRoot(prefix: string): { path: string; cleanup(): void } {
  const previousTmpdir = process.env.TMPDIR;
  const path = mkdtempSync(join(tmpdir(), prefix));
  process.env.TMPDIR = path;
  let cleaned = false;

  return {
    path,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (previousTmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previousTmpdir;
      rmSync(path, { recursive: true, force: true });
    },
  };
}
