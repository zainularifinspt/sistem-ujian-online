import { fail, ok } from "@/lib/api/http";
import { clearStudentCookie, hasSameOrigin } from "@/lib/api/student-session";
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return fail("Akses tidak valid.", 403);
  const response = ok({ loggedOut: true });
  clearStudentCookie(response);
  return response;
}
