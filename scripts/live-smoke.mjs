#!/usr/bin/env node
/**
 * Guurdoon — live end-to-end smoke test.
 *
 * Exercises the deployed site over real HTTP (no mocks): registration ->
 * admin approval -> directory/search -> chat request -> accept -> private
 * conversation -> SSE real-time delivery -> block/report -> cleanup.
 *
 * Usage:
 *   node scripts/live-smoke.mjs                       # against the live URL
 *   BASE_URL=http://localhost:3000 node scripts/live-smoke.mjs
 *   ADMIN_PASSWORD=... node scripts/live-smoke.mjs
 *
 * Exits 0 only when every assertion passes; non-zero on the first failure.
 */
const BASE = (process.env.BASE_URL || 'https://a4it6rlfom.dev.onappjet.com').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@guurdoon.so';
// Read the admin password from the environment — never hardcode a live secret in the repo.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (!ADMIN_PASSWORD) {
  console.error('Set ADMIN_PASSWORD (and optionally ADMIN_EMAIL / BASE_URL) before running this script.');
  process.exit(2);
}

let failures = 0;
const log = (msg) => console.log(msg);
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  return ok;
}

/** Minimal cookie-aware HTTP client. */
class Client {
  constructor() { this.cookies = new Map(); }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  store(res) {
    for (const line of res.headers.getSetCookie?.() || []) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  async req(method, url, body) {
    if (method !== 'GET' && !this.cookies.get('gd_csrf')) await this.req('GET', '/api/health');
    const headers = {};
    const cookie = this.header();
    if (cookie) headers.Cookie = cookie;
    const csrf = this.cookies.get('gd_csrf');
    if (csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf;
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + url, { method, headers, body: payload, redirect: 'manual' });
    this.store(res);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = text.slice(0, 200); }
    return { status: res.status, body: json };
  }
  get(url) { return this.req('GET', url); }
  post(url, body) { return this.req('POST', url, body ?? {}); }
  del(url) { return this.req('DELETE', url); }
  async login(identifier, password) {
    this.cookies.clear();
    await this.get('/api/health');
    return this.post('/api/auth/login', { identifier, password });
  }
}

const stamp = Date.now();
const profile = (name, email) => ({
  full_name: name,
  contact: email,
  password: 'Passw0rd!23',
  password_confirm: 'Passw0rd!23',
  gender: 'Male',
  date_of_birth: '1995-04-02',
  marital_status: 'Single',
  country: 'Somalia',
  city: 'Mogadishu',
  education: 'Bachelor',
  occupation: 'Engineer',
  bio: 'Waa waxaan ku jiraa bogga Guurdoon oo aan raadinayo lammaanaha noloshaada.',
  partner_preferences: 'Qof naxariista badan',
});

const admin = new Client();
const created = [];

