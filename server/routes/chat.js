import express from 'express';
import { all, one, run, transaction } from '../db.js';
import { requireApproved } from '../middleware.js';
import { sanitizeText, notify, unreadCounts, isBlockedBetween } from '../lib/helpers.js';
import { sendToUser, sendToUsers } from '../realtime.js';

const router = express.Router();

const convoWith = (id) => one(
  `SELECT cv.*, pa.full_name AS a_name, pa.profile_photo_url AS a_photo, pa.approval_status AS a_status,
          pb.full_name AS b_name, pb.profile_photo_url AS b_photo, pb.approval_status AS b_status
     FROM conversations cv
     JOIN user_profiles pa ON pa.id = cv.user_a_id
     JOIN user_profiles pb ON pb.id = cv.user_b_id
    WHERE cv.id = ?`,
  [id],
);

const peerOf = (convo, userId) => (convo.user_a_id === userId ? convo.user_b_id : convo.user_a_id);

/** List incoming + outgoing chat requests for the signed-in member. */
router.get('/chat-requests', requireApproved, (req, res) => {
  const incoming = all(
    `SELECT cr.*, u.full_name, u.profile_photo_url, u.city, u.country, u.occupation, u.approval_status
       FROM chat_requests cr
       JOIN user_profiles u ON u.id = cr.sender_id
      WHERE cr.recipient_id = ? ORDER BY cr.created_at DESC`,
    [req.user.id],
  );
  const outgoing = all(
    `SELECT cr.*, u.full_name, u.profile_photo_url, u.city, u.country, u.occupation, u.approval_status
       FROM chat_requests cr
       JOIN user_profiles u ON u.id = cr.recipient_id
      WHERE cr.sender_id = ? ORDER BY cr.created_at DESC`,
    [req.user.id],
  );
  return res.json({ incoming, outgoing });
});

/** Send a chat request to another approved member. */
router.post('/chat-requests', requireApproved, (req, res) => {
  const recipientId = Number(req.body?.recipient_id);
  if (!Number.isInteger(recipientId)) return res.status(400).json({ error: 'Helin aan sax ahayn.' });
  if (recipientId === req.user.id) {
    return res.status(400).json({ error: 'Adigu ma shaqayn karto.' });
  }
  const recipient = one(
    `SELECT id, full_name, approval_status, role FROM user_profiles WHERE id = ?`,
    [recipientId],
  );
  if (!recipient || recipient.approval_status !== 'APPROVED' || recipient.role !== 'member') {
    return res.status(404).json({ error: 'Xogtaada lama heli.' });
  }
  if (isBlockedBetween(req.user.id, recipientId)) {
    return res.status(403).json({ error: 'Waxaa jira xog aanad haysato oo tallaab lagu qaadi karo.' });
  }
  // A conversation that already exists means both sides may keep chatting
  // directly — no new permission request is needed in either direction.
  const conversation = one(
    `SELECT id FROM conversations
      WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)`,
    [req.user.id, recipientId, recipientId, req.user.id],
  );
  if (conversation) {
    return res.status(409).json({
      error: 'Wad horey uu wada hadal kartaa. Diiwaangelin cusub ma baahna.',
      conversation_id: conversation.id,
    });
  }
  const existing = one(
    `SELECT * FROM chat_requests WHERE sender_id = ? AND recipient_id = ?`,
    [req.user.id, recipientId],
  );
  if (existing?.status === 'ACCEPTED') {
    return res.status(409).json({ error: 'Wad already waa la qaatay. Diiwaangelin cusub ma baahna.' });
  }
  if (existing?.status === 'PENDING') {
    return res.status(409).json({ error: 'Diiwaangelin waa diyaar yahay. Suugo jawaabta.' });
  }

  let requestId;
  if (existing) {
    // A rejected request can be sent again.
    run(
      `UPDATE chat_requests SET status = 'PENDING', created_at = datetime('now'), responded_at = NULL WHERE id = ?`,
      [existing.id],
    );
    requestId = existing.id;
  } else {
    const info = run(
      `INSERT INTO chat_requests (sender_id, recipient_id, status) VALUES (?,?, 'PENDING')`,
      [req.user.id, recipientId],
    );
    requestId = Number(info.lastInsertRowid);
  }

  const request = one(`SELECT * FROM chat_requests WHERE id = ?`, [requestId]);
  notify(recipientId, {
    type: 'chat_request',
    title: 'Diiwaangelin wadat ah',
    body: `${req.user.full_name} ayaa ku soo jeeda inuu uu hadal ka yeesho.`,
    link: '#/chats',
  });
  sendToUser(recipientId, 'chat_request', {
    id: request.id,
    sender_id: request.sender_id,
    sender_name: req.user.full_name,
    status: request.status,
    created_at: request.created_at,
  });
  return res.status(201).json({ message: 'Diiwaangelinta waa la diray.', request });
});

