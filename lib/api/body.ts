import { HttpError } from "@/lib/api/http";
export async function readJsonBody(request: Request, maxBytes = 2_000_000): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new HttpError("Data terlalu besar.", 413);
  if (!request.body) throw new HttpError("Data tidak tersedia.", 422);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError("Data terlalu besar.", 413); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("Format data tidak valid.", 422);
  } finally { reader.releaseLock(); }
}
