# Rencana stabilitas dan optimasi aplikasi ujian online

Tanggal: 7 Oktober 2026. Dokumen ini merekam rencana awal. Implementasi dan hasil verifikasi terbaru tersedia di [OPTIMASI_DAN_AKTIVASI.md](OPTIMASI_DAN_AKTIVASI.md). Temuan di bawah menggambarkan kondisi sebelum optimasi.

## 1. Tujuan dan batas pemeriksaan

Peserta dapat masuk, mengetik, berpindah soal, melanjutkan sesi, dan mengirim jawaban dengan lancar di laptop maupun ponsel. Jawaban terbaru harus aman ketika koneksi lambat atau terputus. Semua input jawaban peserta menggunakan keyboard biasa dari perangkat.

Pemeriksaan mencakup kode halaman peserta/admin, penyimpanan jawaban, sesi dan timer, submit/penilaian, monitoring, gambar, dan skema PostgreSQL. Temuan berikut bersumber dari kode; waktu respons nyata, ukuran unduhan produksi, penggunaan memori, dan kapasitas peserta belum diukur. Tidak ada perubahan kode aplikasi, migrasi, atau deploy dalam tahap ini.

Teknologi saat ini: Next.js 15, React 19, PostgreSQL/Drizzle, Better Auth untuk admin, MathLive untuk editor rumus, KaTeX untuk tampilan rumus, dan Framer Motion untuk animasi.

## 2. Temuan yang menentukan prioritas

P1 berarti risiko terhadap jawaban, hasil, atau kendali sesi. P2 berarti perbaikan kelancaran dan efisiensi. Tingkat ini menunjukkan prioritas implementasi, bukan hasil pengukuran produksi.

| Prioritas | Temuan dari kode | Dampak | Lokasi |
|---|---|---|---|
| P1 | Autosave 700 ms, flush berkala, pindah soal, dan submit dapat menyimpan jawaban yang sama secara bersamaan. Respons sukses langsung menghapus tanda perubahan tanpa mengecek versi. | Respons lama dapat menandai jawaban baru sebagai tersimpan; urutan request dapat membuat nilai lama menimpa nilai baru. | `components/student-exam-client.tsx`, fungsi `saveAnswer`, `flushDirtyAnswers`, `updateAnswer`; API `answers` |
| P1 | Draf jawaban hanya berada di state React; sessionStorage hanya menyimpan NIM dan token. Beberapa pemanggilan penyimpanan tidak menangani kegagalan. | Refresh/crash/koneksi terputus berisiko menghilangkan perubahan yang belum diterima server dan tidak memberi status kegagalan yang jelas. | `components/student-exam-client.tsx` |
| P1 | Ketika waktu habis, kegagalan flush dapat diabaikan; API answers menolak perubahan setelah expiry. Auto-submit pelanggaran juga menutup berdasarkan jawaban di server. | Jawaban terakhir yang masih di perangkat dapat tidak masuk hasil akhir. | `submitExam`, `recordViolation`, API `answers`, `violations`, `submit` |
| P1 | Pemulihan sesi memanggil start dengan token lama, sementara token berotasi 10 menit. Upsert start mengatur ulang status menjadi aktif dan expiry menjadi akhir jadwal. Pengacakan juga diulang. | Peserta dapat gagal melanjutkan setelah token berubah; refresh dapat membatalkan pause/perpanjangan waktu dan mengubah urutan soal. | API `exam/start`, `lib/api/exam-token.ts`, efek restore peserta |
| P1 | Penutupan sesi menunggu penilaian AI dan banyak update paralel sebelum mengubah status sesi. Tidak ada transaksi penutupan atau perlindungan submit berulang di fungsi bersama. | Submit bisa lambat; autosave/submit paralel dapat berlomba; kegagalan parsial berisiko membuat status dan nilai tidak selaras. | `lib/api/grading.ts`, `lib/api/ai-grading.ts` |
| P1 | Penutupan sesi lewat halaman penilaian mengubah status langsung, sedangkan ekspor menggunakan fungsi penilaian dengan `skipAi`. Normalisasi `skipAi` berbeda dari jalur normal. | Hasil penilaian dapat bergantung pada jalur yang menutup sesi, terutama jawaban rumus. | API `grading/[examId]`, `grading/[examId]/export`, `lib/api/grading.ts` |
| P1 | API jawaban, status, submit, dan pelanggaran peserta menggunakan sessionId tanpa pemeriksaan kredensial peserta tambahan. | SessionId menjadi satu-satunya bukti akses; perlu pengikatan sesi ke peserta agar perubahan optimasi tetap aman. | API `exam/sessions/[sessionId]/*` |
| P2 | Timer memperbarui state komponen ujian setiap detik. MathContent memproses dan merender rumus setiap render. | Area soal dan navigasi ikut dirender ketika hanya angka timer berubah; beban meningkat dengan rumus/soal banyak. | `components/student-exam-client.tsx`, `components/math-content.tsx` |
| P2 | Pindah soal menunggu save server; error tidak ditangani pada fungsi navigasi. | Navigasi terasa lambat atau tertahan saat koneksi buruk. | `goToQuestion` |
| P2 | Status peserta dipoll setiap 5 detik tanpa timeout, backoff, atau penjagaan request tumpang tindih. | Tambahan beban server dan penumpukan request ketika respons lambat. | efek polling peserta |
| P2 | Monitoring admin memanggil detail penuh dan monitor setiap 12 detik; cache GET 20 detik dapat mengembalikan data lama. | Soal/gambar/roster dimuat ulang tanpa perlu; status pengawas dapat tertinggal. | `components/home-client.tsx`, `loadExamDetail`, `apiRequest` |
| P2 | Gambar unggahan disimpan sebagai data URL; halaman peserta memakai Image dengan `unoptimized`. CSS font MathLive diimpor global. | Payload soal dan aset awal dapat membesar; ukuran sebenarnya perlu diukur. | `readQuestionImage`, API questions, `app/layout.tsx`, komponen peserta |

