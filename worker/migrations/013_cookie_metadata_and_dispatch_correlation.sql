-- Adds metadata for uploaded cookies so the UI/API can verify which fresh file is active.
ALTER TABLE settings_video_sources ADD COLUMN youtube_cookies_meta TEXT;
ALTER TABLE settings_video_sources ADD COLUMN google_photos_cookies_meta TEXT;
