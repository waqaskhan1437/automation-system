PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS automations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('video','image','caption','dubbing')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed','failed')),
  config TEXT NOT NULL DEFAULT '{}',
  schedule TEXT,
  next_run DATETIME,
  last_run DATETIME,
  rotation_reset_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO automations_new (
  id, user_id, name, type, status, config, schedule,
  next_run, last_run, rotation_reset_at, created_at, updated_at
)
SELECT
  id, user_id, name, type, status, config, schedule,
  next_run, last_run, rotation_reset_at, created_at, updated_at
FROM automations;

DROP TABLE automations;

ALTER TABLE automations_new RENAME TO automations;

CREATE INDEX IF NOT EXISTS idx_automations_user ON automations(user_id);

PRAGMA foreign_keys = ON;
