import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

function getDeploymentURL() {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_URL atau NEXT_PUBLIC_APP_URL wajib diisi di production."
    );
  }

  return "http://localhost:3000";
}

const authBaseURL = getDeploymentURL();
const authURL = new URL(authBaseURL);
const authProtocol = authURL.protocol === "https:" ? "https" : "http";
const productionAllowedHosts = Array.from(
  new Set([authURL.host, process.env.VERCEL_URL].filter(Boolean) as string[])
);
const allowedHosts =
  process.env.NODE_ENV === "production"
    ? productionAllowedHosts
    : [authURL.host, "localhost:*", "127.0.0.1:*"];
const authSecret = process.env.BETTER_AUTH_SECRET;

if (process.env.NODE_ENV === "production" && !authSecret) {
  throw new Error("BETTER_AUTH_SECRET wajib diisi di production.");
}

export const auth = betterAuth({
  baseURL: {
    allowedHosts,
    fallback: authBaseURL,
    protocol: authProtocol
  },
  secret: authSecret ?? "local-dev-secret-change-me",
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
