# Product Requirements Document (PRD)
## Sistem Ujian Online Mahasiswa Berbasis Token

### 1. Ringkasan Produk
Sistem Ujian Online adalah platform berbasis web yang memungkinkan institusi kampus menyelenggarakan ujian secara digital dengan fokus pada:
- Meminimalkan potensi kecurangan.
- Mempermudah akses peserta menggunakan NIM dan Token.
- Mempermudah proses penilaian dan rekapitulasi nilai.
- Menyediakan analitik hasil ujian yang lengkap.
- Menghilangkan kebutuhan akun mahasiswa.

## 2. Tujuan Produk
### Tujuan Utama
- Menyelenggarakan ujian online secara aman.
- Mengurangi peluang kecurangan peserta.
- Mengotomatisasi proses penilaian.
- Mempermudah pengelolaan peserta dan ujian.
- Mempercepat proses rekap nilai.

### KPI
- 90% penilaian otomatis untuk PG dan Isian Singkat.
- Waktu rekap nilai berkurang >80%.
- Tingkat kegagalan submit <1%.
- Waktu pembuatan ujian <15 menit.

## 3. User Roles
### Admin
- Membuat, mengubah, menghapus paket ujian.
- Mengelola peserta.
- Melakukan penilaian esai.
- Melihat laporan dan analitik.

## 4. Akses Peserta
- Login menggunakan NIM + Token Ujian.
- Token dapat digunakan banyak mahasiswa selama masa berlaku.
- Hanya NIM yang telah didaftarkan admin yang dapat mengikuti ujian.
- Satu NIM hanya dapat mengerjakan satu kali.
- Admin dapat melakukan reset peserta.

## 5. Fitur Utama
### Paket Ujian
- Nama ujian
- Deskripsi
- Token
- Durasi
- Tanggal mulai & berakhir
- Pengacakan soal
- Pengacakan opsi jawaban

### Tipe Soal
- Pilihan Ganda
- Isian Singkat (auto grading)
- Esai (manual grading)

### Auto Save
- Setiap 5 detik
- Saat jawaban berubah
- Saat pindah soal

### Anti Kecurangan
- Disable copy/cut/paste
- Disable klik kanan
- Disable shortcut umum
- Deteksi perpindahan tab
- 3 pelanggaran = submit otomatis

## 6. Manajemen Peserta
### Input Manual
- NIM
- Nama
- Prodi
- Kelas

### Import Excel
- Validasi duplikasi
- Preview data
- Import massal

## 7. Dashboard Admin
- Total ujian
- Ujian aktif
- Ujian selesai
- Total peserta
- Total pelanggaran
- Statistik nilai

## 8. Penilaian
### Otomatis
- Pilihan Ganda
- Isian Singkat

### Manual
- Esai

## 9. Analitik
- Nilai tertinggi
- Nilai terendah
- Rata-rata
- Median
- Distribusi nilai
- Analisis soal
- Analisis pelanggaran

## 10. Export
- Excel (.xlsx)
- PDF

## 11. Teknologi
### Frontend
- Next.js
- TypeScript
- Tailwind CSS

### Backend
- Laravel 12 API atau NestJS

### Database
- PostgreSQL

### Deployment
- Docker
- Nginx
- Ubuntu Server
