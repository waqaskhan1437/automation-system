-- AI Developer Access / API key control system
ALTER TABLE api_keys ADD COLUMN description TEXT;
ALTER TABLE api_keys ADD COLUMN scopes TEXT DEFAULT '[]';
ALTER TABLE api_keys ADD COLUMN allowed_origins TEXT DEFAULT '[]';
ALTER TABLE api_keys ADD COLUMN allow_production_deploy INTEGER DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN allow_direct_file_write INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS ai_change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  api_key_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  request_payload TEXT,
  result_payload TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_change_requests_user ON ai_change_requests(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_change_requests_api_key ON ai_change_requests(api_key_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_change_requests_action ON ai_change_requests(action, created_at);
