# Guurdoon

**Guurdoon — Hel lammaanaha noloshaada.**

Goob lagu helo lammaanaha noloshaada si ammaan ah oo lagu kalsoocaado. A Somali-language
matchmaking platform with secure authentication, admin approval workflow, an approved-member
directory and private one-to-one realtime chat.

---

## Tech stack

| Layer | Choice | Cost |
|---|---|---|
| Server | Node.js 18+ / Express 5 | Free |
| Database | SQLite via `node-sqlite3-wasm` (file-persistent) | Free |
| Auth | `scrypt` password hashing + JWT in an `HttpOnly` cookie | Free |
| Real-time | Server-Sent Events (SSE) — no external service needed | Free |
| Frontend | Vanilla ES modules, no build step | Free |
| Hosting | Any container host with a persistent volume (Dockerfile included) | Free tier available |

No paid API, no external realtime broker, no domain purchase is required.

---

## Quick start

```bash
npm install
npm start           # http://localhost:3000
```

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `DATA_DIR` | Directory holding the SQLite DB and uploaded photos | `./data` |
| `DB_PATH` | Explicit database file path | `$DATA_DIR/guurdoon.db` |
| `UPLOAD_DIR` | Directory for profile photos | `$DATA_DIR/uploads` |
| `JWT_SECRET` | Signing key for session tokens — **set a long random value in production** | dev fallback |
| `ADMIN_EMAIL` | First administrator's email (only used when no admin exists) | — |
| `ADMIN_PASSWORD` | First administrator's password | — |

### Creating the first administrator

The account is created automatically on first start **only if no administrator exists yet**,
so setting `ADMIN_EMAIL`/`ADMIN_PASSWORD` later can never silently take over a live account.

```bash
ADMIN_EMAIL=admin@guurdoon.so ADMIN_PASSWORD='a-strong-password' npm start
```

You can also create one explicitly:

```bash
npm run create-admin
```

---

## Feature map

**Registration** — full name, email *or* phone, password + confirmation, gender, date of
birth (18+ enforced), marital status (Single / Gabar / Garoob / Xaasle), country, city,
education, occupation, short introduction, preferred partner traits and an optional photo.
All fields validated server-side; passwords are hashed with `scrypt` (N=16384, r=8, p=1,
64-byte key) and never stored in plain text. Duplicate contacts are rejected. New accounts
land in `PENDING` and the response is exactly:

> Diiwaangelintaada waa la helay. Fadlan sug ansixinta maamulka.

Members can never approve their own account — approval lives behind
`requireAdmin` on the server.

**Login / account management** — login, logout, password-reset request flow, role-based
dashboards. Pending members see a waiting page; rejected and suspended members are refused
member-only endpoints. Approved members edit only their own profile and photo.

**Admin dashboard** — totals (registered / pending / approved / rejected / suspended),
registration date and status, search by name, full profile view, approve, reject, suspend,
reactivate, remove, review abuse reports, and a notification feed for new registrations.
Every admin route is guarded on the backend; the role is never writable from the client.

**Directory** — approved members only, with photo, name, age, city, country, marital status,
education, occupation and introduction, plus search by name and a profile detail page.
Private contact details are stripped from public payloads.

**Private chat** — approved members only. Send a chat request; the recipient accepts or
rejects it; pending requests appear in the recipient's Chats tab. Acceptance creates a
conversation between exactly those two members; rejection leaves it locked. Once connected,
neither side is asked for permission again. Messages are persisted, delivered live over SSE,
timestamped, and counted as unread. Members can edit or delete only their own messages,
and can block or report abusive accounts. Administrators have **no** automatic access to
private message contents.

**Database** — `user_profiles`, `chat_requests`, `conversations`, `messages`,
`notifications`, `blocked_users`, `abuse_reports` with foreign keys, indexes, validation
and server-side authorization on every query path.

---

## API surface

| Method | Endpoint | Access |
|---|---|---|
| `GET` | `/api/health` | public |
| `POST` | `/api/auth/register` | public |
| `POST` | `/api/auth/login` / `logout` | public / signed-in |
| `GET` | `/api/auth/me` | signed-in |
| `POST` | `/api/auth/password-reset/request` | public |
| `GET`/`PUT` | `/api/profile` | signed-in (own profile only) |
| `POST` | `/api/profile/photo` | signed-in (own photo only) |
| `GET` | `/api/members`, `/api/members/:id` | approved members |
| `GET`/`POST` | `/api/chat-requests` | approved members |
| `POST` | `/api/chat-requests/:id/accept` / `reject` | recipient only |
| `GET` | `/api/conversations`, `/api/conversations/:id/messages` | participants only |
| `POST` | `/api/conversations/:id/messages` | participants only |
| `PATCH`/`DELETE` | `/api/messages/:id` | own messages only |
| `GET`/`POST` | `/api/notifications`, `/api/notifications/unread-count`, `/read-all` | signed-in |
| `GET`/`POST` | `/api/notifications/blocks`, `/api/notifications/reports` | signed-in |
| `GET`/`POST` | `/api/admin/*` | admin only |
| `GET` | `/api/events` | signed-in (SSE stream) |

---

## Security notes

- Passwords: `scrypt` with a per-user random salt; constant-time comparison.
- Sessions: JWT in an `HttpOnly`, `SameSite=Lax` cookie; the role is read from the
  database on every request, never trusted from the token payload alone.
- CSRF: double-submit cookie (`gd_csrf`) required on every state-changing request.
- Rate limiting on login, registration and password-reset endpoints.
- Security headers: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- Uploads: images only, size-limited, stored outside the web root and served read-only.
- Public API payloads never include password hashes, emails or phone numbers.

---

## Tests

```bash
npm test
```

`test/journey.test.js` boots a real server against a temporary database and drives the
whole journey: registration validation, pending gating, admin approval, directory listing,
profile editing, chat request → accept → private conversation → persistent messages,
rejected-request locking, blocking and reporting, suspend/reactivate/remove, logout and the
password-reset flow.

---

## Deployment notes

The included `Dockerfile` runs the app with `npm start` on `PORT` and binds to `0.0.0.0`.
Point `DATA_DIR` at a **persistent volume** (for example `/data`) so the SQLite database and
uploaded photos survive restarts and redeploys. A `.dockerignore` keeps `node_modules`, the
local `data/` folder and the test suite out of the image.

Features that would require a paid provider (none are used today): sending SMS/email
verification codes, pushing to mobile apps, object storage for photos at scale, or a
custom domain with TLS. The current implementation deliberately avoids all of them.
