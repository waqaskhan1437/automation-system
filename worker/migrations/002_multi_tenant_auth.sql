CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  access_token_hash TEXT UNIQUE,
  runner_token_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','suspended')),
  created_by_admin INTEGER DEFAULT 1,
  last_login_at DATETIME,
  revoked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE settings_postforme ADD COLUMN user_id INTEGER;
ALTER TABLE settings_github ADD COLUMN user_id INTEGER;
ALTER TABLE settings_video_sources ADD COLUMN user_id INTEGER;
ALTER TABLE settings_ai ADD COLUMN user_id INTEGER;
ALTER TABLE automations ADD COLUMN user_id INTEGER;
ALTER TABLE jobs ADD COLUMN user_id INTEGER;
ALTER TABLE jobs ADD COLUMN updated_at DATETIME;
ALTER TABLE video_uploads ADD COLUMN user_id INTEGER;
ALTER TABLE processed_videos ADD COLUMN user_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_access_token_hash ON users(access_token_hash);
CREATE INDEX IF NOT EXISTS idx_users_runner_token_hash ON users(runner_token_hash);
CREATE INDEX IF NOT EXISTS idx_settings_postforme_user ON settings_postforme(user_id);
CREATE INDEX IF NOT EXISTS idx_settings_github_user ON settings_github(user_id);
CREATE INDEX IF NOT EXISTS idx_settings_video_sources_user ON settings_video_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_settings_ai_user ON settings_ai(user_id);
CREATE INDEX IF NOT EXISTS idx_automations_user ON automations(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_video_uploads_user ON video_uploads(user_id);
