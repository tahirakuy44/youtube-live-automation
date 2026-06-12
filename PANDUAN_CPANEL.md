# 🚀 Panduan Deployment "Streaming Pulse" & "Live Terjadwal"

Dokumen ini adalah panduan lengkap dari awal sampai akhir tentang cara meluncurkan kedua aplikasi yang telah kita bangun ke peladen produksi (seperti **cPanel** dan **VPS**).

Karena arsitektur kita memiliki dua jantung yang berbeda, proses *deployment* dibagi menjadi dua tahap.

---

## TAHAP 1: Mengunggah Management Server (PHP) ke cPanel
Tahap ini untuk menghidupkan *Landing Page* (Tabel Harga) dan *Panel Admin Pusat* di domain utama Anda (misal: `www.streaming-pulse.com`). Ini sangat mudah karena murni menggunakan PHP.

### Langkah-langkah:
1. Buka folder `F:\management-server` di komputer Anda.
2. Blok semua *file* dan *folder* yang ada di dalamnya (seperti `admin`, `api`, `includes`, `index.php`, dll).
3. Klik kanan dan jadikan satu file kompresi (Pilih **Compress to ZIP file**). Beri nama bebas, misal `manajemen.zip`.
4. Buka peramban Anda dan *Login* ke akun **cPanel** `streaming-pulse.com`.
5. Masuk ke menu **File Manager** -> buka folder `public_html`.
6. Klik tombol **Upload** di bagian atas, lalu pilih file `manajemen.zip` yang tadi Anda buat.
7. Setelah selesai, kembali ke `public_html`, klik kanan pada `manajemen.zip`, lalu pilih **Extract**.
8. **Selesai!** Anda sekarang bisa membuka `https://www.streaming-pulse.com` dan melihat *Landing Page* Anda.
   - Untuk masuk ke panel pengelola: Buka `https://www.streaming-pulse.com/admin`
   - Gunakan akun standar Anda: `Lotuytea` / `Hidrogen12`

---

## TAHAP 2: Memasang Mesin "Live Terjadwal" (Node.js & FFmpeg)
Aplikasi utama ini bertugas menyiarkan video 24/7 menggunakan alat berat bernama **FFmpeg**. Oleh karena itu, aplikasi ini **SANGAT DISARANKAN** diunggah ke sebuah **VPS (Virtual Private Server)**, baik menggunakan *aaPanel* maupun *Command Line (SSH)*, karena *cPanel* reguler biasanya memblokir program yang berjalan 24 jam nonstop.

### Persiapan di Komputer Lokal Anda (Build React)
Sebelum diunggah, kita harus memadatkan file antarmuka (React) Anda:
1. Buka Terminal di folder `F:\Live terjadwal`.
2. Jalankan perintah: `npm run build`
3. Akan muncul folder baru bernama `dist`. 

### Langkah Instalasi di VPS (Menggunakan Git):
1. **Pemasangan Git, Node.js & FFmpeg:**
   - Buka Terminal SSH VPS Anda.
   - Pastikan **Git**, **Node.js** dan **FFmpeg** sudah terinstal. 
   - *(Jika menggunakan Ubuntu, Anda bisa menginstalnya dengan mengetik: `sudo apt update && sudo apt install git nodejs npm ffmpeg -y`)*
2. **Kloning Proyek dari GitHub:**
   - Masuk ke direktori web Anda (misal: `cd /www/wwwroot/`)
   - Tarik (Clone) kode proyek langsung dari brankas GitHub Anda:
     `git clone https://github.com/tahirakuy44/youtube-live-automation.git live-engine`
   - Masuk ke dalam folder tersebut: `cd live-engine`
   - Instal seluruh perpustakaan aplikasi: `npm install`
3. **Membangun Antarmuka (Build React):**
   - Jalankan perintah ini di Terminal VPS: `npm run build`
   - Ini akan merakit antarmuka React kita (membuat folder `dist`) agar siap diakses publik.
