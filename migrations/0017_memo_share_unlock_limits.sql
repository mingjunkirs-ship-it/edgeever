PRAGMA foreign_keys = ON;

-- A share-level bucket complements the per-client backoff table.  It keeps a
-- distributed set of clients from making an unbounded number of expensive
-- password verifications against one public share.
CREATE TABLE memo_share_unlock_limits (
  memo_id TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (memo_id) REFERENCES memo_shares(memo_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX idx_memo_share_unlock_limits_updated
  ON memo_share_unlock_limits(updated_at);
