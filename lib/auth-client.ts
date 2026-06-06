"use client";

import { createAuthClient } from "better-auth/react";

// Use explicit NEXT_PUBLIC_APP_URL when provided (CI / custom setups).
// When running in the browser during `next dev`, prefer the current origin
// so the client targets the same dev server port (handles cases where
// Next chooses a different port like 3002).
export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ??
        (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000")
});
