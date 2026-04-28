ALTER TABLE settings_postforme ADD COLUMN saved_accounts TEXT DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_settings_postforme_user ON settings_postforme(user_id);
