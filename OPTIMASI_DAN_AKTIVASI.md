# Optimasi dan aktivasi aplikasi ujian

Tanggal: 7 Oktober 2026. Perubahan sudah diterapkan pada kode lokal. Database dan hosting produksi belum diubah.

Pemeriksaan akhir dilanjutkan dan selesai pada 8 Oktober 2026, termasuk perubahan terakhir pada panel peserta di ponsel. Contoh konfigurasi `.env.example` sudah mencantumkan `CRON_SECRET`, `MAINTENANCE_BASE_URL`, dan `DB_POOL_MAX`.

## Perubahan yang selesai

- Timer terpisah dari halaman soal; render rumus memakai memoization. Editor MathLive hanya dimuat di admin. Semua jawaban peserta memakai input teks/textarea dan keyboard biasa.
- Autosave menggunakan satu antrean batch, revisi server, dan identitas tab penulis. Jawaban baru tidak dihapus dari antrean oleh respons lama. Navigasi tidak menunggu jaringan; submit menunggu perubahan terbaru.
- Draf pending disimpan per sesi di perangkat. Draf yang revisinya berbeda tidak menimpa server; dapat diunduh untuk pemeriksaan. Gangguan penyimpanan lokal tidak membatalkan bukti penerimaan server.
- Cookie sesi HttpOnly memungkinkan resume tanpa token yang telah berotasi. Resume menjaga pause, batas waktu, serta urutan soal/opsi. API peserta memeriksa kredensial dan asal request. Percobaan login dibatasi melalui database.
- Submit, force-submit, expiry, dan pelanggaran memakai penutupan transaksi bersama. Submit berulang tidak menggandakan hasil. Nilai deterministik dihitung langsung; AI menggunakan antrean database, dua pekerjaan bersamaan, lease, dan maksimal tiga percobaan. Kegagalan AI tetap menunggu pemeriksaan, bukan otomatis salah.
- Notasi keyboard biasa seperti `1/2`, `x^2`, dan `sqrt(9)` didukung terhadap kunci rumus lama pada subset ekspresi yang dapat dibandingkan dengan pasti. Ekspresi yang tidak dapat dipastikan memerlukan penilaian lanjutan/manual; parser tidak menjalankan kode pengguna.
- Polling memiliki timeout, pembatalan, dan jeda bertambah ketika gagal. Monitoring hanya mengambil progres, bukan mengunduh ulang semua soal. Cache admin dibersihkan ketika konteks pengguna berubah.
- Data admin dimuat sesuai menu. Penilaian dan daftar peserta menampilkan 25 peserta per halaman dengan pencarian server. Statistik penilaian halaman berlaku pada peserta yang sedang ditampilkan; ekspor tetap mencakup seluruh hasil.
- Gambar baru dikompresi sampai sisi terpanjang 1.600 piksel, dibatasi sekitar 500 KB, dan disimpan terpisah dari JSON soal melalui aset privat. Gambar lama masih kompatibel; tidak ada perubahan massal gambar lama.
- Kueri daftar ujian menghindari perkalian baris soal–peserta; monitoring menghitung jumlah soal sekali. Pool koneksi dan timeout dibatasi. Rotasi token, penutupan expiry, dan antrean AI dapat dijalankan dari maintenance terjadwal.

## Aktivasi produksi

Lakukan pada jadwal pemeliharaan di luar ujian aktif. Kredensial sesi peserta baru membutuhkan kode dan skema baru bersama-sama; sesi lama dapat membutuhkan login ulang. Siapkan cadangan database sebelum migrasi.

1. Pasang dependensi dengan `npm ci`.
2. Pastikan `DATABASE_URL`, `BETTER_AUTH_URL`, dan `BETTER_AUTH_SECRET` terisi sesuai lingkungan. Pertahankan secret yang sama antar-instance. Atur `DB_POOL_MAX` bila diperlukan; nilai bawaan 5 per instance harus disesuaikan dengan batas total koneksi database.
3. Terapkan migrasi menggunakan `npm run db:migrate`, termasuk `0006_exam_sync_and_grading_queue.sql`. Jalankan terhadap database tujuan yang benar. Migrasi sudah diuji dari database lokal kosong.
4. Tambahkan `CRON_SECRET` acak yang kuat pada aplikasi dan pelaksana maintenance. Jangan memasukkannya ke kode atau variabel publik.
5. Jalankan `npm run build`, lalu deploy aplikasi dan periksa login, simpan, pause/resume, submit, monitoring, penilaian, unggah gambar, dan ekspor menggunakan peserta uji.
6. Aktifkan **salah satu** pelaksana maintenance berikut. Kode `after()` membantu memulai penilaian setelah submit, tetapi keberlangsungan antrean dan expiry saat tab ditutup memerlukan pelaksana ini.