/** Accept a chat request → creates the private conversation. */
router.post('/chat-requests/:id/accept', requireApproved, (req, res) => {
  const id = Number(req.params.id);
  const request = one(`SELECT * FROM chat_requests WHERE id = ?`, [id]);
  if (!request) return res.status(404).json({ error: 'Diiwaangelinta lama heli.' });
  if (request.recipient_id !== req.user.id) {
    return res.status(403).json({ error: 'Waxaad qaadan kartaa diiwaangelintaada oo keliya.' });
  }
  if (request.status === 'ACCEPTED') {
    const convo = one(`SELECT * FROM conversations WHERE request_id = ?`, [request.id]);
    return res.json({ message: 'Wad horey uu qaatay.', conversation: convo });
  }
  if (request.status !== 'PENDING') {
    return res.status(409).json({ error: 'Diiwaangelintu waa la diiday.' });
  }

  const conversation = transaction(() => {
    run(
      `UPDATE chat_requests SET status = 'ACCEPTED', responded_at = datetime('now') WHERE id = ?`,
      [request.id],
    );
    const a = Math.min(request.sender_id, request.recipient_id);
    const b = Math.max(request.sender_id, request.recipient_id);
    let convo = one(`SELECT * FROM conversations WHERE user_a_id = ? AND user_b_id = ?`, [a, b]);
    if (!convo) {
      const info = run(
        `INSERT INTO conversations (request_id, user_a_id, user_b_id) VALUES (?,?,?)`,
        [request.id, a, b],
      );
      convo = one(`SELECT * FROM conversations WHERE id = ?`, [Number(info.lastInsertRowid)]);
    }
    return convo;
  });

  notify(request.sender_id, {
    type: 'chat_request',
    title: 'Diiwaangelinta waa la qaatay',
    body: `${req.user.full_name} ayaa qaatay codsashadaada. Hadda waad wada hadal kartaa.`,
    link: '#/chats',
  });
  sendToUser(request.sender_id, 'chat_accepted', { conversation_id: conversation.id });
  sendToUsers([request.sender_id, request.recipient_id], 'conversation_update', {
    conversation_id: conversation.id,
  });
  return res.json({ message: 'Diiwaangelinta waa la qaatay.', conversation });
});

/** Reject a chat request → conversation stays locked. */
router.post('/chat-requests/:id/reject', requireApproved, (req, res) => {
  const id = Number(req.params.id);
  const request = one(`SELECT * FROM chat_requests WHERE id = ?`, [id]);
  if (!request) return res.status(404).json({ error: 'Diiwaangelinta lama heli.' });
  if (request.recipient_id !== req.user.id) {
    return res.status(403).json({ error: 'Waxaad qaadan kartaa diiwaangelintaada oo keliya.' });
  }
  if (request.status !== 'PENDING') {
    return res.status(409).json({ error: 'Diiwaangelintu horey uu qaatay ama la diiday.' });
  }
  run(
    `UPDATE chat_requests SET status = 'REJECTED', responded_at = datetime('now') WHERE id = ?`,
    [request.id],
  );
  notify(request.sender_id, {
    type: 'chat_request',
    title: 'Diiwaangelinta waa la diiday',
    body: `${req.user.full_name} ayaa diiday codsashadaada.`,
    link: '#/chats',
  });
  sendToUser(request.sender_id, 'chat_rejected', { request_id: request.id });
  return res.json({ message: 'Diiwaangelinta waa la diiday.' });
});

/** My conversations (approved members only). */
router.get('/conversations', requireApproved, (req, res) => {
  const rows = all(
    `SELECT cv.id, cv.created_at, cv.user_a_id, cv.user_b_id,
            pa.full_name AS a_name, pa.profile_photo_url AS a_photo,
            pb.full_name AS b_name, pb.profile_photo_url AS b_photo,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = cv.id AND m.sender_id <> ?
               AND m.read_at IS NULL AND m.deleted_at IS NULL) AS unread,
            (SELECT m.message_text FROM messages m WHERE m.conversation_id = cv.id AND m.deleted_at IS NULL
               ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message,
            (SELECT m.created_at FROM messages m WHERE m.conversation_id = cv.id AND m.deleted_at IS NULL
               ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_at
       FROM conversations cv
       JOIN user_profiles pa ON pa.id = cv.user_a_id
       JOIN user_profiles pb ON pb.id = cv.user_b_id
      WHERE cv.user_a_id = ? OR cv.user_b_id = ?
      ORDER BY COALESCE(last_at, cv.created_at) DESC`,
    [req.user.id, req.user.id, req.user.id],
  );
  const conversations = rows.map((row) => ({
    id: row.id,
    peer: {
      id: row.user_a_id === req.user.id ? row.user_b_id : row.user_a_id,
      full_name: row.user_a_id === req.user.id ? row.b_name : row.a_name,
      profile_photo_url: row.user_a_id === req.user.id ? row.b_photo : row.a_photo,
    },
    unread: row.unread,
    last_message: row.last_message,
    last_at: row.last_at,
    created_at: row.created_at,
  }));
  return res.json({ conversations, counts: unreadCounts(req.user.id) });
});

