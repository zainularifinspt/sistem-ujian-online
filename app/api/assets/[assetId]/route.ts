import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { examAssets } from "@/lib/db/schema";
import { fail, handleError, requireAdmin } from "@/lib/api/http";
import { requireStudentSession } from "@/lib/api/student-session";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    if (!await requireStudentSession() && !await requireAdmin()) return fail("Unauthorized", 401);
    const { assetId } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(assetId)) return fail("Gambar tidak ditemukan.", 404);
    const headers = { "Cache-Control": "private, max-age=31536000, immutable", ETag: `"${assetId}"`, "X-Content-Type-Options": "nosniff" };
    if (request.headers.get("if-none-match") === `"${assetId}"`) return new Response(null, { status: 304, headers });
    const [asset] = await db.select().from(examAssets).where(eq(examAssets.id, assetId));
    if (!asset) return fail("Gambar tidak ditemukan.", 404);
    return new Response(Buffer.from(asset.data, "base64"), { headers: { ...headers, "Content-Type": asset.contentType } });
  } catch (error) { return handleError(error); }
}
