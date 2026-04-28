export interface WorkflowInputs {
  job_id: string;
  automation_id: string;
  video_source: string;
  video_url: string;
  youtube_channel_url: string;
  manual_links: string;
  videos_per_run: string;
  video_days: string;
  date_from: string;
  date_to: string;
  video_selection: string;
  source_shorts_mode: string;
  source_shorts_max_count: string;
  short_duration: string;
  aspect_ratio: string;
  split_enabled: string;
  split_duration: string;
  combine_enabled: string;
  combine_count: string;
  rotation_enabled: string;
  rotation_shuffle: string;
  rotation_auto_reset: string;
  whisper_enabled: string;
  whisper_language: string;
  top_taglines: string;
  bottom_taglines: string;
  tagline_rotation: string;
  branding_text_top: string;
  branding_text_bottom: string;
  watermark_text: string;
  watermark_position: string;
  watermark_fontsize: string;
  titles: string;
  descriptions: string;
  hashtags: string;
  content_rotation: string;
  output_format: string;
  output_quality: string;
  output_resolution: string;
  auto_publish: string;
  publish_mode: string;
  delay_minutes: string;
  schedule_date: string;
  schedule_time: string;
  schedule_spread_minutes: string;
  postforme_account_ids: string;
  postforme_schedule_timezone: string;
  postforme_account_stagger_enabled: string;
  postforme_account_stagger_min: string;
  postforme_account_stagger_max: string;
  run_mode: string;
  api_key_id: string;
}

export interface VideoUpload {
  id: number;
  job_id: number;
  postforme_id: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  upload_status: "pending" | "uploaded" | "posted" | "failed";
  post_status: "pending" | "scheduled" | "posted" | "failed";
  scheduled_at: string | null;
  posted_at: string | null;
  platforms: string;
  aspect_ratio: string;
  duration: number | null;
  file_size: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export const FORMAT_MAX_CHARS: Record<string, { default: number; vertical: number; horizontal: number }> = {
  "9:16": { default: 20, vertical: 20, horizontal: 25 },
  "16:9": { default: 45, vertical: 40, horizontal: 45 },
  "1:1": { default: 32, vertical: 30, horizontal: 35 },
  "4:5": { default: 35, vertical: 32, horizontal: 38 }
};