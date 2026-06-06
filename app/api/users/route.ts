import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { desc, eq } from "drizzle-orm";

import { fail, getUserRole, handleError, ok, requireAdmin } from "@/lib/api/http";
import { createUserSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import { account, user } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const admin = await requireAdmin();

    if (!admin || getUserRole(admin) !== "admin") {
      return fail("Unauthorized", 401);
    }

    const rows = await db
      .select({
        createdAt: user.createdAt,
        email: user.email,
        id: user.id,
        name: user.name,
        role: user.role,
        updatedAt: user.updatedAt
      })
      .from(user)
      .orderBy(desc(user.createdAt));

    return ok(rows);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    if (!admin || getUserRole(admin) !== "admin") {
      return fail("Unauthorized", 401);
    }

    const payload = createUserSchema.parse(await request.json());
    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, payload.email))
      .limit(1);

    if (existing.length > 0) {
      return fail("Email sudah terdaftar", 409);
    }

    const now = new Date();
    const userId = randomUUID();
    const passwordHash = await hashPassword(payload.password);
    const [createdUser] = await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(user)
        .values({
          createdAt: now,
          email: payload.email,
          emailVerified: true,
          id: userId,
          name: payload.name,
          role: payload.role,
          updatedAt: now
        })
        .returning({
          createdAt: user.createdAt,
          email: user.email,
          id: user.id,
          name: user.name,
          role: user.role,
          updatedAt: user.updatedAt
        });

      await tx.insert(account).values({
        accountId: userId,
        createdAt: now,
        id: `account-${userId}`,
        password: passwordHash,
        providerId: "credential",
        updatedAt: now,
        userId
      });

      return [newUser];
    });

    return ok(createdUser, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
