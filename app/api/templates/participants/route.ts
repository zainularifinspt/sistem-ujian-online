import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { fail, handleError, requireAdmin } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const worksheet = XLSX.utils.json_to_sheet([
      { NIM: "23103001", NAMA: "Alya Ramadhani" },
      { NIM: "23103017", NAMA: "Raka Pratama" }
    ]);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Peserta");

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer"
    }) as Buffer;

    const body = new Blob([new Uint8Array(buffer)]);

    return new NextResponse(body, {
      headers: {
        "Content-Disposition":
          'attachment; filename="template-import-peserta.xlsx"',
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    });
  } catch (error) {
    return handleError(error);
  }
}
