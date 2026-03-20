export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://automation-api.waqaskhan1437.workers.dev";
export const WORKER_WEBHOOK_URL = `${API_BASE_URL}/api/webhook/github`;
export const GITHUB_API_URL = "https://api.github.com";

export const VIDEO_SOURCES = [
  { value: "youtube_channel", label: "YouTube Channel" },
  { value: "bunny", label: "Bunny CDN" },
  { value: "manual_links", label: "Direct Links" },
  { value: "ftp", label: "FTP Server" },
] as const;

export const VIDEO_DAYS_OPTIONS = [
  { value: "1", label: "Today" },
  { value: "2", label: "Yesterday" },
  { value: "7", label: "Last 7 Days" },
  { value: "14", label: "Last 14 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "date_range", label: "Custom Range" },
] as const;

export const SHORT_DURATIONS = [
  { value: "15", label: "15 Seconds" },
  { value: "30", label: "30 Seconds" },
  { value: "45", label: "45 Seconds" },
  { value: "60", label: "60 Seconds" },
  { value: "90", label: "90 Seconds" },
] as const;

export const ASPECT_RATIOS = [
  { value: "9:16", label: "9:16 Vertical" },
  { value: "1:1", label: "1:1 Square" },
  { value: "16:9", label: "16:9 Horizontal" },
  { value: "4:5", label: "4:5 Portrait" },
  { value: "21:9", label: "21:9 Ultra Wide" },
] as const;

export const PLAYBACK_SPEEDS = [
  { value: "0.5", label: "0.5x Slow" },
  { value: "0.75", label: "0.75x" },
  { value: "1.0", label: "1.0x Normal" },
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x Fast" },
] as const;

export const SOCIAL_PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#E1306C" },
  { id: "youtube", label: "YouTube", color: "#FF0000" },
  { id: "tiktok", label: "TikTok", color: "#000000" },
  { id: "facebook", label: "Facebook", color: "#1877F2" },
  { id: "twitter", label: "X / Twitter", color: "#1DA1F2" },
] as const;

export const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Los_Angeles", label: "US Pacific" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Karachi", label: "Pakistan" },
  { value: "Asia/Kolkata", label: "India" },
  { value: "Asia/Tokyo", label: "Japan" },
  { value: "Australia/Sydney", label: "Sydney" },
] as const;

export const AI_PROVIDERS = [
  { value: "gemini", label: "Gemini" },
  { value: "groq", label: "Groq" },
  { value: "openai", label: "OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "cohere", label: "Cohere" },
] as const;

export const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  active: { bg: "rgba(16,185,129,0.15)", color: "#10b981" },
  paused: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  failed: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
  completed: { bg: "rgba(16,185,129,0.15)", color: "#10b981" },
  queued: { bg: "rgba(99,102,241,0.15)", color: "#6366f1" },
  running: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6" },
  success: { bg: "rgba(16,185,129,0.15)", color: "#10b981" },
};

export const FEATURE_COLORS: Record<string, { bg: string; text: string }> = {
  Rotation: { bg: "rgba(34,197,94,0.2)", text: "#4ade80" },
  Captions: { bg: "rgba(59,130,246,0.2)", text: "#60a5fa" },
  Split: { bg: "rgba(245,158,11,0.2)", text: "#fbbf24" },
  Combine: { bg: "rgba(236,72,153,0.2)", text: "#f472b6" },
};

export const STEP_GRADIENTS = [
  "linear-gradient(135deg, #3b82f6, #2563eb)",
  "linear-gradient(135deg, #8b5cf6, #7c3aed)",
  "linear-gradient(135deg, #22c55e, #16a34a)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #ec4899, #db2777)",
];

export const REFRESH_INTERVAL = 5000;
export const LOG_REFRESH_INTERVAL = 3000;
