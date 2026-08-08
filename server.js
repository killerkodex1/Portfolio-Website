const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const MAX_BODY_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 5;
const clients = new Map();

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml'
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (clients.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  recent.push(now);
  clients.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request is too large.'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function saveMessage(message) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  existing.push(message);
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(existing, null, 2));
}

async function handleContact(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return sendJson(res, 429, { error: 'Please wait a minute before sending another message.' });
  }

  try {
    const raw = await readBody(req);
    const payload = JSON.parse(raw || '{}');
    const name = clean(payload.name, 80);
    const email = clean(payload.email, 120).toLowerCase();
    const message = clean(payload.message, 1800);
    const website = clean(payload.website, 200); // Honeypot: humans leave this blank.

    if (website) return sendJson(res, 200, { ok: true });
    if (name.length < 2 || !validEmail(email) || message.length < 10) {
      return sendJson(res, 400, { error: 'Please enter your name, a valid email, and a message of at least 10 characters.' });
    }

    saveMessage({
      id: crypto.randomUUID(),
      name,
      email,
      message,
      receivedAt: new Date().toISOString()
    });
    return sendJson(res, 201, { ok: true, message: 'Thanks - your message has been received.' });
  } catch (error) {
    if (error instanceof SyntaxError) return sendJson(res, 400, { error: 'Invalid request payload.' });
    if (error.message === 'Request is too large.') return sendJson(res, 413, { error: error.message });
    console.error('Contact API error:', error);
    return sendJson(res, 500, { error: 'Something went wrong. Please email me directly instead.' });
  }
}

function serveStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);
  if (pathname === '/') pathname = '/index.html';
  const target = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== path.join(PUBLIC_DIR, 'index.html')) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  fs.readFile(target, (error, file) => {
    if (error) {
      if (error.code === 'ENOENT') return sendJson(res, 404, { error: 'Not found' });
      return sendJson(res, 500, { error: 'Server error' });
    }
    const extension = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    res.end(file);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/contact') return handleContact(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  return sendJson(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, () => {
  console.log(`Portfolio is live at http://localhost:${PORT}`);
});
