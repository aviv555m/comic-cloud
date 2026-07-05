const express = require('express');
const cors = require('cors');
const sqlite = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
app.use(cors({ origin: '*' }));

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((res, c) => {
    const [key, val] = c.trim().split('=').map(decodeURIComponent);
    try {
      return Object.assign(res, { [key]: JSON.parse(val) });
    } catch (e) {
      return Object.assign(res, { [key]: val });
    }
  }, {});
};

const DATA_DIR = path.resolve(__dirname, '../data');
const ENCRYPTED_DIR = path.join(DATA_DIR, 'encrypted_files');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ENCRYPTED_DIR)) fs.mkdirSync(ENCRYPTED_DIR, { recursive: true });

const db = sqlite(path.join(DATA_DIR, 'files.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    file_path TEXT PRIMARY KEY, -- e.g. book-covers/userId/uuid.jpg
    bucket TEXT NOT NULL,
    user_id TEXT NOT NULL,
    is_public INTEGER DEFAULT 0,
    encryption_iv TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  const keyPath = path.join(DATA_DIR, 'encryption.key');
  if (fs.existsSync(keyPath)) {
    ENCRYPTION_KEY = fs.readFileSync(keyPath, 'utf8');
  } else {
    ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyPath, ENCRYPTION_KEY);
  }
}
const KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, 'hex');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://cmybkhvdwtmaxhhhgkul.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function authenticate(req, res, next) {
  let token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies['sb-access-token'];
  }
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
    });
    if (response.ok) {
      req.user = await response.json();
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }
  next();
}

// Upload endpoint (Drop-in replacement for Vite's /api/upload)
app.post('/api/upload', authenticate, (req, res) => {
  const filePathHeader = req.headers['x-file-path'];
  if (!filePathHeader) return res.status(400).send("Missing x-file-path header");
  
  const cleanFilePath = decodeURIComponent(filePathHeader); // e.g. "book-covers/userId/uuid.jpg"
  const bucket = cleanFilePath.split('/')[0];
  
  // Extract user_id from path if available, else use authenticated user
  const parts = cleanFilePath.split('/');
  let pathUserId = req.user ? req.user.id : "unknown";
  if (parts.length > 1 && parts[1].length > 10) {
    pathUserId = parts[1]; // usually it's bucket/userId/...
  }
  
  const iv = crypto.randomBytes(16);
  // Hash the path to avoid directory traversal issues
  const diskFileName = crypto.createHash('sha256').update(cleanFilePath).digest('hex') + '.enc';
  const encryptedPath = path.join(ENCRYPTED_DIR, diskFileName);
  
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY_BUFFER, iv);
  const writeStream = fs.createWriteStream(encryptedPath);
  
  req.pipe(cipher).pipe(writeStream);
  
  writeStream.on('finish', () => {
    // Insert/upsert into SQLite
    const stmt = db.prepare(`
      INSERT INTO files (file_path, bucket, user_id, is_public, encryption_iv)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET encryption_iv=excluded.encryption_iv
    `);
    
    // We can default is_public to 1 for covers, 0 for books?
    // The user requirement: "only the user uploaded the book can access it if its not set to public".
    const isPublic = bucket === 'book-covers' ? 1 : 0; 
    
    stmt.run(cleanFilePath, bucket, pathUserId, isPublic, iv.toString('hex'));
    
    res.json({ success: true, url: `/db/file/${cleanFilePath}` });
  });
  
  writeStream.on('error', (err) => {
    console.error('File write error:', err);
    res.status(500).send('Upload failed');
  });
});

app.get(/^\/db\/file\/(.+)$/, authenticate, (req, res) => {
  const filePath = decodeURIComponent(req.params[0]); // everything after /db/file/
  
  const fileInfo = db.prepare(`SELECT * FROM files WHERE file_path = ?`).get(filePath);
  
  if (!fileInfo) {
    // Fallback for files that exist in legacy /public/uploads/ directory before the migration!
    const legacyPath = path.resolve(__dirname, '../public/uploads', filePath);
    if (fs.existsSync(legacyPath)) {
      return res.sendFile(legacyPath);
    }
    return res.status(404).send('File not found');
  }

  // Access Control
  if (fileInfo.is_public === 0) {
    if (!req.user) {
      return res.status(401).send('Unauthorized: Please log in to view this private file.');
    }
    if (req.user.id !== fileInfo.user_id) {
      return res.status(403).send('Forbidden: You do not have permission to view this file.');
    }
  }

  const diskFileName = crypto.createHash('sha256').update(filePath).digest('hex') + '.enc';
  const encryptedPath = path.join(ENCRYPTED_DIR, diskFileName);

  if (!fs.existsSync(encryptedPath)) {
    return res.status(404).send('Encrypted file missing on disk');
  }

  res.setHeader('Content-Type', 'application/octet-stream'); // Or deduce from extension
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg');
  if (filePath.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
  if (filePath.endsWith('.pdf')) res.setHeader('Content-Type', 'application/pdf');
  if (filePath.endsWith('.epub')) res.setHeader('Content-Type', 'application/epub+zip');
  if (filePath.endsWith('.cbz')) res.setHeader('Content-Type', 'application/x-cbz');
  
  if (fileInfo.is_public === 1) {
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }

  const iv = Buffer.from(fileInfo.encryption_iv, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY_BUFFER, iv);
  const readStream = fs.createReadStream(encryptedPath);
  
  readStream.pipe(decipher).pipe(res);
  
  readStream.on('error', (err) => {
    console.error('Decryption stream error:', err);
    if (!res.headersSent) res.status(500).send('Error decrypting file');
  });
});

app.listen(8084, '127.0.0.1', () => {
  console.log(`Secure File Server running on http://127.0.0.1:8084`);
});
