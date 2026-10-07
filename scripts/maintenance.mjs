// Run as a persistent process or invoke --once from a scheduler.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
const base = process.env.MAINTENANCE_BASE_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET wajib diisi untuk worker maintenance.");
do {
  try {
    const response = await fetch(new URL("/api/maintenance", base), {
      headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) console.error(`Maintenance gagal: HTTP ${response.status}`);
  } catch { console.error("Maintenance belum dapat terhubung. Percobaan berikutnya akan dijalankan otomatis."); }
  if (process.argv.includes("--once")) break;
  await new Promise((resolve) => setTimeout(resolve, 10000));
} while (true);
