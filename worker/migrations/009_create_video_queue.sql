-- Create video_queue table for sequential source processing
CREATE TABLE IF NOT EXISTS video_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id INTEGER NOT NULL,
  job_id INTEGER NOT NULL,
  video_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  video_title TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','downloaded','uploaded','completed','failed')),
  queue_position INTEGER NOT NULL,
  litterbox_url TEXT,
  litterbox_expires_at DATETIME,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  FOREIGN KEY (automation_id) REFERENCES automations(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_video_queue_job_id ON video_queue(job_id);
CREATE INDEX IF NOT EXISTS idx_video_queue_automation_id ON video_queue(automation_id);
CREATE INDEX IF NOT EXISTS idx_video_queue_status ON video_queue(status);
CREATE INDEX IF NOT EXISTS idx_video_queue_position ON video_queue(job_id, queue_position);
