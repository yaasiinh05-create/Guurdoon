import express from 'express';
import { all, one } from '../db.js';
import { publicProfile, blockedIds } from '../lib/helpers.js';

const router = express.Router();

/**
 * Public directory — approved members only.
 * Pending / rejected / suspended profiles are never exposed.
 */
router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const params = [];
  let sql = `SELECT id, full_name, date_of_birth, gender, marital_status, country, city,
                    education, occupation, bio, partner_preferences, profile_photo_url, created_at
               FROM user_profiles
              WHERE approval_status = 'APPROVED' AND role = 'member'`;
  if (q) {
    sql += ` AND full_name LIKE ? COLLATE NOCASE`;
    params.push(`%${q}%`);
  }
  sql += ` ORDER BY created_at DESC LIMIT 200`;
  const rows = all(sql, params);
  return res.json({ members: rows.map(publicProfile), query: q });
});

/** Profile details of an approved member */
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID aan sax ahayn.' });
  const row = one(
    `SELECT id, full_name, date_of_birth, gender, marital_status, country, city, education,
            occupation, bio, partner_preferences, profile_photo_url, created_at
       FROM user_profiles WHERE id = ? AND approval_status = 'APPROVED'`,
    [id],
  );
  if (!row) return res.status(404).json({ error: 'Xogtaada lama heli.' });
  const member = publicProfile(row);

  // Blocking state is only relevant for signed-in members.
  if (req.user) {
    const blocked = blockedIds(req.user.id);
    const blocks = blocked.includes(id);
    const blockedBy = blockedIds(id).includes(req.user.id);
    member.relationship = {
      blocked_by_me: blocks,
      blocked_me: blockedBy,
      can_chat: !blocks && !blockedBy,
    };
  }
  return res.json({ member });
});

export default router;
