const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function loadLocalEnv() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;

  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(["'])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const CONTACT_TO = process.env.CONTACT_TO || 'vallabhavenkatasai@gmail.com';
const EMAIL_FROM = process.env.EMAIL_FROM;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
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

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

async function notifyInbox(message) {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    throw new Error('Email delivery is not configured.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [CONTACT_TO],
      reply_to: message.email,
      subject: `Portfolio enquiry from ${message.name}`,
      text: `New portfolio enquiry\n\nName: ${message.name}\nEmail: ${message.email}\n\nMessage:\n${message.message}\n\nReceived: ${message.receivedAt}`,
      html: `<h2>New portfolio enquiry</h2><p><strong>Name:</strong> ${escapeHtml(message.name)}<br><strong>Email:</strong> <a href="mailto:${escapeHtml(message.email)}">${escapeHtml(message.email)}</a></p><p><strong>Message:</strong></p><p>${escapeHtml(message.message).replace(/\n/g, '<br>')}</p><hr><p><small>Received: ${message.receivedAt}</small></p>`
    }),
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    const providerMessage = await response.text();
    console.error('Email provider rejected message:', response.status, providerMessage);
    throw new Error('Email delivery failed.');
  }
}

function directEmailUrl(message) {
  const subject = `Portfolio enquiry from ${message.name}`;
  const body = [
    'Hello Vallabh,',
    '',
    `My name is ${message.name}.`,
    `You can reply to me at ${message.email}.`,
    '',
    'Message:',
    message.message,
    '',
    'Sent from your portfolio website.'
  ].join('\n');
  return `mailto:${encodeURIComponent(CONTACT_TO)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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

    const contactMessage = {
      id: crypto.randomUUID(),
      name,
      email,
      message,
      receivedAt: new Date().toISOString()
    };

    if (!RESEND_API_KEY || !EMAIL_FROM) {
      return sendJson(res, 202, {
        ok: true,
        fallback: true,
        directEmail: directEmailUrl(contactMessage),
        message: 'Opening your email app with your message ready to send.'
      });
    }

    await notifyInbox(contactMessage);
    saveMessage(contactMessage);
    return sendJson(res, 201, { ok: true, message: 'Thanks - your message is on its way to Vallabh.' });
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
