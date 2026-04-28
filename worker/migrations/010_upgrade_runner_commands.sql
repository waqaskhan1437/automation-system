-- Expand runner_commands command_type constraint to support new local runner actions
CREATE TABLE runner_commands_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  requested_by_user_id INTEGER,
  command_type TEXT NOT NULL CHECK(command_type IN ('restart_runner','run_setup','sync_runner_code','refresh_remote_access','process_image','upload_media','fetch_videos','execute_script')),
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','cancelled')),
  result_text TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id)
);

INSERT INTO runner_commands_new (
  id,
  user_id,
  requested_by_user_id,
  command_type,
  payload,
  status,
  result_text,
  error_message,
  created_at,
  started_at,
  completed_at,
  updated_at
)
SELECT
  id,
  user_id,
  requested_by_user_id,
  command_type,
  payload,
  status,
  result_text,
  error_message,
  created_at,
  started_at,
  completed_at,
  updated_at
FROM runner_commands;

DROP TABLE runner_commands;

ALTER TABLE runner_commands_new RENAME TO runner_commands;

CREATE INDEX IF NOT EXISTS idx_runner_commands_user_status ON runner_commands(user_id, status, created_at);
