CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  day TEXT NOT NULL,
  free_used INTEGER NOT NULL DEFAULT 0,
  paid_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month, day)
);
