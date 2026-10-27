#!/usr/bin/env node
/**
 * Safe first-administrator setup.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@guurdoon.so ADMIN_PASSWORD='strong-password' npm run create-admin
 *
 * The administrator is created only when no administrator exists yet, so the
 * command is safe to run again (it will never create a second admin silently).
 */
import { one, run } from '../db.js';
import { hashPassword } from '../lib/auth.js';
import crypto from 'node:crypto';

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

if (!email || !password) {
  console.error('Fadlan deji ADMIN_EMAIL iyo ADMIN_PASSWORD.');
  console.error("Tusaale: ADMIN_EMAIL=admin@guurdoon.so ADMIN_PASSWORD='...' npm run create-admin");
  process.exit(1);
}
if (password.length < 10) {
  console.error('Eraya sirta waa inuu ka yaraan 10 xarf.');
  process.exit(1);
}

const existing = one(`SELECT id, email FROM user_profiles WHERE role = 'admin' LIMIT 1`);
if (existing) {
  console.log(`[guurdoon] Maamul horey uu jira (${existing.email}). Wax cusub lama abuurin.`);
  process.exit(0);
}

const authUserId = `admin-${crypto.randomUUID()}`;
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

console.log(`[guurdoon] Maamulka waa la abuuray: ${email} (id ${Number(info.lastInsertRowid)}).`);
