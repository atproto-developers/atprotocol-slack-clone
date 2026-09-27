import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const ISOMORPHIC_PROTOCOL_MODULES = [
  "src/dm/**/*.{ts,tsx}",
  "src/protocol/keys.ts",
  "src/atproto/dpop.ts",
  "src/atproto/space-credential-core.ts",
  "src/atproto/xrpc.ts",
  "src/atproto/record-pages.ts",
  "src/lib/bounded-json.ts",
  "src/protocol/records.ts",
  "src/atproto/valid-channel-messages.ts",
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "src/lexicons/api/**", "next-env.d.ts"]),
  {
    files: ISOMORPHIC_PROTOCOL_MODULES,
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["node:*"],
            message: "Isomorphic DM/protocol modules must run in the browser and cannot import Node built-ins.",
          },
          {
            group: [
              "@/lib/db", "@/lib/config", "@/auth/*", "@/operator/*", "@/workspaces/*",
              "@atproto/oauth-client-node", "undici", "@/atproto/identity",
            ],
            message: "Isomorphic DM/protocol modules must not depend on the server-only session, database, or SSRF-guarded fetch layer.",
          },
        ],
      }],
    },
  },
]);
