PRAGMA foreign_keys = ON;

CREATE TABLE memo_shares (
  memo_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
  password_hash TEXT,
  expires_at TEXT,
  allow_attachments INTEGER NOT NULL DEFAULT 0 CHECK (allow_attachments IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (memo_id) REFERENCES memos(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX idx_memo_shares_workspace
  ON memo_shares(workspace_id, is_enabled, updated_at DESC);

CREATE TABLE memo_share_unlock_attempts (
  memo_id TEXT NOT NULL,
  client_key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (memo_id, client_key),
  FOREIGN KEY (memo_id) REFERENCES memo_shares(memo_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX idx_memo_share_unlock_attempts_updated
  ON memo_share_unlock_attempts(updated_at);
