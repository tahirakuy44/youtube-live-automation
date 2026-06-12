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
import crypto from 'crypto';
import checkDiskSpace from 'check-disk-space';
import { initStreamEngine, stopStream } from './src/engine/streamEngine.js';

const app = express();
const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors());
app.use(express.json());

// [SYSTEM LOGGER]
const systemLogs = [];
const maxLogs = 500;

function addLog(type, message) {
  const timestamp = new Date().toISOString();
  systemLogs.push({ timestamp, type, message });
  if (systemLogs.length > maxLogs) systemLogs.shift();
}

const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

console.log = function(...args) {
  origLog.apply(console, args);
  addLog('INFO', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};
console.warn = function(...args) {
  origWarn.apply(console, args);
  addLog('WARN', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};
console.error = function(...args) {
  origError.apply(console, args);
  addLog('ERROR', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};

app.get('/api/logs', (req, res) => {
  res.json(systemLogs);
});

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
      user_id TEXT,
      uploadTime DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT,
      items TEXT,
      user_id TEXT
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
      loop_mode TEXT DEFAULT 'infinite',
      rtmp_url TEXT,
      stream_name TEXT,
      use_custom_rtmp TEXT DEFAULT 'false',
      user_id TEXT
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      youtube_name TEXT,
      avatar_url TEXT,
      credentials_json TEXT,
      client_id TEXT,
      client_secret TEXT,
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_sessions (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      client_secret TEXT,
      user_id TEXT,
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
  try { await db.run('ALTER TABLE schedules ADD COLUMN rtmp_url TEXT'); } catch { /* ignore */ }
  try { await db.run('ALTER TABLE schedules ADD COLUMN stream_name TEXT'); } catch { /* ignore */ }
  try { await db.run('ALTER TABLE schedules ADD COLUMN use_custom_rtmp TEXT DEFAULT "false"'); } catch { /* ignore */ }

  // Multi-Tenancy columns
  try { 
    await db.run('ALTER TABLE files ADD COLUMN user_id TEXT'); 
    await db.run('UPDATE files SET user_id = "admin" WHERE user_id IS NULL');
  } catch { /* ignore */ }
  try { 
    await db.run('ALTER TABLE playlists ADD COLUMN user_id TEXT'); 
    await db.run('UPDATE playlists SET user_id = "admin" WHERE user_id IS NULL');
  } catch { /* ignore */ }
  try { 
    await db.run('ALTER TABLE schedules ADD COLUMN user_id TEXT'); 
    await db.run('UPDATE schedules SET user_id = "admin" WHERE user_id IS NULL');
  } catch { /* ignore */ }
  try { 
    await db.run('ALTER TABLE accounts ADD COLUMN user_id TEXT'); 
    await db.run('UPDATE accounts SET user_id = "admin" WHERE user_id IS NULL');
  } catch { /* ignore */ }
  try { 
    await db.run('ALTER TABLE oauth_sessions ADD COLUMN user_id TEXT'); 
  } catch { /* ignore */ }
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

// [TOKEN SYSTEM FOR MULTI-TENANCY]
const JWT_SECRET = process.env.API_KEY || 'kunci_rahasia_admin_123';

function generateToken(payload) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 86400000 })).toString('base64');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64');
  return `${data}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(parts[0]).digest('base64');
  if (signature !== parts[1]) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// [EXTERNAL AUTH PROXY]
// Mengirimkan kredensial ke server pusat sebelum memberikan API Key
app.post('/api/auth/external-login', async (req, res) => {
  const { username, password } = req.body;
  const externalAuthUrl = process.env.EXTERNAL_AUTH_URL;

  // Jika URL Eksternal belum disetel, sediakan mekanisme darurat (fallback)
  if (!externalAuthUrl || externalAuthUrl.includes('nama-web-anda.com')) {
    if (username === 'admin' && password === JWT_SECRET) {
      return res.json({ apiKey: generateToken({ username: 'admin', role: 'admin' }) });
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
      // Jika server eksternal merespon 200 OK, berikan Token Multi-Tenant
      const token = generateToken({ username: username.trim(), role: 'user' });
      return res.json({ apiKey: token });
    } else {
      return res.status(401).json({ error: 'Kredensial ditolak oleh Web Server Utama Anda.' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menghubungi Web Server Utama. ' + error.message });
  }
});

// [API SECURITY MIDDLEWARE]
// Melindungi seluruh akses ke /api agar hanya bisa diakses menggunakan Master API Key atau Token
app.use('/api', (req, res, next) => {
  // Pengecualian: Rute Auth dan Google Callback
  if (req.path.startsWith('/auth/')) return next();

  const authHeader = req.headers['authorization'];
  const providedKey = authHeader ? authHeader.split(' ')[1] : req.headers['x-api-key'];

  if (!providedKey) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  // Jika menggunakan Master API Key secara langsung (Backward compatibility untuk sistem lama)
  if (providedKey === JWT_SECRET) {
    req.user = { username: 'admin', role: 'admin' };
    return next();
  }

  // Jika menggunakan Token dari Multi-Tenancy
  const decoded = verifyToken(providedKey);
  if (decoded) {
    req.user = decoded;
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
});

// --- API ENDPOINTS ---

// [FILES API]
app.get('/api/files', async (req, res) => {
  try {
    const files = await db.all('SELECT * FROM files WHERE user_id = ? ORDER BY uploadTime DESC', [req.user.username]);
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
      'INSERT INTO files (id, name, url, type, size, folderId, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [fileData.id, fileData.name, fileData.url, fileData.type, fileData.size, fileData.folderId, req.user.username]
    );
    res.json({ message: 'File uploaded successfully', file: fileData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/files/:id', async (req, res) => {
  try {
    const file = await db.get('SELECT * FROM files WHERE id = ? AND user_id = ?', [req.params.id, req.user.username]);
    if (file) {
      const filePath = path.join(process.cwd(), file.url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      await db.run('DELETE FROM files WHERE id = ? AND user_id = ?', [req.params.id, req.user.username]);
    }
    res.json({ message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [PLAYLISTS API]
app.get('/api/playlists', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM playlists WHERE user_id = ?', [req.user.username]);
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
      'INSERT INTO playlists (id, name, items, user_id) VALUES (?, ?, ?, ?)',
      [id, name, JSON.stringify(items), req.user.username]
    );
    res.json({ message: 'Playlist saved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/playlists/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM playlists WHERE id = ? AND user_id = ?', [req.params.id, req.user.username]);
    res.json({ message: 'Playlist deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [SCHEDULES API]
app.get('/api/schedules', async (req, res) => {
  try {
    const schedules = await db.all('SELECT * FROM schedules WHERE user_id = ?', [req.user.username]);
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/schedules', async (req, res) => {
  try {
    const { id, title, startDate, startTime, endDate, endTime, accountId, mediaSource, description, category, tags, privacy, thumbnail, video_quality, background_music, loop_mode, use_custom_rtmp, rtmp_url, stream_name } = req.body;
    
    // Validasi kepemilikan account
    if (accountId) {
      const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [accountId, req.user.username]);
      if (!account) return res.status(403).json({ error: 'YouTube Account not found or unauthorized' });
    }

    await db.run(
      `INSERT OR REPLACE INTO schedules 
      (id, title, startDate, startTime, endDate, endTime, accountId, mediaSource, description, category, tags, privacy, thumbnail, video_quality, background_music, loop_mode, use_custom_rtmp, rtmp_url, stream_name, user_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, startDate, startTime, endDate, endTime, accountId, mediaSource, description, category, tags, privacy, thumbnail, video_quality || '720p', background_music || 'none', loop_mode || 'infinite', String(use_custom_rtmp) === 'true' ? 'true' : 'false', rtmp_url, stream_name, req.user.username]
    );
    res.json({ message: 'Schedule saved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const sched = await db.get('SELECT * FROM schedules WHERE id = ? AND user_id = ?', [req.params.id, req.user.username]);
    if (!sched) return res.status(404).json({ error: 'Schedule not found or unauthorized' });

    // Pastikan jika stream sedang berjalan, di-stop dan FFmpeg dimatikan
    await stopStream(db, req.params.id).catch(() => {});
    await db.run('DELETE FROM schedules WHERE id = ?', [req.params.id]);
    res.json({ message: 'Schedule deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

let previousCpuTime = { idle: 0, total: 0 };
function getCpuUsage() {
  try {
    if (process.platform === 'linux') {
      const statLine = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
      const stats = statLine.match(/\d+/g);
      if (stats) {
        let idle = parseInt(stats[3], 10) + parseInt(stats[4], 10);
        let total = 0;
        stats.forEach(s => total += parseInt(s, 10));
        
        if (previousCpuTime.total === 0) {
          previousCpuTime = { idle, total };
          return 0;
        }
        const idleDiff = idle - previousCpuTime.idle;
        const totalDiff = total - previousCpuTime.total;
        const percentage = 100 - Math.round(100 * idleDiff / totalDiff);
        previousCpuTime = { idle, total };
        return percentage > 0 ? percentage : 0;
      }
    }
  } catch (err) {
    console.error('Failed to parse /proc/stat:', err.message);
  }
  
  // Fallback untuk Windows / Mac
  const cpus = os.cpus();
  let idle = 0; let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) { total += cpu.times[type]; }
    idle += cpu.times.idle;
  }
  if (previousCpuTime.total === 0) {
    previousCpuTime = { idle, total };
    return 0;
  }
  const percentage = 100 - Math.round(100 * (idle - previousCpuTime.idle) / (total - previousCpuTime.total));
  previousCpuTime = { idle, total };
  return percentage > 0 ? percentage : 0;
}

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
    cpuUsage: getCpuUsage(),
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

// [VIEWERS API]
app.get('/api/schedules/:id/viewers', async (req, res) => {
  try {
    const schedule = await db.get('SELECT * FROM schedules WHERE id = ?', [req.params.id]);
    if (!schedule || !schedule.broadcast_id || !schedule.accountId) return res.json({ viewers: 0 });

    const account = await db.get('SELECT * FROM accounts WHERE id = ?', [schedule.accountId]);
    if (!account) return res.json({ viewers: 0 });

    const tokens = JSON.parse(account.credentials_json);
    const oauth2Client = new google.auth.OAuth2(account.client_id, account.client_secret);
    oauth2Client.setCredentials(tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const response = await youtube.videos.list({
      part: 'liveStreamingDetails',
      id: schedule.broadcast_id
    });

    const item = response.data.items[0];
    if (item && item.liveStreamingDetails) {
      res.json({ viewers: item.liveStreamingDetails.concurrentViewers || 0 });
    } else {
      res.json({ viewers: 0 });
    }
  } catch (error) {
    console.error('[API] Failed to fetch viewers:', error.message);
    res.json({ viewers: 0 });
  }
});

// [ACCOUNTS API]
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await db.all('SELECT id, youtube_name, avatar_url, created_at FROM accounts WHERE user_id = ? ORDER BY created_at DESC', [req.user.username]);
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
      'INSERT INTO oauth_sessions (id, client_id, client_secret, user_id) VALUES (?, ?, ?, ?)',
      [sessionId, client_id, client_secret, req.user.username]
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
      'INSERT OR REPLACE INTO accounts (id, youtube_name, avatar_url, credentials_json, client_id, client_secret, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, youtube_name, avatar_url, credentials_json, session.client_id, session.client_secret, session.user_id]
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
    await db.run('DELETE FROM accounts WHERE id = ? AND user_id = ?', [req.params.id, req.user.username]);
    res.json({ message: 'Account disconnected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`API Server is running on http://localhost:${PORT}`);
});