Hal yang sudah baik dan perlu dipertahankan: peserta menerima soal tanpa kunci jawaban; hubungan session–question divalidasi saat save; indeks unik jawaban per sesi/soal sudah tersedia; sebagian tampilan admin dimuat dinamis; polling admin berhenti saat tab tersembunyi; blur header sudah dinonaktifkan pada layar kecil. Tidak perlu mengganti framework atau backend untuk memulai optimasi.

## 3. Keyboard biasa untuk semua jawaban peserta

### Perilaku yang direncanakan

- Isian singkat selalu memakai input HTML biasa, termasuk soal matematika; esai memakai textarea biasa; pilihan ganda tetap berupa pilihan.
- Gunakan `type="text"` dan `inputMode="text"` agar huruf, angka, tanda minus, pecahan, dan simbol tetap tersedia. Jangan memaksakan keyboard angka atau memasang keyboard matematika tambahan.
- Hapus pemakaian MathAnswerInput dan instruksi keyboard matematika dari halaman peserta. Contoh bantuan yang singkat: “Tulis seperti 1/2, x^2, atau sqrt(9).”
- Tampilan rumus dalam soal dan pilihan tetap dipertahankan. Editor rumus admin dapat tetap dipakai untuk menyusun soal/kunci, tetapi asetnya hanya dimuat ketika diperlukan di admin.
- Input jawaban mempunyai label yang jelas, ukuran huruf minimal 16 px pada ponsel, dan tetap terlihat ketika keyboard perangkat terbuka. Status penyimpanan tidak merebut fokus.

### Kompatibilitas penilaian

Mengganti komponen saja belum cukup: kunci `\\(\\frac{1}{2}\\)` tidak otomatis cocok dengan teks `1/2` pada pembanding saat ini.

1. Pertahankan data jawaban mentah dan kunci lama; jangan melakukan konversi massal tanpa kebutuhan.
2. Tentukan aturan penulisan untuk angka, desimal, pecahan, pangkat, dan akar. Normalisasi harus konservatif dan diuji; tidak memakai `eval`, tidak mengubah arti ekspresi, dan tidak mengabaikan huruf besar/kecil untuk variabel secara sembarang.
3. Sediakan alternatif jawaban yang disetujui pengajar untuk bentuk ekuivalen yang belum didukung, misalnya `1/2` dan `0.5`. Desimal koma/titik dan toleransi numerik perlu aturan eksplisit per jenis soal.
4. Jawaban yang tidak dapat dipastikan dengan aturan deterministik ditandai untuk peninjauan/penilaian lanjutan. Gangguan layanan AI tidak boleh otomatis dianggap sebagai bukti jawaban salah.
5. Gunakan pembanding yang sama pada submit biasa, auto-submit, penilaian ulang, dan ekspor. Uji contoh benar serta contoh mirip yang sebenarnya salah.

