-- Create processed_videos table for deduplication
CREATE TABLE IF NOT EXISTS processed_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id INTEGER NOT NULL,
  video_url TEXT NOT NULL,
  video_id TEXT,
  video_title TEXT,
  job_id INTEGER,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(automation_id, video_url),
  FOREIGN KEY (automation_id) REFERENCES automations(id)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_processed_videos_automation ON processed_videos(automation_id);
CREATE INDEX IF NOT EXISTS idx_processed_videos_url ON processed_videos(automation_id, video_url);
