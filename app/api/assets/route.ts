import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { examAssets } from "@/lib/db/schema";
import { fail, handleError, ok, requireAdmin } from "@/lib/api/http";
import { hasSameOrigin } from "@/lib/api/student-session";
import { readJsonBody } from "@/lib/api/body";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin || !hasSameOrigin(request)) return fail("Unauthorized", 401);
    const { dataUrl } = z.object({ dataUrl: z.string().max(700000) }).parse(await readJsonBody(request, 750000));
    const match = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) return fail("Format gambar tidak didukung.", 422);
    const data = Buffer.from(match[2], "base64");
    const type = match[1];
    const valid = type === "image/webp" ? data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP" :
      type === "image/png" ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : data[0] === 255 && data[1] === 216;
    if (!valid || data.length > 500000) return fail("Gambar tidak valid atau melebihi 500 KB setelah kompresi.", 422);
    const id = createHash("sha256").update(data).digest("hex");
    await db.insert(examAssets).values({ id, data: data.toString("base64"), contentType: type, createdById: admin.id }).onConflictDoNothing();
    return ok({ url: `/api/assets/${id}` });
  } catch (error) { return handleError(error); }
}