## 4. Tahapan implementasi

### Tahap A — Ukur kondisi awal

- Rekam ukuran JavaScript/CSS halaman peserta dan admin secara terpisah, ukuran payload start termasuk gambar, waktu start/save/status/submit, serta jumlah request per peserta.
- Profilkan mengetik dan navigasi pada ponsel kelas menengah dengan soal teks, rumus, dan gambar. Amati biaya render timer serta MathContent.
- Catat keterlambatan monitoring, waktu tunggu koneksi PostgreSQL, dan kueri paling mahal. Gunakan data uji terpisah dari ujian aktif.
- Konfirmasi kapasitas peserta bersamaan dan lingkungan hosting/database. Angka peserta belum diberikan; pengujian bertahap 50, 100, lalu 300 dapat dipakai sebagai skenario awal, bukan janji kapasitas.

### Tahap B — Amankan jawaban dan sesi

- Ganti beberapa jalur autosave menjadi satu antrean dengan penggabungan perubahan. Maksimal satu pengiriman aktif per jawaban; perubahan berikutnya tetap antre. Respons hanya menandai tersimpan jika versi yang dikonfirmasi sama dengan versi terbaru.
- Tambahkan revisi/aturan urutan di server agar request lama tidak menimpa jawaban baru, termasuk konflik dua tab. Tambahkan endpoint batch untuk perubahan beberapa soal dengan batas jumlah dan ukuran payload.
- Simpan draf lokal per sesi/peserta beserta revisi; pulihkan hanya draf milik sesi yang sama. Tangani penyimpanan lokal yang tidak tersedia, bersihkan setelah submit terkonfirmasi/reset, dan jangan menyimpan kredensial dalam draf.
- Tangani retry dengan jeda bertambah, timeout, dan status “Menyimpan”, “Tersimpan”, atau “Belum tersinkron”. Retry tidak berjalan tanpa batas pada error sesi ditutup.
- Saat pindah soal, navigasi langsung setelah draf lokal diamankan; penyimpanan server berjalan di antrean. Submit menunggu konfirmasi perubahan terbaru.
- Pisahkan start baru dari resume. Gunakan kredensial sesi peserta yang dibuat setelah validasi NIM/token, disimpan dalam cookie HttpOnly yang sesuai, dan diverifikasi pada seluruh API peserta. Terapkan pembatasan percobaan masuk serta perlindungan request sesuai metode autentikasi.
- Resume tidak bergantung pada token ujian yang sudah berotasi, tidak membuka sesi tertutup/paused, dan tidak mengganti expiry. Simpan urutan soal/opsi per sesi agar refresh konsisten.
- Tegaskan aturan durasi: kode start saat ini menggunakan akhir jadwal, bukan `durationMinutes`. Usulan sesi baru: `min(waktu mulai + durasi, akhir jadwal)`; perpanjangan pause harus mengikuti kebijakan yang sama pada seluruh jalur. Kebijakan akhir perlu disetujui sebelum implementasi bagian ini.

### Tahap C — Submit cepat dan konsisten

