import express from 'express';
import { all, one, run } from '../db.js';
import { requireAuth } from '../middleware.js';
import { unreadCounts, sanitizeText } from '../lib/helpers.js';

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const items = all(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
    [req.user.id],
  );
  return res.json({ notifications: items, counts: unreadCounts(req.user.id) });
});

router.get('/unread-count', requireAuth, (req, res) => {
  return res.json(unreadCounts(req.user.id));
});

router.post('/:id/read', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const item = one(`SELECT * FROM notifications WHERE id = ?`, [id]);
  if (!item) return res.status(404).json({ error: 'Ogolaanshaha lama heli.' });
  if (item.user_id !== req.user.id) return res.status(403).json({ error: 'Waxaa kaga maqan tahay.' });
  run(`UPDATE notifications SET read_at = datetime('now') WHERE id = ?`, [id]);
  return res.json({ message: 'Waa la akhriyay.', counts: unreadCounts(req.user.id) });
});

router.post('/read-all', requireAuth, (req, res) => {
  run(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`,
    [req.user.id]);
  return res.json({ message: 'Dhammaan waa la akhriyay.', counts: unreadCounts(req.user.id) });
});

/** Block / unblock members and report abuse. */
router.post('/blocks', requireApprovedOrPending, (req, res) => {
  const blockedId = Number(req.body?.blocked_id);
  if (!Number.isInteger(blockedId) || blockedId === req.user.id) {
    return res.status(400).json({ error: 'Helin aan sax ahayn.' });
  }
  const target = one(`SELECT id FROM user_profiles WHERE id = ?`, [blockedId]);
  if (!target) return res.status(404).json({ error: 'Xogtaada lama heli.' });
  const existing = one(`SELECT id FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?`,
    [req.user.id, blockedId]);
  if (!existing) {
    run(`INSERT INTO blocked_users (blocker_id, blocked_id) VALUES (?,?)`, [req.user.id, blockedId]);
  }
  return res.json({ message: 'Xogtaada waa la xannibay.' });
});

router.delete('/blocks/:id', requireApprovedOrPending, (req, res) => {
  const id = Number(req.params.id);
  run(`DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?`, [req.user.id, id]);
  return res.json({ message: 'Xannibadda waa la saaray.' });
});

router.get('/blocks', requireApprovedOrPending, (req, res) => {
  const rows = all(
    `SELECT b.blocked_id AS id, u.full_name, u.profile_photo_url, b.created_at
       FROM blocked_users b JOIN user_profiles u ON u.id = b.blocked_id
      WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
    [req.user.id],
  );
  return res.json({ blocked: rows });
});

router.post('/reports', requireApprovedOrPending, (req, res) => {
  const reportedId = Number(req.body?.reported_user_id);
  const reason = sanitizeText(req.body?.reason, 120);
  const details = sanitizeText(req.body?.details, 1000);
  const conversationId = req.body?.conversation_id ? Number(req.body.conversation_id) : null;
  if (!Number.isInteger(reportedId) || reportedId === req.user.id) {
    return res.status(400).json({ error: 'Helin aan sax ahayn.' });
  }
  if (!reason) return res.status(400).json({ error: 'Fadlan dooro sababta.' });
  const target = one(`SELECT id FROM user_profiles WHERE id = ?`, [reportedId]);
  if (!target) return res.status(404).json({ error: 'Xogtaada lama heli.' });
  const info = run(
    `INSERT INTO abuse_reports (reporter_id, reported_user_id, conversation_id, reason, details)
     VALUES (?,?,?,?,?)`,
    [req.user.id, reportedId, Number.isInteger(conversationId) ? conversationId : null, reason, details],
  );
  const admins = all(`SELECT id FROM user_profiles WHERE role = 'admin'`);
  admins.forEach((admin) => {
    run(
      `INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)`,
      [admin.id, 'report', 'Warbixin cusub', `${req.user.full_name} ayaa warixin qof.`,
        `#/admin?report=${Number(info.lastInsertRowid)}`],
    );
  });
  return res.status(201).json({ message: 'Warbixinta waa la diray. Maamulka wuxuu dib u eegayaa.' });
});

// Local helper: signed-in users of any status may block/report.
function requireApprovedOrPending(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Fadlan marka hore soo gal.' });
  return next();
}

export default router;
