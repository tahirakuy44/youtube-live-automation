# 📚 Dokumentasi API Terjadwal Live (Headless Server)

Karena sistem keamanan sekarang menggunakan **Master API Key**, Anda dapat mengontrol *Backend* aplikasi ini sepenuhnya dari peladen web lain (contoh: Laravel, Python, PHP, atau cURL).

Semua permintaan API (kecuali proses *Upload* via `multipart/form-data`) harus menggunakan tipe konten `application/json`.

## 🔐 Autentikasi (WAJIB)

Setiap *Request* HTTP yang Anda kirimkan **WAJIB** menyertakan *Header* berikut:

```http
Authorization: Bearer ISI_DENGAN_API_KEY_DARI_ENV
```

Jika tidak disertakan atau salah, server akan merespon dengan `HTTP 401 Unauthorized`.

---

## 📊 1. Statistik & Monitoring

### `GET /api/stats`
Mengambil data sumber daya peladen secara waktu nyata (CPU, RAM, Hard Disk, Uptime).

**Response (200 OK):**
```json
{
  "cpu": "12.5",
  "ram": "45.2",
  "disk": "60.1",
  "uptime": "2 Days, 5 Hours",
  "activeStreams": 2
}
```

---

## 📅 2. Manajemen Jadwal Siaran (Schedules)

### `GET /api/schedules`
Mengambil daftar semua jadwal siaran langsung (yang sudah tayang maupun yang belum).

**Response (200 OK):**
```json
[
  {
    "id": "sch_162391039",
    "title": "Promo Akhir Tahun",
    "startDate": "2026-06-15",
    "startTime": "19:00",
    "endDate": "2026-06-15",
    "endTime": "21:00",
    "accountId": "acc_18218921",
    "playlistId": "pl_102120",
    "streamKey": "xxxx-xxxx-xxxx-xxxx",
    "status": "pending"
  }
]
```
*(Status yang mungkin: `pending`, `starting`, `live`, `completed`, `error`)*

### `POST /api/schedules`
Membuat atau memperbarui jadwal siaran.
Jika `id` tidak diisi atau acak, sistem akan membuat jadwal baru. Jika `id` sama dengan yang sudah ada di *database*, sistem akan menimpa/memperbaruinya.

**Body Payload:**
```json
{
  "id": "sch_12345", 
  "title": "Live 24 Jam",
  "startDate": "2026-06-12",
  "startTime": "20:00",
  "endDate": "2026-06-13",
  "endTime": "20:00",
  "accountId": "acc_1111",
  "playlistId": "pl_2222",
  "streamKey": "abcd-efgh-ijkl-mnop"
}
```

### `DELETE /api/schedules/:id`
Menghapus jadwal dari *database*. (Tidak bisa mematikan mesin FFmpeg yang sedang berjalan, ini murni hapus data).

### `POST /api/schedules/:id/stop`
Membunuh (*Force Stop* / SIGKILL) mesin FFmpeg untuk jadwal tertentu yang saat ini berstatus `live`.

**Response (200 OK):**
```json
{ "message": "Stream stopped successfully" }
```

---

## 🎬 3. Manajemen Playlist (Rangkaian Video)

### `GET /api/playlists`
Mengambil daftar semua *Playlist*.

**Response (200 OK):**
```json
[
  {
    "id": "pl_999",
    "name": "Kumpulan Video Jualan",
    "items": [
      { "id": "file_123", "url": "/uploads/video1.mp4", "name": "Baju.mp4" }
    ]
  }
]
```

### `POST /api/playlists`
Membuat atau mengubah Playlist. Data `items` harus berisi *Array of Objects* yang minimal memiliki properti `url` agar mesin FFmpeg bisa membacanya.

**Body Payload:**
```json
{
  "id": "pl_999",
  "name": "Kumpulan Video Jualan",
  "items": [
    { "id": "file_123", "url": "/uploads/video1.mp4" }
  ]
}
```

### `DELETE /api/playlists/:id`
Menghapus *Playlist*.

---

## 🗂️ 4. File Manager (Media & Upload)

### `GET /api/files`
Mengambil semua data file media (MP4/PNG/JPG) yang sudah diunggah.

### `POST /api/upload`
Mengunggah file (Video/Gambar) ke peladen `uploads/`.

**Tipe Konten:** `multipart/form-data`
**Parameter Form:**
- `mediaFile`: [Isi File Binary Anda]
- `folderId`: (Opsional, bawaan: `'all'`)

**Contoh via cURL:**
```bash
curl -X POST https://domain-anda.com/api/upload \
  -H "Authorization: Bearer KUNCI_RAHASIA" \
  -F "mediaFile=@C:/video-jualan.mp4" \
  -F "folderId=all"
```

### `DELETE /api/files/:id`
Menghapus rekaman file dari *database* DAN menghapus file fisik aslinya dari folder `/uploads` di *hard disk* server.

---

## 👤 5. YouTube Accounts

### `GET /api/accounts`
Menampilkan daftar akun YouTube yang berhasil Anda integrasikan beserta nama *Channel* dan Avatar. (Tidak menampilkan *Token Rahasia* untuk keamanan).

### `DELETE /api/accounts/:id`
Mencabut koneksi akun YouTube dan menghapusnya dari *database*.