### Server yang dapat menjalankan proses tetap

Jalankan aplikasi dan `npm run worker` sebagai dua proses terkelola yang otomatis dimulai ulang. Isi `MAINTENANCE_BASE_URL` dengan URL aplikasi; worker memanggil maintenance lalu menunggu 10 detik. Secret pada kedua proses harus sama. Untuk sekali jalan gunakan `npm run worker -- --once`.

### Hosting serverless

Gunakan penjadwal yang tersedia pada hosting atau layanan penjadwal eksternal untuk memanggil `GET /api/maintenance` dengan header `Authorization: Bearer <CRON_SECRET>`, idealnya setiap 10–60 detik. Interval bergantung fasilitas hosting; semakin jarang panggilan, semakin lama antrean dan expiry diproses. Jangan menaruh secret dalam URL. Batas eksekusi endpoint 60 detik tetap perlu disesuaikan dengan dukungan paket hosting.

Endpoint mengembalikan 401 bila secret tidak tersedia/salah. Setiap panggilan membatasi jumlah sesi dan pekerjaan yang diproses; antrean besar membutuhkan beberapa putaran. Tombol proses penilaian pada admin tersedia untuk pemrosesan manual jika penjadwal belum berjalan.

## Hasil verifikasi

- Lint dan TypeScript lulus.
- Empat pengujian unit lulus: mengetik saat save, retry, konflik revisi draf, dan kompatibilitas notasi matematika.
- Sepuluh pengujian integrasi lulus pada database PostgreSQL lokal terpisah: kredensial, batas body, save serentak, writer/soal tidak sah, submit atomik/idempoten, deadline, sesi paused, urutan stabil, AI gagal/manual, dan pembatasan worker.
- Simulasi 100 peserta dengan 10 pengiriman bersamaan menghasilkan nilai konsisten. Pengukuran lokal p95 sekitar 99–113 ms untuk transaksi submit; angka ini **bukan** kapasitas atau latensi hosting produksi.
- Pemeriksaan HTTP lokal lulus untuk monitoring, pencarian/pagination penilaian dan peserta, penolakan akses peserta tanpa cookie, otorisasi maintenance, unggah/baca gambar privat, serta nilai manual yang mempertahankan jawaban dan total.
- Browser lokal memverifikasi input teks biasa, navigasi saat save berjalan, status tersimpan, submit berhasil, serta kembali ke login. Build produksi berhasil pada salinan proyek pengujian terpisah dengan versi dependensi yang sama.
- Verifikasi ulang 8 Oktober: lint, TypeScript, empat pengujian unit, sepuluh pengujian integrasi, dan build produksi lulus. Build mencatat First Load JS halaman peserta sekitar 246 kB dan admin 279 kB; ukuran ini belum dibandingkan dengan build sebelum optimasi. Simulasi ulang 100 peserta pada database lokal menghasilkan p95 transaksi submit 34 ms, bukan ukuran latensi atau kapasitas produksi.

Pengujian dilakukan tanpa mengakses database `.env.local`; proyek dan database sementara hanya berisi data uji. Belum diuji pada perangkat Android/iOS nyata, jaringan seluler, atau beban hosting produksi. Belum ada pengukuran perbandingan sebelum/sesudah yang membuktikan persentase pengurangan bundle.

## Kebijakan yang dipertahankan

Batas sesi baru tetap mengikuti akhir jadwal ujian, sesuai perilaku sebelumnya; `durationMinutes` belum dijadikan batas baru. Jawaban yang baru tiba setelah deadline server tidak otomatis diterima. Draf tetap tersedia untuk peninjauan. Perubahan kedua aturan ini membutuhkan keputusan pengajar, bukan optimasi teknis semata.
