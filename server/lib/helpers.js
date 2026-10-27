import { all, one, run } from '../db.js';
import { sendToUser } from '../realtime.js';

/** Calculate age from an ISO date of birth string. */
export function ageFrom(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

export const PUBLIC_FIELDS = `
  id, full_name, date_of_birth, gender, marital_status, country, city,
  education, occupation, bio, profile_photo_url, approval_status, created_at
`;

/** Public profile view — never exposes e-mail, phone, password hash or role. */
export function publicProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    full_name: row.full_name,
    age: ageFrom(row.date_of_birth),
    date_of_birth: row.date_of_birth,
    gender: row.gender,
    marital_status: row.marital_status,
    country: row.country,
    city: row.city,
    education: row.education,
    occupation: row.occupation,
    bio: row.bio,
    partner_preferences: row.partner_preferences,
    profile_photo_url: row.profile_photo_url,
    created_at: row.created_at,
  };
}

/** Full own profile (with private contact details) for the signed-in member. */
export function ownProfile(row) {
  if (!row) return null;
  return {
    ...publicProfile(row),
    email: row.email,
    phone: row.phone,
    role: row.role,
    approval_status: row.approval_status,
    admin_note: row.admin_note,
    last_login_at: row.last_login_at,
  };
}

/** Create a notification row and push it live to the recipient. */
export function notify(userId, { type, title, body = '', link = null }) {
  const info = run(
    `INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)`,
    [userId, type, title, body, link],
  );
  const notification = one(`SELECT * FROM notifications WHERE id = ?`, [info.lastInsertRowid]);
  sendToUser(userId, 'notification', notification);
  return notification;
}

export function unreadCounts(userId) {
  const notifications = one(
    `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL`,
    [userId],
  )?.c || 0;
  const messages = one(
    `SELECT COUNT(*) AS c
       FROM messages m
       JOIN conversations cv ON cv.id = m.conversation_id
      WHERE m.sender_id <> ? AND m.read_at IS NULL AND m.deleted_at IS NULL
        AND (cv.user_a_id = ? OR cv.user_b_id = ?)`,
    [userId, userId, userId],
  )?.c || 0;
  const requests = one(
    `SELECT COUNT(*) AS c FROM chat_requests WHERE recipient_id = ? AND status = 'PENDING'`,
    [userId],
  )?.c || 0;
  return { notifications, messages, chat_requests: requests, total: notifications + messages + requests };
}

/** True when `userId` blocked `otherId` (either direction blocks contact). */
export function isBlockedBetween(userId, otherId) {
  const row = one(
    `SELECT 1 AS x FROM blocked_users
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
    [userId, otherId, otherId, userId],
  );
  return !!row;
}

export function blockedIds(userId) {
  return all(
    `SELECT blocked_id FROM blocked_users WHERE blocker_id = ?`,
    [userId],
  ).map((r) => r.blocked_id);
}

export function sanitizeText(value, maxLength = 2000) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}