- Dalam transaksi singkat, validasi sesi, simpan batch jawaban terakhir yang masih sah, tutup sesi, dan catat pekerjaan penilaian. Submit berulang mengembalikan bukti penerimaan yang sama.
- Koordinasikan autosave, pause, reset, force-submit, dan submit melalui aturan status/revisi yang sama. Tidak ada penulisan jawaban setelah penutupan terkonfirmasi.
- Berikan konfirmasi “Jawaban diterima” segera setelah penyimpanan dan penutupan berhasil. Status penilaian terpisah, misalnya pending/processing/completed/needs_review.
- Jalankan penilaian AI melalui pekerjaan latar yang persisten, dengan jumlah pekerjaan bersamaan dibatasi, timeout, retry terbatas, dan pencatatan hasil. Jangan memakai pekerjaan tanpa jaminan selesai setelah respons pada hosting serverless.
- Nilai PG dan kecocokan isian yang deterministik dapat diproses cepat; AI hanya untuk kasus yang memang membutuhkan penilaian lanjutan. Ekspor menampilkan status nilai sementara secara jelas bila penilaian belum selesai.
- Satukan jalur auto-submit, waktu habis, pelanggaran, force-submit, penilaian, dan ekspor. Tambahkan pemrosesan expiry di server agar tidak bergantung pada tab peserta yang masih terbuka.
- Batas waktu ditentukan server. Untuk jawaban yang baru tersinkron setelah deadline, kebijakan penerimaan harus eksplisit; timestamp dari perangkat tidak cukup menjadi bukti bahwa jawaban dibuat sebelum deadline. Draf tetap dipertahankan untuk pemulihan/peninjauan sesuai kebijakan, tanpa menjanjikan jawaban offline pasti diterima.

### Tahap D — Keyboard biasa dan halaman peserta ringan

- Terapkan rancangan keyboard pada bagian 3 bersama kompatibilitas penilaian.
- Pisahkan Countdown dari state halaman utama. Pisahkan area soal dan navigasi; gunakan memoization yang terukur agar rumus tidak dihitung ulang setiap detik/ketukan tanpa perubahan isi soal.
- Stabilkan callback dan effect autosave/timer agar tidak terus dipasang ulang ketika jawaban berubah.
- Kurangi animasi pergantian soal yang menunda interaksi. Hormati prefers-reduced-motion; evaluasi biaya Framer Motion sebelum memutuskan menghapus dependensinya.
- Muat renderer rumus sesuai kebutuhan berdasarkan hasil pengukuran; hindari menampilkan rumus mentah atau membuat tampilan meloncat saat menunggu renderer.
- Pindahkan aset editor MathLive ke area admin. Hapus dependensi MathLive hanya jika sudah tidak digunakan di seluruh aplikasi.
- Ringkas panel timer/navigasi di ponsel agar soal dan jawaban mudah dijangkau; sediakan gulir untuk navigasi soal banyak dan pastikan input tidak tertutup keyboard.
- Tinjau deteksi blur agar interaksi keyboard, dialog perangkat, dan fitur aksesibilitas tidak memicu pelanggaran keliru. Aturan anti-kecurangan tetap mengikuti pengaturan pengajar.

### Tahap E — Kurangi request, payload, dan beban database

- Polling status memakai timeout dan satu request aktif; tambahkan jitter/backoff saat gagal. Tetapkan interval berdasarkan kebutuhan respons pause/force-submit, bukan sekadar memperlambat polling.
- Dengan interval saat ini, 100 peserta menghasilkan sekitar 20 request status/detik; 500 peserta sekitar 100 request/detik, belum termasuk save/start/submit. Ini perhitungan dari interval 5 detik, bukan hasil benchmark.
- Monitoring hanya mengambil ringkasan/progres yang berubah; detail soal tidak diunduh ulang setiap polling. Hindari cache umum 20 detik untuk status aktif; gunakan strategi kesegaran tersendiri dan invalidasi setelah aksi pengawas.
- Pisahkan pemuatan dashboard, daftar peserta, pengguna, dan penilaian menurut tampilan aktif. Tambahkan pagination/filter di server untuk daftar besar, serta cache yang terikat konteks pengguna dan dibersihkan saat logout.
- Ubah kueri monitoring agar jumlah soal dihitung sekali per ujian dan jumlah jawaban diagregasi per sesi. Validasi dengan EXPLAIN ANALYZE sebelum menambahkan indeks baru; skema sudah memiliki beberapa indeks penting.
- Batasi pemilihan kolom dan respons save menjadi konfirmasi kecil. Konfigurasikan batas pool/timeout sesuai deployment dan koneksi database; jangan menaikkan pool tanpa melihat batas total instance.
- Pindahkan gambar baru dari base64 dalam JSON ke penyimpanan aset yang sesuai, dengan batas ukuran, kompresi, dimensi responsif, dan cache. Migrasi gambar lama secara bertahap tanpa merusak soal.
- Pindahkan pemeriksaan rotasi token seluruh ujian dari setiap login ke proses yang terkoordinasi/terjadwal. Batasi pekerjaan AI dan update penilaian paralel agar tidak menghabiskan koneksi saat submit serentak.

