export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}

export interface PostformeSettings {
  id?: number;
  api_key: string;
  platforms: string;
  default_schedule: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface GithubSettings {
  id?: number;
  pat_token: string;
  repo_owner: string;
  repo_name: string;
  runner_labels: string;
  workflow_dispatch_url: string;
  created_at?: string;
  updated_at?: string;
}

export interface VideoSourceSettings {
  id?: number;
  bunny_api_key: string | null;
  bunny_library_id: string | null;
  youtube_cookies: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AISettings {
  id?: number;
  gemini_key: string | null;
  grok_key: string | null;
  cohere_key: string | null;
  openrouter_key: string | null;
  openai_key: string | null;
  groq_key: string | null;
  default_provider: string;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowInputs {
  job_id: string;
  automation_id: string;
  automation_config: string;
  worker_webhook_url: string;
  postforme_api_key?: string;
}

export interface Automation {
  id?: number;
  name: string;
  type: "video" | "image";
  status: "active" | "paused" | "completed" | "failed";
  config: string;
  schedule: string | null;
  next_run: string | null;
  last_run: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Job {
  id?: number;
  automation_id: number;
  status: "queued" | "running" | "success" | "failed";
  github_run_id: number | null;
  github_run_url: string | null;
  input_data: string | null;
  output_data: string | null;
  logs: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at?: string;
}

export interface VideoAutomationConfig {
  video_source: "direct" | "youtube" | "bunny";
  video_url: string;
  google_photos_album_url?: string | null;
  ffmpeg_config: FFmpegConfig;
  output_format: string;
  output_quality: string;
  output_resolution: string;
  platforms: string[];
}

export interface ImageAutomationConfig {
  image_source: "url" | "placeholder";
  image_url: string | null;
  placeholder_text: string | null;
  image_config: ImageProcessingConfig;
  platforms: string[];
}

export interface FFmpegConfig {
  trim_start: string | null;
  trim_end: string | null;
  resize: string | null;
  watermark_text: string | null;
  watermark_position: string | null;
  overlay_text: string | null;
  overlay_position: string | null;
  fps: number | null;
  codec: string | null;
  audio_codec: string | null;
  custom_args: string | null;
}

export interface ImageProcessingConfig {
  width: number | null;
  height: number | null;
  watermark_text: string | null;
  watermark_position: string | null;
  text_overlay: string | null;
  text_position: string | null;
  text_color: string | null;
  text_size: number | null;
  background_color: string | null;
  filters: string | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface VideoUpload {
  id?: number;
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
  created_at?: string;
  updated_at?: string;
}
