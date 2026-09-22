CREATE TABLE IF NOT EXISTS recovery_pending (
  user_id TEXT PRIMARY KEY,
  recovery_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS recovery_links (
  email TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS recovery_attempts (
  email TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE stripe_customers ADD COLUMN subscription_id TEXT;
