import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { examSessions } from "@/lib/db/schema";

const COOKIE = "exam_access";

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET wajib diisi untuk sesi peserta.");
  }
  return value ?? "local-dev-secret-change-me";
}

type Credential = { sessionId: string; nonce: string; expires: number };

export function signStudentCredential(value: Credential) {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}

export function verifyStudentCredential(value: string | undefined): Credential | null {
  if (!value) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as Credential;
    return typeof parsed.sessionId === "string" && typeof parsed.nonce === "string" &&
      Number.isFinite(parsed.expires) && parsed.expires > Date.now() ? parsed : null;
  } catch { return null; }
}

export function setStudentCookie(response: NextResponse, session: typeof examSessions.$inferSelect) {
  const expires = Math.max(session.expiresAt.getTime(), Date.now()) + 24 * 60 * 60 * 1000;
  response.cookies.set(COOKIE, signStudentCredential({ sessionId: session.id, nonce: session.authNonce, expires }), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/", expires: new Date(expires)
  });
}

export function clearStudentCookie(response: NextResponse) {
  response.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export async function requireStudentSession(sessionId?: string) {
  const credential = verifyStudentCredential((await cookies()).get(COOKIE)?.value);
  if (!credential || (sessionId && credential.sessionId !== sessionId)) return null;
  const [session] = await db.select().from(examSessions).where(eq(examSessions.id, credential.sessionId));
  return session?.authNonce === credential.nonce ? session : null;
}

export function hasSameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const expectedHost = request.headers.get("host") ?? new URL(request.url).host;
    return new URL(origin).host === expectedHost;
  } catch { return false; }
}