/** Messages of one conversation — only for the two participants. */
router.get('/conversations/:id/messages', requireApproved, (req, res) => {
  const convo = convoWith(Number(req.params.id));
  if (!convo) return res.status(404).json({ error: 'Wada hadalka lama heli.' });
  if (convo.user_a_id !== req.user.id && convo.user_b_id !== req.user.id) {
    return res.status(403).json({ error: 'Waxaad gali kartaa wada hadalkaaga oo keliya.' });
  }
  const messages = all(
    `SELECT id, conversation_id, sender_id, message_text, created_at, read_at, deleted_at, edited_at
       FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC`,
    [convo.id],
  );
  // Mark incoming messages as read.
  run(
    `UPDATE messages SET read_at = datetime('now')
      WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL AND deleted_at IS NULL`,
    [convo.id, req.user.id],
  );
  const peerId = peerOf(convo, req.user.id);
  sendToUser(peerId, 'messages_read', { conversation_id: convo.id, reader_id: req.user.id });
  return res.json({ messages, peer_id: peerId });
});

/** Send a message inside an existing (accepted) conversation. */
router.post('/conversations/:id/messages', requireApproved, (req, res) => {
  const convo = convoWith(Number(req.params.id));
  if (!convo) return res.status(404).json({ error: 'Wada hadalka lama heli.' });
  if (convo.user_a_id !== req.user.id && convo.user_b_id !== req.user.id) {
    return res.status(403).json({ error: 'Waxaad gali kartaa wada hadalkaaga oo keliya.' });
  }
  const peerId = peerOf(convo, req.user.id);
  if (isBlockedBetween(req.user.id, peerId)) {
    return res.status(403).json({ error: 'Wada hadalka waa la xannibay.' });
  }
  const text = sanitizeText(req.body?.message_text, 2000);
  if (!text) return res.status(400).json({ error: 'Fadlan qor fariin.' });
  const info = run(
    `INSERT INTO messages (conversation_id, sender_id, message_text) VALUES (?,?,?)`,
    [convo.id, req.user.id, text],
  );
  const message = one(`SELECT * FROM messages WHERE id = ?`, [Number(info.lastInsertRowid)]);
  sendToUser(peerId, 'message', message);
  notify(peerId, {
    type: 'message',
    title: `Fariin cusub oo ka yimid ${req.user.full_name}`,
    body: text.slice(0, 120),
    link: `#/chats/${convo.id}`,
  });
  sendToUsers([req.user.id, peerId], 'unread_update', unreadCounts(req.user.id));
  return res.status(201).json({ message });
});

/** Edit my own message. */
router.patch('/messages/:id', requireApproved, (req, res) => {
  const id = Number(req.params.id);
  const message = one(`SELECT * FROM messages WHERE id = ?`, [id]);
  if (!message) return res.status(404).json({ error: 'Fariinka lama heli.' });
  if (message.sender_id !== req.user.id) {
    return res.status(403).json({ error: 'Waxaad beddeli kartaa fariintiisa oo keliya.' });
  }
  const text = sanitizeText(req.body?.message_text, 2000);
  if (!text) return res.status(400).json({ error: 'Fadlan qor fariin.' });
  run(
    `UPDATE messages SET message_text = ?, edited_at = datetime('now') WHERE id = ?`,
    [text, id],
  );
  const updated = one(`SELECT * FROM messages WHERE id = ?`, [id]);
  const convo = convoWith(message.conversation_id);
  sendToUsers([convo.user_a_id, convo.user_b_id], 'message_updated', updated);
  return res.json({ message: updated });
});

/** Delete my own message (soft delete). */
router.delete('/messages/:id', requireApproved, (req, res) => {
  const id = Number(req.params.id);
  const message = one(`SELECT * FROM messages WHERE id = ?`, [id]);
  if (!message) return res.status(404).json({ error: 'Fariinka lama heli.' });
  if (message.sender_id !== req.user.id) {
    return res.status(403).json({ error: 'Waxaad tirtiri kartaa fariintiisa oo keliya.' });
  }
  run(`UPDATE messages SET deleted_at = datetime('now') WHERE id = ?`, [id]);
  const convo = convoWith(message.conversation_id);
  sendToUsers([convo.user_a_id, convo.user_b_id], 'message_deleted', { id, conversation_id: convo.id });
  return res.json({ message: 'Fariinka waa la tirtiray.' });
});

export default router;