try {
  // --- service health -----------------------------------------------------
  const health = await new Client().get('/api/health');
  check('health responds 200', health.status, 200);

  // --- forged / expired session cookie must not authenticate --------------
  const forged = new Client();
  forged.cookies.set('gd_session', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbi0xNzkiMTk5OSIsImV4cCI6MX0.invalid-signature');
  const forgedAdmin = await forged.get('/api/admin/stats');
  check('forged token rejected on admin endpoint', forgedAdmin.status, 401);

  // --- admin login --------------------------------------------------------
  const adminLogin = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check('admin login 200', adminLogin.status, 200);
  check('admin role granted', adminLogin.body?.user?.role, 'admin');

  // --- registration is PENDING and hidden from the public directory -------
  const m1 = new Client();
  const m2 = new Client();
  const reg1 = await m1.post('/api/auth/register', profile(`Halkan ${stamp}`, `l1_${stamp}@example.com`));
  const reg2 = await m2.post('/api/auth/register', profile(`Labaad ${stamp}`, `l2_${stamp}@example.com`));
  check('registration 201', reg1.status, 201);
  check('registration shows Somali confirmation',
    reg1.body?.message, 'Diiwaangelintaada waa la helay. Fadlan sug ansixinta maamulka.');
  check('new member is PENDING', reg1.body?.user?.approval_status, 'PENDING');
  check('pending member hidden from directory',
    (await new Client().get('/api/members')).body?.members?.length, 0);

  // --- a member can never approve themselves ------------------------------
  const selfApprove = await m1.post(`/api/admin/members/${reg1.body.user.id}/approve`, {});
  check('self-approval blocked', selfApprove.status, 403);

  // --- pending members cannot use member-only features -------------------
  const pendingChat = await m1.get('/api/chat-requests');
  check('pending member blocked from member-only features', pendingChat.status, 403);
  check('public directory stays readable before approval',
    (await new Client().get('/api/members')).status, 200);

  // --- admin approves both members ----------------------------------------
  check('admin approves member 1',
    (await admin.post(`/api/admin/members/${reg1.body.user.id}/approve`, {})).body?.message,
    'Xogtaada waa la ansixiyay.');
  check('admin approves member 2',
    (await admin.post(`/api/admin/members/${reg2.body.user.id}/approve`, {})).body?.message,
    'Xogtaada waa la ansixiyay.');

  await m1.login(`l1_${stamp}@example.com`, 'Passw0rd!23');
  await m2.login(`l2_${stamp}@example.com`, 'Passw0rd!23');
  check('approved member can log in', (await m1.get('/api/auth/me')).body?.user?.approval_status, 'APPROVED');

  // --- directory + search -------------------------------------------------
  const dir = await m1.get('/api/members');
  check('directory lists approved members', dir.body?.members?.length, 2);
  check('search by name filters', (await m1.get(`/api/members?q=Labaad`)).body?.members?.length, 1);
  check('private contact details are not exposed',
    dir.body?.members?.some((m) => m.contact || m.email || m.phone), false);

  // --- chat request -> accept -> private conversation ---------------------
  const request = await m1.post('/api/chat-requests', { recipient_id: reg2.body.user.id, message: 'Salaan!' });
  check('chat request created', request.status, 201);
  const requestId = request.body?.request?.id ?? request.body?.id;
  const inbox = await m2.get('/api/chat-requests');
  check('recipient sees incoming request', inbox.body?.incoming?.length, 1);
  check('recipient sees no outgoing requests', inbox.body?.outgoing?.length, 0);
  const outbox = await m1.get('/api/chat-requests');
  check('sender sees outgoing request', outbox.body?.outgoing?.length, 1);
  const accept = await m2.post(`/api/chat-requests/${requestId}/accept`, {});
  check('request accepted', accept.status, 200);
  const conversationId = accept.body?.conversation?.id;

  // --- SSE real-time delivery --------------------------------------------
  const stream = await fetch(`${BASE}/api/events`, { headers: { Cookie: m2.header() } });
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let events = '';
  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        events += decoder.decode(value, { stream: true });
        if (events.includes('event: message')) break;
      }
    } catch { /* stream closed */ }
  })();

  check('message sent', (await m1.post(`/api/conversations/${conversationId}/messages`,
    { message_text: 'Sawirrada waa ku wanaagsan!' })).status, 201);
  await new Promise((r) => setTimeout(r, 2500));
  const inbox2 = await m2.get(`/api/conversations/${conversationId}/messages`);
  check('recipient received the message', inbox2.body?.messages?.length, 1);
  check('message text persisted', inbox2.body?.messages?.[0]?.message_text, 'Sawirrada waa ku wanaagsan!');
  check('SSE delivered the message in real time', events.includes('event: message'), true);
  reader.cancel().catch(() => {});

  // --- unread counters ----------------------------------------------------
  const unread = await m2.get('/api/notifications/unread-count');
  check('unread counter is populated', unread.body?.total > 0, true);

  // --- a third member cannot read the conversation ------------------------
  const m3 = new Client();
  const reg3 = await m3.post('/api/auth/register', profile(`Sade ${stamp}`, `l3_${stamp}@example.com`));
  created.push(reg3.body.user.id);
  await admin.post(`/api/admin/members/${reg3.body.user.id}/approve`, {});
  await m3.login(`l3_${stamp}@example.com`, 'Passw0rd!23');
  check('non-participant blocked from conversation',
    (await m3.get(`/api/conversations/${conversationId}/messages`)).status, 403);

  // --- blocking stops messaging ------------------------------------------
  const block = await m1.post('/api/notifications/blocks', { blocked_id: reg2.body.user.id });
  check('block accepted', block.status, 200);
  check('blocker is listed', (await m1.get('/api/notifications/blocks')).body?.blocked?.length, 1);
  check('blocker cannot message the blocked member',
    (await m1.post(`/api/conversations/${conversationId}/messages`, { message_text: 'after block' })).status, 403);
  check('blocked member cannot reply',
    (await m2.post(`/api/conversations/${conversationId}/messages`, { message_text: 'reply' })).status, 403);
  await m1.del(`/api/notifications/blocks/${reg2.body.user.id}`);
  check('messaging resumes after unblock',
    (await m1.post(`/api/conversations/${conversationId}/messages`, { message_text: 'after unblock' })).status, 201);

  // --- reports reach the admin without exposing message content -----------
  const report = await m1.post('/api/notifications/reports', {
    reported_user_id: reg2.body.user.id, reason: 'Abuse test', details: 'test report', conversation_id: conversationId,
  });
  check('report submitted', report.status, 201);
  const adminReports = await admin.get('/api/admin/reports?status=OPEN');
  check('admin sees the open report', adminReports.body?.reports?.length, 1);
  const reportFields = Object.keys(adminReports.body.reports[0]).join(',');
  check('report exposes no message body', reportFields.includes('message_text'), false);

  // --- cleanup: remove every test account ---------------------------------
  for (const id of [reg1.body.user.id, reg2.body.user.id, reg3.body.user.id]) {
    const del = await admin.del(`/api/admin/members/${id}`);
    check(`test account ${id} removed`, del.status, 200);
  }
  await admin.post('/api/notifications/read-all', {});
  const stats = await admin.get('/api/admin/stats');
  check('no members remain', stats.body?.total, 0);
  check('no open reports remain', stats.body?.open_reports, 0);
  check('public directory is empty', (await new Client().get('/api/members')).body?.members?.length, 0);
} catch (err) {
  failures += 1;
  console.error('live-smoke crashed:', err);
} finally {
  if (created.length) {
    for (const id of created) await admin.del(`/api/admin/members/${id}`).catch(() => {});
  }
}

console.log(failures === 0 ? '\nLIVE SMOKE: all checks passed' : `\nLIVE SMOKE: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
