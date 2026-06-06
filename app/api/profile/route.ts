import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import { fail, handleError, ok, requireAdmin } from "@/lib/api/http";
import { updateProfileSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import { account, user } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireAdmin();

    if (!sessionUser) {
      return fail("Unauthorized", 401);
    }

    const payload = updateProfileSchema.parse(await request.json());
    const now = new Date();

    if (payload.newPassword) {
      const [credentialAccount] = await db
        .select()
        .from(account)
        .where(
          and(
            eq(account.userId, sessionUser.id),
            eq(account.providerId, "credential")
          )
        )
        .limit(1);

      if (!credentialAccount?.password) {
        return fail("Akun ini belum memiliki password credential.", 400);
      }

      const isValidPassword = await verifyPassword({
        hash: credentialAccount.password,
        password: payload.currentPassword ?? ""
      });

      if (!isValidPassword) {
        return fail("Password lama tidak sesuai.", 400);
      }

      await db
        .update(account)
        .set({
          password: await hashPassword(payload.newPassword),
          updatedAt: now
        })
        .where(eq(account.id, credentialAccount.id));
    }

    const [updatedUser] = await db
      .update(user)
      .set({
        name: payload.name,
        updatedAt: now
      })
      .where(eq(user.id, sessionUser.id))
      .returning({
        email: user.email,
        id: user.id,
        name: user.name,
        role: user.role,
        updatedAt: user.updatedAt
      });

    return ok(updatedUser);
  } catch (error) {
    return handleError(error);
  }
}
