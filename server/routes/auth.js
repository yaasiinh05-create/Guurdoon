import express from 'express';
import crypto from 'node:crypto';
import { all, one, run } from '../db.js';
import {
  hashPassword, verifyPassword, signSession, setSessionCookies, clearSessionCookies,
  randomToken, sha256,
} from '../lib/auth.js';
import { requireAuth, rateLimit } from '../middleware.js';
import { ownProfile, sanitizeText } from '../lib/helpers.js';
import { notify } from '../lib/helpers.js';

const router = express.Router();

const GENDERS = ['Male', 'Female'];
const MARITAL_STATUSES = ['Single', 'Gabar', 'Garoob', 'Xaasle'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,19}$/;

function classifyContact(raw) {
  const value = sanitizeText(raw, 120);
  if (EMAIL_RE.test(value)) return { type: 'email', value: value.toLowerCase() };
  if (PHONE_RE.test(value)) return { type: 'phone', value: value.replace(/[\s-]/g, '') };
  return null;
}

function validateRegistration(body) {
  const errors = {};
  const full_name = sanitizeText(body.full_name, 120);
  const contact = classifyContact(body.contact);
  const password = String(body.password || '');
  const password_confirm = String(body.password_confirm || '');
  const gender = sanitizeText(body.gender, 20);
  const date_of_birth = sanitizeText(body.date_of_birth, 10);
  const marital_status = sanitizeText(body.marital_status, 20);
  const country = sanitizeText(body.country, 80);
  const city = sanitizeText(body.city, 80);

  if (full_name.length < 3) errors.full_name = 'Fadlan qor magacaada oo dhan.';
  if (!contact) errors.contact = 'Email ama telefoon gal. Tusaale: name@example.com';
  if (password.length < 8) errors.password = 'Fadlan isticmaal erayo 8 ka badan.';
  if (password !== password_confirm) errors.password_confirm = 'Erayada sirta ma isku mid ah.';
  if (!GENDERS.includes(gender)) errors.gender = 'Fadlan dooro jinsi.';
  if (!MARITAL_STATUSES.includes(marital_status)) errors.marital_status = 'Fadlan dooro xaalada qaabka noloshaada.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) errors.date_of_birth = 'Fadlan qor taariikhda dhalashada.';
  if (!country) errors.country = 'Fadlan dooro dalka.';
  if (!city) errors.city = 'Fadlan qor magaalada.';
  if (sanitizeText(body.bio, 50).length < 10) errors.bio = 'Fadlan qor wax ka qor badan hore.';
  if (sanitizeText(body.occupation, 120).length < 2) errors.occupation = 'Fadlan qor shaqadaada.';
  if (sanitizeText(body.education, 120).length < 2) errors.education = 'Fadlan qor heerkaaga waxbarashada.';

  if (!errors.date_of_birth) {
    const dob = new Date(`${date_of_birth}T00:00:00Z`);
    if (Number.isNaN(dob.getTime()) || dob.getTime() > Date.now()) {
      errors.date_of_birth = 'Taariikhda dhalashadu waa qaldaran.';
    } else {
      let age = new Date().getUTCFullYear() - dob.getUTCFullYear();
      const m = new Date().getUTCMonth() - dob.getUTCMonth();
      if (m < 0 || (m === 0 && new Date().getUTCDate() < dob.getUTCDate())) age -= 1;
      if (age < 18) errors.date_of_birth = 'Waxaad u baahan tahay in aad noqoto 18 jir ama ka weyn.';
      if (age > 100) errors.date_of_birth = 'Fadlan qor taariikhda saxda ah.';
    }
  }
  return { errors, full_name, contact, password, gender, date_of_birth, marital_status, country, city };
}

// ---------------------------------------------------------------- register
router.post('/register', rateLimit({ windowMs: 15 * 60_000, max: 10, key: 'register' }), (req, res) => {
  const body = req.body || {};
  const { errors, full_name, contact, password, gender, date_of_birth, marital_status, country, city } =
    validateRegistration(body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Fadlan hubi qalabka.', errors });
  }

  const existing = one(
    `SELECT id FROM user_profiles WHERE email = ? OR phone = ? OR (email IS NOT NULL AND email = ?)`,
    [contact.type === 'email' ? contact.value : null, contact.type === 'phone' ? contact.value : null, contact.value],
  );
  if (existing) {
    return res.status(409).json({
      error: 'Lacag diyaar hore ayaa la sameeyay. Fadlan isticmaal email kale ama soo gal.',
      errors: { contact: 'Lacaggani hore ayaa la diiwaangeliyay.' },
    });
  }

  const authUserId = crypto.randomUUID();
  const email = contact.type === 'email' ? contact.value : null;
  const phone = contact.type === 'phone' ? contact.value : null;

  try {
    const info = run(
      `INSERT INTO user_profiles
        (auth_user_id, email, phone, password_hash, full_name, date_of_birth, gender, marital_status,
         country, city, education, occupation, bio, partner_preferences, role, approval_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'member','PENDING')`,
      [
        authUserId, email, phone, hashPassword(password), full_name, date_of_birth, gender,
        marital_status, country, city, sanitizeText(body.education, 160),
        sanitizeText(body.occupation, 160), sanitizeText(body.bio, 1200),
        sanitizeText(body.partner_preferences, 1200),
      ],
    );
    const profileId = Number(info.lastInsertRowid);

    // Notify administrators about the new registration request.
    const admins = all(`SELECT id FROM user_profiles WHERE role = 'admin'`);
    admins.forEach((admin) => {
      notify(admin.id, {
        type: 'registration',
        title: 'Diiwaangelin cusub',
        body: `${full_name} ayaa codsaday diiwaangelinta.`,
        link: `#/admin?member=${profileId}`,
      });
    });

    const token = signSession({ sub: authUserId });
    setSessionCookies(res, token, req);
    const profile = one(`SELECT * FROM user_profiles WHERE id = ?`, [profileId]);
    return res.status(201).json({
      message: 'Diiwaangelintaada waa la helay. Fadlan sug ansixinta maamulka.',
      user: ownProfile(profile),
    });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ error: 'Wax qalab ah ayaa jaba. Fadlan mar kale isku day.' });
  }
});

