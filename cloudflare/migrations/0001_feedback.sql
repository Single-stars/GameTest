CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category TEXT NOT NULL CHECK (category IN ('bug', 'idea', 'chat')),
  content TEXT NOT NULL CHECK (length(content) <= 250),
  page TEXT NOT NULL DEFAULT 'result',
  user_agent TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback (category);
