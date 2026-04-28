ALTER TABLE users ADD COLUMN runner_hostname TEXT;
ALTER TABLE users ADD COLUMN runner_status TEXT;
ALTER TABLE users ADD COLUMN runner_started_at DATETIME;
ALTER TABLE users ADD COLUMN runner_last_seen_at DATETIME;
ALTER TABLE users ADD COLUMN runner_platform TEXT;
ALTER TABLE users ADD COLUMN runner_version TEXT;
ALTER TABLE users ADD COLUMN tailscale_status TEXT;
ALTER TABLE users ADD COLUMN tailscale_ip TEXT;
ALTER TABLE users ADD COLUMN tailscale_dns_name TEXT;
ALTER TABLE users ADD COLUMN ssh_status TEXT;
ALTER TABLE users ADD COLUMN ssh_target TEXT;

CREATE TABLE IF NOT EXISTS settings_tailscale (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  auth_key TEXT,
  tailnet TEXT,
  device_tag TEXT,
  hostname_prefix TEXT,
  auto_install INTEGER DEFAULT 0,
  ssh_enabled INTEGER DEFAULT 1,
  unattended INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_settings_tailscale_user ON settings_tailscale(user_id);
