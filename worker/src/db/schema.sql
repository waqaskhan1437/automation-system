CREATE TABLE IF NOT EXISTS settings_postforme (
  id INTEGER PRIMARY KEY,
  api_key TEXT NOT NULL,
  platforms TEXT DEFAULT '[]',
  default_schedule TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings_github (
  id INTEGER PRIMARY KEY,
  pat_token TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  runner_labels TEXT DEFAULT 'self-hosted',
  workflow_dispatch_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings_video_sources (
  id INTEGER PRIMARY KEY,
  bunny_api_key TEXT,
  bunny_library_id TEXT,
  youtube_cookies TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings_ai (
  id INTEGER PRIMARY KEY,
  gemini_key TEXT,
  grok_key TEXT,
  cohere_key TEXT,
  openrouter_key TEXT,
  openai_key TEXT,
  groq_key TEXT,
  default_provider TEXT DEFAULT 'openai',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('video','image')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed','failed')),
  config TEXT NOT NULL DEFAULT '{}',
  schedule TEXT,
  next_run DATETIME,
  last_run DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id INTEGER,
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued','running','success','failed')),
  github_run_id INTEGER,
  github_run_url TEXT,
  input_data TEXT,
  output_data TEXT,
  logs TEXT,
  error_message TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (automation_id) REFERENCES automations(id)
);

CREATE TABLE IF NOT EXISTS video_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  postforme_id TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  upload_status TEXT DEFAULT 'pending' CHECK(upload_status IN ('pending','uploaded','posted','failed')),
  post_status TEXT DEFAULT 'pending' CHECK(post_status IN ('pending','scheduled','posted','failed')),
  scheduled_at DATETIME,
  posted_at DATETIME,
  platforms TEXT DEFAULT '[]',
  aspect_ratio TEXT DEFAULT '9:16',
  duration INTEGER,
  file_size INTEGER,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
