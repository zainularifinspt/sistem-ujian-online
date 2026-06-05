import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const authBaseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  baseURL: {
    allowedHosts: ["localhost:*", "127.0.0.1:*"],
    fallback: authBaseURL,
    protocol: "http"
  },
  secret: process.env.BETTER_AUTH_SECRET ?? "local-dev-secret-change-me",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "dosen",
        input: true,
        returned: true
      }
    }
  },
  plugins: [nextCookies()]
});