// ------------------------------------------------------------------- login
router.post('/login', rateLimit({ windowMs: 10 * 60_000, max: 20, key: 'login' }), (req, res) => {
  const identifier = sanitizeText(req.body?.identifier, 120);
  const password = String(req.body?.password || '');
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Fadlan geli email/telefoon iyo eray sirta.' });
  }
  const email = identifier.toLowerCase();
  const phone = identifier.replace(/[\s-]/g, '');
  const user = one(
    `SELECT * FROM user_profiles WHERE email = ? OR phone = ?`,
    [email, phone],
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email/telefoon ama eray sirta waa qaldaran.' });
  }
  if (user.approval_status === 'SUSPENDED') {
    return res.status(403).json({
      error: 'Akoonkaaga waa la istaagay. Fadlan la xiriir admiinka.',
      approval_status: user.approval_status,
    });
  }
  run(`UPDATE user_profiles SET last_login_at = datetime('now') WHERE id = ?`, [user.id]);
  const token = signSession({ sub: user.auth_user_id });
  setSessionCookies(res, token, req);
  return res.json({
    message: 'Ku soo galay. Ku soo dhawoow!',
    user: ownProfile(one(`SELECT * FROM user_profiles WHERE id = ?`, [user.id])),
  });
});

// ------------------------------------------------------------------ logout
router.post('/logout', (req, res) => {
  clearSessionCookies(res);
  return res.json({ message: 'Waad ka baxday.' });
});

// --------------------------------------------------------------------- me
router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const profile = one(`SELECT * FROM user_profiles WHERE id = ?`, [req.user.id]);
  return res.json({ user: ownProfile(profile) });
});

// ---------------------------------------------------------- change password
router.post('/password', requireAuth, (req, res) => {
  const current = String(req.body?.current_password || '');
  const next = String(req.body?.new_password || '');
  if (next.length < 8) return res.status(400).json({ error: 'Eraya cusub waa inuu yahay 8 qaafar oo ugu yaraan.' });
  const user = one(`SELECT * FROM user_profiles WHERE id = ?`, [req.user.id]);
  if (!verifyPassword(current, user.password_hash)) {
    return res.status(400).json({ error: 'Eraya sirta hadda waa qaldaran.' });
  }
  run(`UPDATE user_profiles SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
    [hashPassword(next), user.id]);
  return res.json({ message: 'Eraya sirta waa la beddelay.' });
});

// --------------------------------------------------------- password reset
// A mail service is not configured on the free tier, so reset tokens are only
// delivered through the administrator. The endpoint issues a token for admins.
router.post('/password-reset/request', rateLimit({ windowMs: 60 * 60_000, max: 5, key: 'reset' }), (req, res) => {
  const identifier = sanitizeText(req.body?.identifier, 120);
  const email = identifier.toLowerCase();
  const phone = identifier.replace(/[\s-]/g, '');
  const user = one(`SELECT id FROM user_profiles WHERE email = ? OR phone = ?`, [email, phone]);
  // Always answer the same way so accounts cannot be enumerated.
  const message = 'Haddii lacaggu jiro, waxaa lagu soo xerolayaa hab lagu soo galo oo dib u soo gal.';
  if (!user) return res.json({ message });
  const token = randomToken(32);
  run(
    `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?, datetime('now','+1 hour'))`,
    [user.id, sha256(token)],
  );
  if (process.env.SMTP_HOST) {
    console.log(`[guurdoon] password reset token for user ${user.id}: ${token}`);
  }
  return res.json({
    message,
    admin_note:
      'Adeegga iimaylka hadda ma diyaar yahay. Fadlan raac maamulka si uu uu fasiraa erayada sirta.',
  });
});

router.post('/password-reset/confirm', (req, res) => {
  const token = sanitizeText(req.body?.token, 120);
  const newPassword = String(req.body?.new_password || '');
  if (!token || newPassword.length < 8) {
    return res.status(400).json({ error: 'Token ama eray sirta waa qaldaran.' });
  }
  const reset = one(
    `SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`,
    [sha256(token)],
  );
  if (!reset) return res.status(400).json({ error: 'Token-ka wuu dhammaaday ama waa qaldaran.' });
  run(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`, [reset.id]);
  run(`UPDATE user_profiles SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
    [hashPassword(newPassword), reset.user_id]);
  return res.json({ message: 'Eraya sirta waa la beddelay. Hadda waad soo gal kartaa.' });
});

export default router;
