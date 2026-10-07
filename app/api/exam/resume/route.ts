import { fail, handleError, ok } from "@/lib/api/http";
import { hasSameOrigin, requireStudentSession, setStudentCookie } from "@/lib/api/student-session";
import { claimStudentWriter, getStudentPayload } from "@/lib/api/student-payload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!hasSameOrigin(request)) return fail("Akses tidak valid.", 403);
    const existing = await requireStudentSession();
    if (!existing) return fail("Tidak ada sesi yang dapat dilanjutkan.", 401);
    const session = await claimStudentWriter(existing.id);
    const response = ok(await getStudentPayload(session), { headers: { "Cache-Control": "no-store" } });
    setStudentCookie(response, session);
    return response;
  } catch (error) { return handleError(error); }
}
