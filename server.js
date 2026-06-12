/* eslint-disable no-undef */
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import 'dotenv/config';
import { google } from 'googleapis';
import os from 'os';
import checkDiskSpace from 'check-disk-space';
import { initStreamEngine, stopStream } from './src/engine/streamEngine.js';

const app = express();
const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors());
app.use(express.json());

// 1. Setup Uploads Folder
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 2. Setup SQLite Database
let db;
async function initDb() {
  db = await open({
    filename: path.join(process.cwd(), 'stream_data.sqlite'),
    driver: sqlite3.Database
  });

  // Create tables if not exists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT,
      url TEXT,
      type TEXT,
      size INTEGER,
      folderId TEXT,
      uploadTime DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT,
      items TEXT
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      title TEXT,
      startDate TEXT,
      startTime TEXT,
      endDate TEXT,
      endTime TEXT,
      accountId TEXT,
      mediaSource TEXT,
      description TEXT,
      category TEXT,
      tags TEXT,
      privacy TEXT,
      thumbnail TEXT,
      status TEXT DEFAULT 'pending',
      broadcast_id TEXT,
      stream_id TEXT,
      video_quality TEXT DEFAULT '720p',
      background_music TEXT DEFAULT 'none',
      loop_mode TEXT DEFAULT 'infinite'
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      youtube_name TEXT,
      avatar_url TEXT,
      credentials_json TEXT,
      client_id TEXT,
      client_secret TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_sessions (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      client_secret TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Backward compatibility: add columns if not exists
  try { await db.run('ALTER TABLE accounts ADD COLUMN client_id TEXT'); } catch { /* ignore if exists */ }
  try { await db.run('ALTER TABLE accounts ADD COLUMN client_secret TEXT'); } catch { /* ignore if exists */ }
  
  try { await db.run('ALTER TABLE schedules ADD COLUMN status TEXT DEFAULT "pending"'); } catch { /* ignore */ }
  try { await db.run('ALTER TABLE schedules ADD COLUMN broadcast_id TEXT'); } catch { /* ignore */ }
  try { await db.run('ALTER TABLE schedules ADD COLUMN stream_id TEXT'); } catch { /* ignore */ }
  try { await db.run('ALTER TABLE schedules ADD COLUMN video_quality TEXT DEFAULT "720p"'); } catch { /* ignore */ }
  try { await db.run('ALTER TABLE schedules ADD COLUMN background_music TEXT DEFAULT "none"'); } catch { /* ignore */ }
  try { await db.run('ALTER TABLE schedules ADD COLUMN loop_mode TEXT DEFAULT "infinite"'); } catch { /* ignore */ }

  console.log('Database SQLite initialized successfully.');
  
  // Mulai mesin FFmpeg
  initStreamEngine(db);
}
initDb().catch(console.error);

// 3. Multer Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique name
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });

// Provide static access to uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// [EXTERNAL AUTH PROXY]
// Mengirimkan kredensial ke server pusat sebelum memberikan API Key
app.post('/api/auth/external-login', async (req, res) => {
  const { username, password } = req.body;
  const externalAuthUrl = process.env.EXTERNAL_AUTH_URL;

  // Jika URL Eksternal belum disetel, sediakan mekanisme darurat (fallback)
  if (!externalAuthUrl || externalAuthUrl.includes('nama-web-anda.com')) {
    if (username === 'admin' && password === (process.env.API_KEY || 'kunci_rahasia_admin_123')) {
      return res.json({ apiKey: process.env.API_KEY || 'kunci_rahasia_admin_123' });
    }
    return res.status(401).json({ error: 'Sistem Eksternal belum di-setup di .env. Gunakan username "admin" dan password API KEY Anda untuk sementara.' });
  }

  try {
    // Memanggil API server Laravel/Eksternal
    const extRes = await fetch(externalAuthUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (extRes.ok) {
      // Jika server eksternal merespon 200 OK, berikan Master API Key
      return res.json({ apiKey: process.env.API_KEY || 'kunci_rahasia_admin_123' });
    } else {
      return res.status(401).json({ error: 'Kredensial ditolak oleh Web Server Utama Anda.' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menghubungi Web Server Utama. ' + error.message });
  }
});

// [API SECURITY MIDDLEWARE]
// Melindungi seluruh akses ke /api agar hanya bisa diakses menggunakan Master API Key
app.use('/api', (req, res, next) => {
  // Pengecualian: Rute Auth dan Google Callback
  if (req.path.startsWith('/auth/')) return next();

  const apiKey = process.env.API_KEY || 'kunci_rahasia_admin_123';
  const authHeader = req.headers['authorization'];
  const providedKey = authHeader ? authHeader.split(' ')[1] : req.headers['x-api-key'];

  if (!providedKey || providedKey !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing Master API Key' });
  }
  next();
});

// --- API ENDPOINTS ---

// [FILES API]
app.get('/api/files', async (req, res) => {
  try {
    const files = await db.all('SELECT * FROM files ORDER BY uploadTime DESC');
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload', upload.single('mediaFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Determine file type category based on mimetype
  let fileType = 'other';
  if (req.file.mimetype.startsWith('video/')) fileType = 'video';
  else if (req.file.mimetype.startsWith('audio/')) fileType = 'audio';
  else if (req.file.mimetype.startsWith('image/')) fileType = 'image';

  const fileData = {
    id: 'file_' + Date.now(),
    name: req.file.originalname,
    url: '/uploads/' + req.file.filename,
    type: fileType,
    size: req.file.size,
    folderId: req.body.folderId || 'all'
  };

  try {
    await db.run(
      'INSERT INTO files (id, name, url, type, size, folderId) VALUES (?, ?, ?, ?, ?, ?)',
      [fileData.id, fileData.name, fileData.url, fileData.type, fileData.size, fileData.folderId]
    );
    res.json({ message: 'File uploaded successfully', file: fileData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/files/:id', async (req, res) => {
  try {
    const file = await db.get('SELECT * FROM files WHERE id = ?', [req.params.id]);
    if (file) {
      const filePath = path.join(process.cwd(), file.url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      await db.run('DELETE FROM files WHERE id = ?', [req.params.id]);
    }
    res.json({ message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [PLAYLISTS API]
app.get('/api/playlists', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM playlists');
    const playlists = rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
    res.json(playlists);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/playlists', async (req, res) => {
  try {
    const { id, name, items } = req.body;
    await db.run(
      'INSERT INTO playlists (id, name, items) VALUES (?, ?, ?)',
      [id, name, JSON.stringify(items)]
    );
    res.json({ message: 'Playlist saved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/playlists/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM playlists WHERE id = ?', [req.params.id]);
    res.json({ message: 'Playlist deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [SCHEDULES API]
app.get('/api/schedules', async (req, res) => {
  try {
    const schedules = await db.all('SELECT * FROM schedules');
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/schedules', async (req, res) => {
  try {
    const { id, title, startDate, startTime, endDate, endTime, accountId, mediaSource, description, category, tags, privacy, thumbnail, video_quality, background_music, loop_mode } = req.body;
    await db.run(
      `INSERT OR REPLACE INTO schedules 
      (id, title, startDate, startTime, endDate, endTime, accountId, mediaSource, description, category, tags, privacy, thumbnail, video_quality, background_music, loop_mode) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, startDate, startTime, endDate, endTime, accountId, mediaSource, description, category, tags, privacy, thumbnail, video_quality || '720p', background_music || 'none', loop_mode || 'infinite']
    );
    res.json({ message: 'Schedule saved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/schedules/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM schedules WHERE id = ?', [req.params.id]);
    res.json({ message: 'Schedule deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [MONITORING API]
app.get('/api/stats', async (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  let disk = { free: 0, size: 0 };
  try {
    const diskPath = process.platform === 'win32' ? 'C:' : '/';
    disk = await checkDiskSpace(diskPath);
  } catch (err) {
    console.error('Failed to get disk space', err);
  }
  
  res.json({
    cpu: os.cpus()[0].model,
    cpuCores: os.cpus().length,
    ramTotal: (totalMem / 1024 / 1024 / 1024).toFixed(2),
    ramUsed: (usedMem / 1024 / 1024 / 1024).toFixed(2),
    uptime: process.uptime(),
    diskTotal: (disk.size / 1024 / 1024 / 1024).toFixed(2),
    diskFree: (disk.free / 1024 / 1024 / 1024).toFixed(2),
    diskUsed: ((disk.size - disk.free) / 1024 / 1024 / 1024).toFixed(2)
  });
});

app.post('/api/schedules/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    await stopStream(db, id);
    res.json({ message: 'Stream stopped successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [ACCOUNTS API]
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await db.all('SELECT id, youtube_name, avatar_url, created_at FROM accounts ORDER BY created_at DESC');
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/youtube/url', async (req, res) => {
  try {
    const { client_id, client_secret } = req.body;
    if (!client_id || !client_secret) return res.status(400).json({ error: 'Client ID and Secret are required' });

    const sessionId = 'session_' + Date.now() + Math.random().toString(36).substring(7);
    
    await db.run(
      'INSERT INTO oauth_sessions (id, client_id, client_secret) VALUES (?, ?, ?)',
      [sessionId, client_id, client_secret]
    );

    const tempClient = new google.auth.OAuth2(
      client_id,
      client_secret,
      BASE_URL + '/api/auth/youtube/callback'
    );

    const url = tempClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/youtube'],
      state: sessionId
    });

    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/youtube/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing code or state');

  try {
    const session = await db.get('SELECT * FROM oauth_sessions WHERE id = ?', [state]);
    if (!session) return res.status(400).send('Invalid or expired session');

    const oauth2Client = new google.auth.OAuth2(
      session.client_id,
      session.client_secret,
      BASE_URL + '/api/auth/youtube/callback'
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Ambil info channel YouTube pengguna
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelRes = await youtube.channels.list({ part: 'snippet', mine: true });
    
    if (!channelRes.data.items || channelRes.data.items.length === 0) {
      return res.status(400).send('No YouTube channel found for this Google account.');
    }

    const channel = channelRes.data.items[0];
    const id = channel.id;
    const youtube_name = channel.snippet.title;
    const avatar_url = channel.snippet.thumbnails.default.url;
    const credentials_json = JSON.stringify(tokens);

    await db.run(
      'INSERT OR REPLACE INTO accounts (id, youtube_name, avatar_url, credentials_json, client_id, client_secret) VALUES (?, ?, ?, ?, ?, ?)',
      [id, youtube_name, avatar_url, credentials_json, session.client_id, session.client_secret]
    );

    // Hapus sesi
    await db.run('DELETE FROM oauth_sessions WHERE id = ?', [state]);

    // Kembali ke frontend setelah berhasil login
    res.redirect(FRONTEND_URL + '/accounts');
  } catch (error) {
    console.error('OAuth Error:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

app.delete('/api/accounts/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM accounts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Account disconnected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`API Server is running on http://localhost:${PORT}`);
});
