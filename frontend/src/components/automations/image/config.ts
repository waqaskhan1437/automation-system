export const IMAGE_AUTOMATION_TABS = [
  { id: "basic", label: "Basic", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { id: "social", label: "Content", icon: "M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" },
  { id: "publish", label: "Publish", icon: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" },
] as const;

export type ImageAutomationTabId = (typeof IMAGE_AUTOMATION_TABS)[number]["id"];

export const DEFAULT_IMAGE_AUTOMATION_CONFIG: Record<string, unknown> = {
  brand_name: "",
  ai_prompt: "",
  brand_urls: [],
  image_layout: "portrait",
  titles: [],
  descriptions: [],
  hashtags: [],
  schedule_type: "manual",
  schedule_minutes: "30",
  schedule_hours: "1",
  schedule_run_time: "13:00",
  schedule_timezone: "UTC",
  schedule_weekdays: ["sunday"],
};

export function normalizeImageAutomationConfig(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const current = config || {};

  const normalized: Record<string, unknown> = {
    ...DEFAULT_IMAGE_AUTOMATION_CONFIG,
    ...current,
  };

  if (!Array.isArray(normalized.brand_urls)) {
    if (typeof normalized.branding_url === "string" && normalized.branding_url.trim()) {
      normalized.brand_urls = [normalized.branding_url.trim()];
    } else {
      normalized.brand_urls = [];
    }
  }

  if (typeof normalized.ai_prompt !== "string") normalized.ai_prompt = "";

  if (!Array.isArray(normalized.titles)) normalized.titles = [];
  if (!Array.isArray(normalized.descriptions)) normalized.descriptions = [];
  if (!Array.isArray(normalized.hashtags)) normalized.hashtags = [];
  if (!Array.isArray(normalized.schedule_weekdays)) normalized.schedule_weekdays = ["sunday"];

  return normalized;
}
