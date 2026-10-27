import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { one, run, UPLOAD_DIR } from '../db.js';
import { requireAuth } from '../middleware.js';
import { ownProfile, publicProfile, sanitizeText, ageFrom } from '../lib/helpers.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Fadlan sawir oo kaliya (JPG, PNG, WEBP).'));
  },
});

const GENDERS = ['Male', 'Female'];
const MARITAL_STATUSES = ['Single', 'Gabar', 'Garoob', 'Xaasle'];

/** My own profile (full details) */
router.get('/', requireAuth, (req, res) => {
  const profile = one(`SELECT * FROM user_profiles WHERE id = ?`, [req.user.id]);
  return res.json({ user: ownProfile(profile) });
});

/** Update my own profile. role/approval_status are intentionally NOT writable. */
router.put('/', requireAuth, (req, res) => {
  const body = req.body || {};
  const errors = {};
  const full_name = sanitizeText(body.full_name, 120);
  const gender = sanitizeText(body.gender, 20);
  const marital_status = sanitizeText(body.marital_status, 20);
  const country = sanitizeText(body.country, 80);
  const city = sanitizeText(body.city, 80);
  const education = sanitizeText(body.education, 160);
  const occupation = sanitizeText(body.occupation, 160);
  const bio = sanitizeText(body.bio, 1200);
  const partner_preferences = sanitizeText(body.partner_preferences, 1200);
  const date_of_birth = sanitizeText(body.date_of_birth, 10);

  if (full_name.length < 3) errors.full_name = 'Fadlan qor magacaada oo dhan.';
  if (!GENDERS.includes(gender)) errors.gender = 'Fadlan dooro jinsi.';
  if (!MARITAL_STATUSES.includes(marital_status)) errors.marital_status = 'Fadlan dooro xaalada qaabka noloshaada.';
  if (!country) errors.country = 'Fadlan dooro dalka.';
  if (!city) errors.city = 'Fadlan qor magaalada.';
  if (education.length < 2) errors.education = 'Fadlan qor heerkaaga waxbarashada.';
  if (occupation.length < 2) errors.occupation = 'Fadlan qor shaqadaada.';
  if (bio.length < 10) errors.bio = 'Fadlan qor wax ka qor badan hore.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) errors.date_of_birth = 'Fadlan qor taariikhda dhalashada.';
  if (!errors.date_of_birth) {
    const dob = new Date(`${date_of_birth}T00:00:00Z`);
    const age = ageFrom(date_of_birth);
    if (Number.isNaN(dob.getTime()) || age === null || age < 18) {
      errors.date_of_birth = 'Waxaad u baahan tahay in aad noqoto 18 jir ama ka weyn.';
    }
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Fadlan hubi qalabka.', errors });

  run(
    `UPDATE user_profiles
        SET full_name = ?, date_of_birth = ?, gender = ?, marital_status = ?, country = ?, city = ?,
            education = ?, occupation = ?, bio = ?, partner_preferences = ?, updated_at = datetime('now')
      WHERE id = ?`,
    [full_name, date_of_birth, gender, marital_status, country, city, education, occupation, bio,
      partner_preferences, req.user.id],
  );
  const profile = one(`SELECT * FROM user_profiles WHERE id = ?`, [req.user.id]);
  return res.json({ message: 'Xogtaada waa la beddelay.', user: ownProfile(profile) });
});

/** Upload / replace profile picture */
router.post('/photo', requireAuth, (req, res) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Sawirka ayaa guuldareystay.' });
    if (!req.file) return res.status(400).json({ error: 'Fadlan sawir dooro.' });
    const current = one(`SELECT profile_photo_url FROM user_profiles WHERE id = ?`, [req.user.id]);
    if (current?.profile_photo_url) {
      const oldPath = path.join(UPLOAD_DIR, path.basename(current.profile_photo_url));
      fs.promises.unlink(oldPath).catch(() => {});
    }
    const url = `/uploads/${req.file.filename}`;
    run(`UPDATE user_profiles SET profile_photo_url = ?, updated_at = datetime('now') WHERE id = ?`,
      [url, req.user.id]);
    const profile = one(`SELECT * FROM user_profiles WHERE id = ?`, [req.user.id]);
    return res.json({ message: 'Sawirka waa la beddelay.', user: ownProfile(profile) });
  });
});

/** Remove profile picture */
router.delete('/photo', requireAuth, (req, res) => {
  const current = one(`SELECT profile_photo_url FROM user_profiles WHERE id = ?`, [req.user.id]);
  if (current?.profile_photo_url) {
    fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(current.profile_photo_url))).catch(() => {});
  }
  run(`UPDATE user_profiles SET profile_photo_url = NULL, updated_at = datetime('now') WHERE id = ?`,
    [req.user.id]);
  const profile = one(`SELECT * FROM user_profiles WHERE id = ?`, [req.user.id]);
  return res.json({ message: 'Sawirka waa la tirtiray.', user: ownProfile(profile) });
});

export default router;
export { publicProfile };
