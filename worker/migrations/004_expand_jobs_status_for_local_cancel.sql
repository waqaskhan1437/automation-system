PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS jobs__new;

CREATE TABLE jobs__new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id INTEGER,
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued','pending','running','success','failed','cancelled')),
  github_run_id INTEGER,
  github_run_url TEXT,
  input_data TEXT,
  output_data TEXT,
  logs TEXT,
  error_message TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  video_url TEXT,
  user_id INTEGER,
  updated_at DATETIME,
  FOREIGN KEY (automation_id) REFERENCES automations(id)
);

INSERT INTO jobs__new (
  id,
  automation_id,
  status,
  github_run_id,
  github_run_url,
  input_data,
  output_data,
  logs,
  error_message,
  started_at,
  completed_at,
  created_at,
  video_url,
  user_id,
  updated_at
)
SELECT
  id,
  automation_id,
  CASE
    WHEN status IN ('queued','pending','running','success','failed','cancelled') THEN status
    ELSE 'failed'
  END,
  github_run_id,
  github_run_url,
  input_data,
  output_data,
  logs,
  error_message,
  started_at,
  completed_at,
  created_at,
  video_url,
  user_id,
  updated_at
FROM jobs;

DROP TABLE jobs;
ALTER TABLE jobs__new RENAME TO jobs;
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
PRAGMA foreign_keys = ON;
