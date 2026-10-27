import { one } from './db.js';
import { verifySession, TOKEN_COOKIE, CSRF_COOKIE } from './lib/auth.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** In-memory rate limiter (per IP + bucket). Fine for a single-instance free deployment. */
const buckets = new Map();
export function rateLimit({ windowMs = 60_000, max = 20, key = 'default' } = {}) {
  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    const entry = buckets.get(id);
    if (!entry || now > entry.resetAt) {
      buckets.set(id, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.status(429).json({ error: 'Cuntada badan ayaad sameeyay. Marka hor fadlan isku day.' });
      return;
    }
    return next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of buckets.entries()) if (now > entry.resetAt) buckets.delete(id);
}, 60_000).unref?.();

/** Loads the authenticated profile from the session cookie (server-side lookup only). */
export function attachUser(req, res, next) {
  req.user = null;
  const token = req.cookies?.[TOKEN_COOKIE];
  if (!token) return next();
  const payload = verifySession(token);
  if (!payload?.sub) return next();
  const user = one(
    `SELECT id, auth_user_id, full_name, role, approval_status, email, phone, profile_photo_url,
            date_of_birth, gender, marital_status, country, city, education, occupation, bio,
            partner_preferences, created_at
       FROM user_profiles WHERE auth_user_id = ?`,
    [payload.sub],
  );
  if (user) req.user = user;
  return next();
}

/** CSRF protection: double-submit cookie + header for state-changing requests. */
export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get('X-CSRF-Token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Ammaanka CSRF wuu laga diiday. Fadlan dib u soo gal.' });
  }
  return next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Fadlan marka hore soo gal.' });
  return next();
}

/** Member-only features require an APPROVED account. */
export function requireApproved(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Fadlan marka hore soo gal.' });
  if (req.user.approval_status !== 'APPROVED') {
    return res.status(403).json({
      error: 'Xogtaada ma jirto sida qof la ansixiyay. Fadey soo gal marka maamulku uu ku ansixiyo.',
      approval_status: req.user.approval_status,
    });
  }
  return next();
}

/** Administrator-only functions. Role is read from the database, never from the client. */
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Fadlan marka hore soo gal.' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ogolaansho ma jiro. Qaacad admin-ka ayaa laga baahan yahay.' });
  }
  return next();
}