4. **Pengaturan Konfigurasi (`.env`):**
   - Buat file `.env` di dalam folder `live-engine` di server Anda dengan isi seperti ini:
     ```env
     BASE_URL=http://<IP_VPS_ANDA>:3001
     FRONTEND_URL=http://<IP_VPS_ANDA>:5173
     API_KEY=kunci_rahasia_admin_123
     EXTERNAL_AUTH_URL=https://www.streaming-pulse.com/api/verify-login.php
     ```
5. **Menjalankan Mesin Selamanya (PM2):**
   - Agar aplikasi tidak mati saat Anda menutup Terminal SSH, kita gunakan alat bernama PM2.
   - Instal PM2 secara global: `npm install -g pm2`
   - Nyalakan mesin: `pm2 start server.js --name "LiveEngine"`
6. **Selesai!** 
   - Anda sekarang bisa mengakses Panel Admin pelanggan di IP Server Anda.
   - Seluruh pelanggan yang Anda buat di cPanel (`www.streaming-pulse.com`) kini bisa digunakan untuk *Login* ke mesin yang ada di VPS ini!

---

### Catatan Penting untuk Sistem "Background Music" & "Copy Quality"
- Opsi `Video Quality: Copy` pada *Live Schedule* tidak menggunakan CPU, tapi menuntut spesifikasi video di *playlist* untuk identik secara dimensi dan FPS. Jika tidak, mesin siaran akan putus di tengah jalan.
- File-file *Video* dan *Background Music* yang diunggah akan tersimpan di dalam folder `uploads` pada VPS. Pastikan VPS Anda memiliki ruang penyimpanan (Disk Space) yang cukup jika banyak pelanggan yang mengunggah video.

---

### 🚨 Troubleshooting (Daftar Masalah yang Pernah Diperbaiki)

Selama pengembangan, kami pernah menghadapi dan menambal celah-celah *error* krusial berikut. Jika di masa depan Anda mengembangkan ulang aplikasi ini, harap perhatikan poin ini:

1. **Bug: Kategori YouTube (*Category ID*) tidak terunggah saat membuat jadwal baru.**
   - **Penyebab:** Dokumentasi YouTube Data API tidak mengizinkan kita menyisipkan `categoryId` secara langsung bersamaan dengan pembuatan `liveBroadcasts.insert` (Status Code 400).
   - **Solusinya:** Kategori dan *Tags* disisipkan melalui panggilan fungsi terpisah (`youtube.videos.update`) **setelah** jadwal (*Broadcast*) berhasil dibuat. (Kode perbaikan ini ada di `src/engine/streamEngine.js`).

2. **Celah Keamanan: Privasi Penyewa Bocor (Semua Jadwal Campur Aduk).**
   - **Penyebab:** Aplikasi awalnya berjalan secara *Single-Tenant* dengan menggunakan satu `API_KEY` master di semua klien yang meminjam *server* `livepush.web.id`. Ini membuat User A bisa melihat akun YouTube User B.
   - **Solusinya:** Migrasi ke arsitektur **Multi-Tenant (SaaS)** secara penuh. Penambahan kolom `user_id` di *database* SQLite. *Backend* `server.js` dimodifikasi agar menerbitkan *JWT Token* (berbasis HMAC kriptografi) pada saat *login* yang mengikat *username* penyewa. Semua pengambilan dan penghapusan tabel API difilter secara ketat dengan `WHERE user_id = ?`.

3. **Bug: Sidebar Selalu Muncul "Admin" Walau Penyewa Berbeda.**
   - **Penyebab:** Teks tersebut di-*hardcode* atau tertinggal dalam sesi penjelajah (*browser*) lama.
   - **Solusinya:** Menambahkan mekanisme penyimpanan identitas di `Login.jsx` (`localStorage.setItem('username', ...)`) dan mengubah `Layout.jsx` untuk menampilkannya secara dinamis. Pastikan pengguna me-*logout* akun lama mereka setelah aplikasi diperbarui.
