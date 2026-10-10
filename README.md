# 🎓 Sistem Ujian Online

**Platform Computer-Based Testing (CBT) berbasis web untuk dosen, pengelola ujian, dan mahasiswa.**

Peserta mengerjakan ujian menggunakan **NIM dan token**, sedangkan pengelola dapat menyiapkan soal, memantau pengerjaan, dan melihat hasil ujian.

**[🌐 Demo](https://sistem-ujian-online-six.vercel.app/)** · **[💻 Repository](https://github.com/zainularifinspt/sistem-ujian-online)**

## ✨ Fitur Utama

- **Manajemen ujian:** atur soal, peserta, jadwal, token, dan pengacakan.
- **Beragam tipe soal:** pilihan ganda, isian, dan uraian, termasuk rumus matematika.
- **Pengerjaan ujian:** timer, navigasi soal, autosave, dan pemulihan sesi.
- **Monitoring:** pantau progres peserta dan catatan aktivitas/pelanggaran browser.
- **Penilaian:** pemeriksaan otomatis, manual, dan bantuan AI opsional; ekspor hasil ke Excel.

## 🛠️ Teknologi

**Next.js · React · TypeScript · Tailwind CSS · PostgreSQL · Drizzle ORM**

## 🚀 Menjalankan di Komputer Lokal

Pastikan **Node.js 20+**, **Git**, dan **Docker** sudah terpasang.

```bash
git clone https://github.com/zainularifinspt/sistem-ujian-online.git
cd sistem-ujian-online
npm ci
docker compose up -d
cp .env.example .env.local
```

Sesuaikan `DATABASE_URL`, `BETTER_AUTH_SECRET`, dan `BETTER_AUTH_URL` pada `.env.local`. Lalu jalankan:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

- **Halaman peserta:** http://localhost:3000
- **Panel pengelola:** http://localhost:3000/admin

> `db:seed` digunakan untuk membuat data contoh saat pengujian lokal. Jangan gunakan kredensial contoh di server produksi.

## ✅ Kelebihan

- Alur ujian terintegrasi dari persiapan hingga penilaian.
- Peserta tidak perlu membuat akun; cukup NIM dan token.
- Mendukung soal matematika dan penilaian yang fleksibel.
- Dapat dipasang sendiri dengan database PostgreSQL.

## ⚠️ Keterbatasan

- Deteksi pelanggaran berbasis browser **tidak menjamin ujian bebas kecurangan**.
- Penilaian uraian dan hasil bantuan AI mungkin tetap memerlukan verifikasi dosen.
- Perlu uji keamanan, kapasitas server, dan perangkat sebelum dipakai untuk ujian resmi berskala besar.

**Status:** proyek masih dikembangkan. Saran dan laporan masalah dapat disampaikan melalui [GitHub Issues](https://github.com/zainularifinspt/sistem-ujian-online/issues).
