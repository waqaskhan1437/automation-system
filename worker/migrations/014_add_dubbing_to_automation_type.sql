-- Add 'dubbing' to the automations.type CHECK constraint
-- The old schema only allows: type IN ('video','image')
-- We need: type IN ('video','image','caption','dubbing')

-- SQLite doesn't support ALTER TABLE to modify CHECK constraints,
-- so we recreate the table.
-- Note: remote DB had user_id INTEGER (nullable) without FK constraint,
-- so we match that structure here for compatibility.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS automations_v2;

CREATE TABLE automations_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('video','image','caption','dubbing')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed','failed')),
  config TEXT NOT NULL DEFAULT '{}',
  schedule TEXT,
  next_run DATETIME,
  last_run DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  rotation_reset_at DATETIME
);

INSERT INTO automations_v2 (
  id, name, type, status, config, schedule,
  next_run, last_run, created_at, updated_at, user_id, rotation_reset_at
)
SELECT
  id, name, type, status, config, schedule,
  next_run, last_run, created_at, updated_at, user_id, rotation_reset_at
FROM automations;

DROP TABLE automations;

ALTER TABLE automations_v2 RENAME TO automations;

PRAGMA foreign_keys = ON;
