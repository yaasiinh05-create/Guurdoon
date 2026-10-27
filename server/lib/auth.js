import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

/** Hash a password with scrypt + random salt (never store plain text). */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/** Constant-time verification of a password against a stored hash. */
export function verifyPassword(password, stored) {
  try {
    if (typeof stored !== 'string') return false;
    const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (() => {
    // Ephemeral secret fallback: sessions are invalidated on restart (safe default
    // until a real secret is configured via environment variable).
    const secret = crypto.randomBytes(48).toString('hex');
    console.warn('[guurdoon] JWT_SECRET not set — using an ephemeral secret. Sessions will reset on restart.');
    return secret;
  })();

export const TOKEN_COOKIE = 'gd_session';
export const CSRF_COOKIE = 'gd_csrf';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function signSession(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifySession(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function setSessionCookies(res, token, req) {
  const secure = req && req.secure;
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  const csrf = crypto.randomBytes(24).toString('base64url');
  res.cookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  return csrf;
}

export function clearSessionCookies(res) {
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
