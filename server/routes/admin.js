import express from 'express';
import { all, one, run } from '../db.js';
import { requireAdmin } from '../middleware.js';
import { publicProfile, sanitizeText, ageFrom } from '../lib/helpers.js';
import { notify } from '../lib/helpers.js';

const router = express.Router();

// Every route below requires an administrator role read from the database.
router.use(requireAdmin);

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];

router.get('/stats', (req, res) => {
  const counts = one(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN approval_status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN approval_status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN approval_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN approval_status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended
       FROM user_profiles WHERE role = 'member'`,
  );
  const reports = one(`SELECT COUNT(*) AS c FROM abuse_reports WHERE status = 'OPEN'`)?.c || 0;
  const conversations = one(`SELECT COUNT(*) AS c FROM conversations`)?.c || 0;
  return res.json({
    total: counts.total || 0,
    pending: counts.pending || 0,
    approved: counts.approved || 0,
    rejected: counts.rejected || 0,
    suspended: counts.suspended || 0,
    open_reports: reports,
    conversations,
    admin_unread: one(
      `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL AND type IN ('registration','report')`,
      [req.user.id],
    )?.c || 0,
  });
});

router.get('/members', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const status = String(req.query.status || '').trim().toUpperCase();
  const params = [];
  let sql = `SELECT * FROM user_profiles WHERE 1 = 1`;
  if (q) { sql += ` AND full_name LIKE ? COLLATE NOCASE`; params.push(`%${q}%`); }
  if (STATUSES.includes(status)) { sql += ` AND approval_status = ?`; params.push(status); }
  sql += ` ORDER BY CASE approval_status WHEN 'PENDING' THEN 0 ELSE 1 END, created_at DESC LIMIT 300`;
  const rows = all(sql, params);
  return res.json({
    members: rows.map((row) => ({
      ...publicProfile(row),
      email: row.email,
      phone: row.phone,
      role: row.role,
      approval_status: row.approval_status,
      admin_note: row.admin_note,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    })),
  });
});

router.get('/members/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = one(`SELECT * FROM user_profiles WHERE id = ?`, [id]);
  if (!row) return res.status(404).json({ error: 'Xogtaada lama heli.' });
  return res.json({
    member: {
      ...publicProfile(row),
      email: row.email,
      phone: row.phone,
      role: row.role,
      approval_status: row.approval_status,
      admin_note: row.admin_note,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    },
  });
});

router.post('/members/:id/approve', (req, res) => {
  const id = Number(req.params.id);
  const member = one(`SELECT * FROM user_profiles WHERE id = ?`, [id]);
  if (!member) return res.status(404).json({ error: 'Xogtaada lama heli.' });
  if (member.id === req.user.id) {
    return res.status(400).json({ error: 'Adigu ma ansixin karto akoonkaaga.' });
  }
  run(`UPDATE user_profiles SET approval_status = 'APPROVED', admin_note = ?, updated_at = datetime('now') WHERE id = ?`,
    [sanitizeText(req.body?.note, 300) || null, id]);
  notify(id, {
    type: 'approval',
    title: 'Akoonkaaga waa la ansixiyay',
    body: 'Ku soo gal marka hore si aad qofyaasha kale u aragto.',
    link: '#/dashboard',
  });
  return res.json({ message: 'Xogtaada waa la ansixiyay.' });
});

router.post('/members/:id/reject', (req, res) => {
  const id = Number(req.params.id);
  const member = one(`SELECT * FROM user_profiles WHERE id = ?`, [id]);
  if (!member) return res.status(404).json({ error: 'Xogtaada lama heli.' });
  if (member.id === req.user.id) {
    return res.status(400).json({ error: 'Adigu ma diidin karto akoonkaaga.' });
  }
  const note = sanitizeText(req.body?.note, 300);
  run(`UPDATE user_profiles SET approval_status = 'REJECTED', admin_note = ?, updated_at = datetime('now') WHERE id = ?`,
    [note || null, id]);
  notify(id, {
    type: 'rejection',
    title: 'Akoonkaaga waa la diiday',
    body: note || 'Fadlan la xiriir maamulka si aad u hagaajiso xogtaada.',
    link: '#/dashboard',
  });
  return res.json({ message: 'Diiwaangelinta waa la diiday.' });
});

router.post('/members/:id/suspend', (req, res) => {
  const id = Number(req.params.id);
  const member = one(`SELECT * FROM user_profiles WHERE id = ?`, [id]);
  if (!member) return res.status(404).json({ error: 'Xogtaada lama heli.' });
  if (member.id === req.user.id) {
    return res.status(400).json({ error: 'Adigu ma istaagi karto akoonkaaga.' });
  }
  const note = sanitizeText(req.body?.note, 300);
  run(`UPDATE user_profiles SET approval_status = 'SUSPENDED', admin_note = ?, updated_at = datetime('now') WHERE id = ?`,
    [note || null, id]);
  notify(id, {
    type: 'suspension',
    title: 'Akoonkaaga waa la istaagay',
    body: note || 'Fadlan la xiriir maamulka.',
    link: '#/dashboard',
  });
  return res.json({ message: 'Akoonka waa la istaagay.' });
});

router.post('/members/:id/reactivate', (req, res) => {
  const id = Number(req.params.id);
  const member = one(`SELECT * FROM user_profiles WHERE id = ?`, [id]);
  if (!member) return res.status(404).json({ error: 'Xogtaada lama heli.' });
  run(`UPDATE user_profiles SET approval_status = 'APPROVED', updated_at = datetime('now') WHERE id = ?`, [id]);
  notify(id, {
    type: 'approval',
    title: 'Akoonkaaga waa la dib u soo bandhigay',
    body: 'Waad ku soo gal kartaa.',
    link: '#/dashboard',
  });
  return res.json({ message: 'Akoonka waa la dib u soo bandhigay.' });
});

router.delete('/members/:id', (req, res) => {
  const id = Number(req.params.id);
  const member = one(`SELECT * FROM user_profiles WHERE id = ?`, [id]);
  if (!member) return res.status(404).json({ error: 'Xogtaada lama heli.' });
  if (member.id === req.user.id) {
    return res.status(400).json({ error: 'Adigu ma tirtirin karto akoonkaaga.' });
  }
  if (member.role === 'admin') {
    return res.status(403).json({ error: 'Akoonka admin-ka ma la tirtirin karo.' });
  }
  run(`DELETE FROM user_profiles WHERE id = ?`, [id]);
  return res.json({ message: 'Akoonka waa la tirtiray.' });
});

router.get('/reports', (req, res) => {
  const status = String(req.query.status || 'OPEN').toUpperCase();
  const params = [];
  let sql = `SELECT r.*, ru.full_name AS reported_name, rep.full_name AS reporter_name
               FROM abuse_reports r
               JOIN user_profiles ru ON ru.id = r.reported_user_id
               JOIN user_profiles rep ON rep.id = r.reporter_id`;
  if (['OPEN', 'REVIEWED', 'DISMISSED'].includes(status)) { sql += ` WHERE r.status = ?`; params.push(status); }
  sql += ` ORDER BY r.created_at DESC LIMIT 200`;
  return res.json({ reports: all(sql, params) });
});

router.post('/reports/:id/review', (req, res) => {
  const id = Number(req.params.id);
  const status = ['REVIEWED', 'DISMISSED'].includes(String(req.body?.status).toUpperCase())
    ? String(req.body.status).toUpperCase() : 'REVIEWED';
  const report = one(`SELECT * FROM abuse_reports WHERE id = ?`, [id]);
  if (!report) return res.status(404).json({ error: 'Warbixinta lama heli.' });
  run(
    `UPDATE abuse_reports SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`,
    [status, req.user.id, id],
  );
  return res.json({ message: 'Warbixinta waa la eegay.' });
});

export default router;
