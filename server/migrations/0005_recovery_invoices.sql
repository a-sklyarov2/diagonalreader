CREATE TABLE IF NOT EXISTS recovery_invoices (
  invoice_norm TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