## 5. Kriteria selesai dan skenario pengujian

Target berikut adalah kriteria yang diusulkan; harus diuji pada hosting dan kapasitas yang disepakati.

| Area | Kriteria penerimaan |
|---|---|
| Keyboard | Isian biasa, isian matematika, dan esai memakai keyboard perangkat di Android/iOS/desktop; keyboard MathLive tidak muncul pada peserta. |
| Input | Mengetik tidak memproses ulang seluruh konten rumus. Target respons interaksi p95 <= 200 ms pada perangkat uji yang disepakati. |
| Navigasi | Tampilan soal berikutnya tidak menunggu jaringan; target muncul <= 200 ms untuk soal yang sudah dimuat, di luar waktu unduh gambar. |
| Autosave | Tidak ada jawaban terbaru tertimpa pada uji respons terbalik, mengetik sambil save, flush+submit, dan dua tab. Status tersimpan hanya muncul setelah versi terbaru dikonfirmasi. |
| Pemulihan | Draf pulih setelah reload saat offline/online, tidak tercampur antarpeserta, dan sesi tetap dapat dilanjutkan setelah rotasi token. |
| Sesi | Pause/resume/refresh tidak mengubah kendali pengawas atau deadline secara keliru; urutan soal/opsi tetap. |
| Submit | Klik berulang dan request serentak menghasilkan satu penutupan; bukti penerimaan tidak menunggu AI. Target p95 penerimaan <= 2 detik pada beban yang disepakati. |
| Deadline | Uji detik terakhir, jam perangkat berbeda, tab ditutup, auto-submit pelanggaran, dan jaringan putus. Jawaban yang diterima/tidak diterima mengikuti kebijakan server dan dapat diaudit. |
| Penilaian | Jawaban teks biasa dan kunci rumus lama konsisten pada seluruh jalur; AI gagal tidak menyebabkan hasil salah diam-diam. |
| Monitoring | Perubahan pause/submit terlihat dalam batas yang disepakati, usulan <= 10 detik, tanpa mengambil ulang seluruh soal. |
| Beban | Uji start serentak, mengetik/save, monitoring, dan submit serentak; catat error, p95/p99, CPU, memori, waktu kueri, serta koneksi database. Tidak menjanjikan kapasitas sebelum hasil ini ada. |

Pengujian prioritas: integrasi API untuk otorisasi/transaksi/revisi/submit; pengujian UI alur utama dan pemulihan; kasus penilaian matematika; pengujian beban terhadap data uji; profiling halaman produksi. Lint, TypeScript, dan build tetap menjadi pemeriksaan dasar, bukan bukti bahwa alur ujian atau kapasitas telah aman.

## 6. Urutan pengerjaan dan keputusan terbuka

Urutan: ukur kondisi awal → amankan jawaban/sesi → submit konsisten → keyboard biasa dan render ringan → monitoring/payload/database → uji beban dan rilis bertahap.

Keyboard biasa dapat dikerjakan sebagai perubahan awal yang kecil bila kompatibilitas kunci lama diuji bersamaan. Untuk kesiapan ujian sebenarnya, masalah kehilangan jawaban dan penutupan sesi tetap menjadi prioritas tertinggi.

Keputusan yang belum diketahui: kapasitas peserta bersamaan; spesifikasi hosting/database; aturan durasi versus akhir jadwal/perpanjangan pause; kebijakan jawaban yang tersinkron setelah deadline; jenis ekspresi matematika yang harus dikenali. Tidak perlu memutuskan desain ulang atau migrasi framework untuk menjalankan rencana ini.

## 7. Hasil pemeriksaan dasar

- Lint: lulus tanpa peringatan.
- TypeScript: lulus pemeriksaan tipe.
- Build produksi: belum terverifikasi; proses dihentikan setelah beberapa menit tanpa hasil akhir di tahap kompilasi. Penyebabnya belum didiagnosis, sehingga ini tidak dinyatakan sebagai kegagalan kode.
- Belum dilakukan uji browser, alur ujian terhadap database, atau benchmark beban; tidak ada klaim performa produksi dari pemeriksaan kode ini.
