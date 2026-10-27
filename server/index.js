import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { UPLOAD_DIR } from './db.js';
import { attachUser, csrfProtection } from './middleware.js';
import { addClient, heartbeat } from './realtime.js';
import { verifySession, TOKEN_COOKIE, CSRF_COOKIE } from './lib/auth.js';
import { one, run } from './db.js';
import { hashPassword } from './lib/auth.js';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import memberRoutes from './routes/members.js';
import chatRoutes from './routes/chat.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(attachUser);

/** Basic security headers (no paid service needed). */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; connect-src 'self'; font-src 'self' data:; base-uri 'self'; form-action 'self'");
  next();
});

/** Always hand out a CSRF cookie so the client can perform safe state changes. */
app.use((req, res, next) => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const csrf = crypto.randomBytes(24).toString('base64url');
    res.cookie(CSRF_COOKIE, csrf, {
      httpOnly: false,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
  next();
});

app.use('/api', csrfProtection);

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'guurdoon' }));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/members', memberRoutes);
app.use('/api', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

/** Real-time stream (Server-Sent Events) for messages, requests and notifications. */
app.get('/api/events', (req, res) => {
  const token = req.cookies?.[TOKEN_COOKIE];
  const payload = token ? verifySession(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: 'Fadlan marka hore soo gal.' });
  const user = one(`SELECT id FROM user_profiles WHERE auth_user_id = ?`, [payload.sub]);
  if (!user) return res.status(401).json({ error: 'Fadlan marka hore soo gal.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ user_id: user.id })}\n\n`);
  addClient(user.id, res);
  req.on('close', () => res.end());
});

/** Profile pictures are public assets (only approved members appear in the directory). */
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h' }));

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

/** SPA fallback */
app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Wax qalab ah ayaa jaba. Fadlan mar kale isku day.' });
});

/**
 * Safe first-administrator configuration:
 * set ADMIN_EMAIL and ADMIN_PASSWORD in the environment before the first start.
 * The account is created only when no administrator exists yet.
 */
export function bootstrapAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) return null;
  const existingAdmin = one(`SELECT id FROM user_profiles WHERE role = 'admin' LIMIT 1`);
  if (existingAdmin) return existingAdmin;
  if (password.length < 10) {
    console.warn('[guurdoon] ADMIN_PASSWORD waa ka yar tahay 10 xarf. Waa lagu talagalay inuu ka horreeyo.');
  }
  const authUserId = `admin-${Date.now()}`;
  const info = run(
    `INSERT INTO user_profiles
      (auth_user_id, email, password_hash, full_name, date_of_birth, gender, marital_status,
       country, city, education, occupation, bio, role, approval_status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'admin','APPROVED')`,
    [
      authUserId, email, hashPassword(password), 'Maamulka Guurdoon',
      '1990-01-01', 'Female', 'Single', 'Somalia', 'Muqdisho',
      'Maamulka', 'Maamulka Guurdoon', 'Akaalka maamulka Guurdoon.',
    ],
  );
  console.log(`[guurdoon] Maamulka ugu horreeyay waa la abuuray (${email}).`);
  return one(`SELECT * FROM user_profiles WHERE id = ?`, [Number(info.lastInsertRowid)]);
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  bootstrapAdmin();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[guurdoon] Guurdoon waa ka shaqeeyaa port ${PORT}`);
  });
  setInterval(heartbeat, 25_000).unref?.();
}

export default app;
