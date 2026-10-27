import fs from 'node:fs';
import path from 'node:path';
import sqlite from 'node-sqlite3-wasm';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'guurdoon.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new sqlite.Database(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/**
 * Schema — mirrors the requested Supabase model:
 * user_profiles, chat_requests, conversations, messages, notifications,
 * blocked_users, abuse_reports.
 * Authorization is enforced in the service layer (server side) on top of these
 * foreign keys and constraints.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS user_profiles (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  auth_user_id      TEXT UNIQUE NOT NULL,
  email             TEXT UNIQUE,
  phone             TEXT UNIQUE,
  password_hash     TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  date_of_birth     TEXT NOT NULL,
  gender            TEXT NOT NULL,
  marital_status    TEXT NOT NULL,
  country           TEXT NOT NULL,
  city              TEXT NOT NULL,
  education         TEXT NOT NULL DEFAULT '',
  occupation        TEXT NOT NULL DEFAULT '',
  bio               TEXT NOT NULL DEFAULT '',
  partner_preferences TEXT NOT NULL DEFAULT '',
  profile_photo_url TEXT,
  role              TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  approval_status   TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (approval_status IN ('PENDING','APPROVED','REJECTED','SUSPENDED')),
  admin_note        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_profiles_status ON user_profiles(approval_status);
CREATE INDEX IF NOT EXISTS idx_profiles_name   ON user_profiles(full_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_profiles_role   ON user_profiles(role);

CREATE TABLE IF NOT EXISTS chat_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id     INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  recipient_id  INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at  TEXT,
  CHECK (sender_id <> recipient_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_request_pair ON chat_requests(sender_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_chat_request_recipient ON chat_requests(recipient_id, status);

CREATE TABLE IF NOT EXISTS conversations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   INTEGER UNIQUE REFERENCES chat_requests(id) ON DELETE SET NULL,
  user_a_id    INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  user_b_id    INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (user_a_id <> user_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_pair ON conversations(user_a_id, user_b_id);

CREATE TABLE IF NOT EXISTS messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id      INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  message_text   TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  read_at        TEXT,
  deleted_at     TEXT,
  edited_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS blocked_users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  blocker_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (blocker_id <> blocked_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_block_pair ON blocked_users(blocker_id, blocked_id);

CREATE TABLE IF NOT EXISTS abuse_reports (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id      INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  reported_user_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  conversation_id  INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  reason           TEXT NOT NULL,
  details          TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED','DISMISSED')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by      INTEGER REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewed_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON abuse_reports(status, created_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/** Small query helpers -------------------------------------------------- */
export const one = (sql, params = []) => db.get(sql, params) || null;
export const all = (sql, params = []) => db.all(sql, params);
export const run = (sql, params = []) => db.run(sql, params);

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

export default db;
