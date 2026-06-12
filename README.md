# 🔴 Live Terjadwal (Automated 24/7 YouTube Live Streaming)

Live Terjadwal adalah sistem otomasi siaran langsung (Live Streaming) YouTube yang dapat berjalan selama 24 jam penuh tanpa henti. Aplikasi ini dilengkapi dengan pengelola jadwal yang canggih, pengacak media (Randomized Playlist), dan integrasi API YouTube secara asli.

Sistem ini didesain menggunakan **React.js** untuk antarmuka pengguna yang modern, dan **Node.js + SQLite + FFmpeg** sebagai mesin penggerak (*backend engine*) yang sanggup melayani banyak jadwal secara paralel.

---

## 🏗️ Struktur Proyek

```text
📦 Live Terjadwal
 ┣ 📂 src
 ┃ ┣ 📂 components       # Komponen antarmuka yang dapat digunakan ulang
 ┃ ┃ ┣ 📜 Layout.jsx     # Kerangka utama aplikasi (Sidebar & Topbar)
 ┃ ┃ ┗ 📜 Modal.jsx      # Kumpulan jendela *Pop-up* (Alert, Confirm, Prompt)
 ┃ ┣ 📂 engine           # Jantung Aplikasi (Backend Worker)
 ┃ ┃ ┗ 📜 streamEngine.js # Penjadwal cron & perakit proses FFmpeg -> YouTube
 ┃ ┣ 📂 pages            # Halaman Antarmuka (UI)
 ┃ ┃ ┣ 📜 Accounts.jsx   # Manajemen Multi-Client Google OAuth
 ┃ ┃ ┣ 📜 Dashboard.jsx  # Beranda utama
 ┃ ┃ ┣ 📜 Media.jsx      # Manajer file unggahan (MP4/PNG) dan perakit Playlist
 ┃ ┃ ┣ 📜 Monitoring.jsx # Dasbor pantauan CPU, RAM, Disk, dan Status Stream
 ┃ ┃ ┗ 📜 Schedule.jsx   # Pembuatan kalender siaran langsung
 ┃ ┣ 📜 App.jsx          # Titik kumpul rute *Frontend*
 ┃ ┣ 📜 index.css        # Gaya Global & Tailwind CSS
 ┃ ┗ 📜 main.jsx         # Titik masuk React (React Root)
 ┣ 📂 uploads            # [Folder Auto-Generate] Tempat file MP4/Playlist lokal disimpan
 ┣ 📜 server.js          # REST API Server, Autentikasi Google, dan Manajemen Database SQLite
 ┣ 📜 stream_data.sqlite # [Auto-Generate] Basis data lokal (Akun, Jadwal, Playlist)
 ┣ 📜 package.json       # Daftar *Library* Dependencies
 ┣ 📜 vite.config.js     # Konfigurasi bundler Vite
 ┗ 📜 .env               # [Opsional] Variabel lingkungan tambahan
```

---

## 🚀 Fitur Unggulan

1. **Multi-Client Dynamic OAuth:**
   Berbeda dengan aplikasi pada umumnya, Anda bisa memasukkan `Client ID` dan `Client Secret` dari Google Cloud Project yang berbeda-beda untuk setiap akun YouTube. Ini mengisolasi risiko pemblokiran kuota API harian Google (*Rate Limit*).

2. **FFmpeg Multi-Threading Engine:**
   Sistem di `streamEngine.js` dapat membaca tabel jadwal setiap menit dan menembakkan video MP4 ke RTMP YouTube secara acak (berkat fitur *Randomizer Array* dan *Concat Demuxer* bawaan FFmpeg). Banyak jadwal di jam yang sama? Sistem akan membuat cabang *proses FFmpeg* paralel yang tidak saling mengganggu!

3. **Dashboard Resource Monitoring:**
   Memantau kondisi "nyawa" peladen (VPS) Anda seperti CPU Core, % pemakaian RAM, ruang Hard Disk (`check-disk-space`), hingga kemampuan untuk Mematikan Paksa (*Force Stop* / *SIGKILL*) *stream* yang bermasalah secara *real-time*.

4. **File & Playlist Manager Independen:**
   Halaman media yang bergaya "Google Drive", memungkinkan Anda mengelompokkan berbagai file video promosi atau latar belakang siaran ke dalam sistem "Playlist".

5. **Arsitektur Multi-Tenant (Privasi Ketat):**
   Aplikasi ini dirancang untuk dapat melayani banyak penyewa (*renter*) dalam satu instance server (SaaS). Semua data jadwal, video, dan kredensial YouTube difilter menggunakan Token Kriptografi (HMAC-SHA256) sehingga User A dipastikan tidak akan bisa melihat atau mengganggu data milik User B.

---

## 🛠️ Panduan Instalasi & Menjalankan Aplikasi

### Persyaratan Sistem:
- **Node.js** (Minimal versi 18.x)
- **FFmpeg** terinstal secara global di OS Anda dan telah ditambahkan ke dalam `Environment Variables / PATH`. Anda dapat memverifikasinya dengan menjalankan perintah `ffmpeg -version` di terminal.

### Cara Menjalankan:
1. **Clone/Download** repositori ini.
2. Buka terminal di dalam direktori aplikasi.
3. Jalankan `npm install` untuk memasang semua pustaka yang dibutuhkan.
4. Jalankan perintah dewa: 
   ```bash
   npm run dev
   ```
   Perintah ini menggunakan `concurrently` untuk menghidupkan *Backend Server* (Port `3001`) dan *Frontend Vite* (Port `5173`) secara bersamaan.
5. Akses `http://localhost:5173` di peramban (browser) Anda.

---

## 🗄️ Skema Database (SQLite)

- **`accounts`**: Menyimpan ID, Nama YouTube Asli, *Avatar*, *Tokens JSON*, `client_id`, `client_secret`, dan `user_id`.
- **`files`**: Melacak nama file yang terunggah (berada di folder `/uploads`), ukuran, tipe, url lokal, dan `user_id`.
- **`playlists`**: Menyimpan *array JSON* berisi deretan media yang sudah dirakit dan `user_id`.
- **`schedules`**: Mencatat waktu *Start* dan *End*, referensi akun, referensi Playlist, `user_id`, dan yang terpenting: status saat ini (`pending`, `starting`, `live`, `completed`, `error`).
- **`oauth_sessions`**: Penyimpanan transit rahasia agar proses Google OAuth dapat bekerja untuk sistem multi-klien (disertai `user_id`).

---
*Didesain dan dibangun dengan kecintaan tingkat tinggi pada keindahan arsitektur.*
