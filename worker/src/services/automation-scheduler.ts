import { Automation, Env, GithubSettings, PostformeSettings } from "../types";
import { buildWorkflowInputs, dispatchWorkflow } from "./github";

type ScheduleType = "minutes" | "hourly" | "daily" | "weekly";

interface ScheduleRule {
  type: ScheduleType;
  label: string;
  intervalMinutes?: number;
  time?: string;
  timezone?: string;
  weekdays?: number[];
}

interface WorkflowDispatchConfig {
  workflowName: string;
  inputs: Record<string, string>;
}

interface TimeParts {
  hour: number;
  minute: number;
  normalized: string;
}

interface ZonedDateParts {
  weekday: number;
  hour: number;
  minute: number;
}

export interface AutomationRunResult {
  success: boolean;
  jobId?: number;
  githubRunId?: number | null;
  error?: string;
  inProgress?: boolean;
}

const weekdayIndexByName: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const weekdayLabelByIndex = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseTimeValue(value: unknown): TimeParts | null {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return {
    hour,
    minute,
    normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function formatTimeLabel(time: string): string {
  const parts = parseTimeValue(time);
  if (!parts) {
    return time;
  }

  const hour12 = parts.hour % 12 || 12;
  const meridiem = parts.hour < 12 ? "AM" : "PM";
  return `${hour12}:${String(parts.minute).padStart(2, "0")} ${meridiem}`;
}

function normalizeTimezone(value: unknown): string {
  const raw = typeof value === "string" && value.trim() ? value.trim() : "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return "UTC";
  }
}

function getWeekdays(value: unknown): number[] {
  const days = Array.isArray(value) ? value : [];
  const unique = new Set<number>();

  for (const day of days) {
    if (typeof day !== "string") {
      continue;
    }
    const normalized = day.trim().toLowerCase();
    if (normalized in weekdayIndexByName) {
      unique.add(weekdayIndexByName[normalized]);
    }
  }

  return Array.from(unique).sort((left, right) => left - right);
}

function getZonedFormatter(timezone: string): Intl.DateTimeFormat {
  const cacheKey = timezone;
  const existing = zonedFormatterCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  zonedFormatterCache.set(cacheKey, formatter);
  return formatter;
}

function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
  const formattedParts = getZonedFormatter(timezone).formatToParts(date);
  let weekdayName = "";
  let hour = "0";
  let minute = "0";

  for (let i = 0; i < formattedParts.length; i++) {
    const part = formattedParts[i];
    if (part.type === "weekday") weekdayName = part.value;
    else if (part.type === "hour") hour = part.value;
    else if (part.type === "minute") minute = part.value;
  }

  const weekday = weekdayIndexByName[weekdayName.toLowerCase()] ?? 0;

  return {
    weekday,
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10),
  };
}

function roundUpToNextMinute(date: Date): Date {
  const next = new Date(date);
  next.setUTCSeconds(0, 0);
  if (next.getTime() <= date.getTime()) {
    next.setUTCMinutes(next.getUTCMinutes() + 1);
  }
  return next;
}

function findNextCalendarSlot(baseTime: Date, rule: ScheduleRule): Date {
  const timezone = rule.timezone || "UTC";
  const targetTime = parseTimeValue(rule.time) || { hour: 13, minute: 0, normalized: "13:00" };
  const maxSearchAttempts = 100; // Fail-safe to prevent infinite loops
  let candidate = roundUpToNextMinute(baseTime);

  for (let attempt = 0; attempt < maxSearchAttempts; attempt++) {
    const zonedParts = getZonedDateParts(candidate, timezone);
    const matchesTime = zonedParts.hour === targetTime.hour && zonedParts.minute === targetTime.minute;
    const matchesWeekday = rule.type !== "weekly" || (rule.weekdays || []).includes(zonedParts.weekday);

    if (matchesTime && matchesWeekday) {
      return candidate;
    }

    if (!matchesTime) {
      // If hour/minute doesn't match, jump to the next hour or minute as a quick step
      // In a real jumped implementation we'd do bigger leaps, but even just skipping
      // to the next hour or 30 mins would be faster.
      // For simplicity and safety against DST, we'll leap by 1 hour if it's far, or 1 min if close.
      const diffHours = targetTime.hour - zonedParts.hour;
      const diffMins = targetTime.minute - zonedParts.minute;
      const totalDiffMins = diffHours * 60 + diffMins;

      if (totalDiffMins > 0) {
        candidate = new Date(candidate.getTime() + totalDiffMins * 60_000);
      } else {
        // Target time is earlier today or we just passed it, jump to tomorrow's target time roughly
        candidate = new Date(candidate.getTime() + (totalDiffMins + 24 * 60) * 60_000);
      }
    } else if (!matchesWeekday) {
      // Matches time but not weekday, jump exactly 24 hours
      candidate = new Date(candidate.getTime() + 24 * 60 * 60_000);
    } else {
      // Fallback
      candidate = new Date(candidate.getTime() + 60_000);
    }
  }

  return roundUpToNextMinute(new Date(baseTime.getTime() + 24 * 60 * 60_000));
}

export function parseAutomationConfig(configText: string): Record<string, unknown> {
  const parsed = JSON.parse(configText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid automation config");
  }
  return parsed as Record<string, unknown>;
}

export function getScheduleRule(config: Record<string, unknown>): ScheduleRule | null {
  const scheduleType = typeof config.schedule_type === "string" ? config.schedule_type.trim().toLowerCase() : "";

  switch (scheduleType) {
    case "minutes": {
      const minutes = Math.max(1, parsePositiveInteger(config.schedule_minutes) ?? 30);
      return {
        type: "minutes",
        intervalMinutes: minutes,
        label: `Every ${minutes} minute${minutes === 1 ? "" : "s"}`,
      };
    }
    case "hourly": {
      const hours = Math.max(1, parsePositiveInteger(config.schedule_hours) ?? 1);
      return {
        type: "hourly",
        intervalMinutes: hours * 60,
        label: `Every ${hours} hour${hours === 1 ? "" : "s"}`,
      };
    }
    case "daily": {
      const legacyScheduleHour = (() => {
        if (typeof config.schedule_hour === "number" && Number.isFinite(config.schedule_hour)) {
          return config.schedule_hour;
        }
        if (typeof config.schedule_hour === "string" && config.schedule_hour.trim()) {
          const parsed = Number.parseInt(config.schedule_hour, 10);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      })();
      const time = parseTimeValue(config.schedule_run_time)?.normalized
        || (() => {
          return legacyScheduleHour !== null && legacyScheduleHour >= 0 && legacyScheduleHour <= 23
            ? `${String(legacyScheduleHour).padStart(2, "0")}:00`
            : "13:00";
        })();
      const timezone = normalizeTimezone(config.schedule_timezone);
      return {
        type: "daily",
        time,
        timezone,
        label: `Daily at ${formatTimeLabel(time)}`,
      };
    }
    case "weekly": {
      const time = parseTimeValue(config.schedule_run_time)?.normalized || "13:00";
      const timezone = normalizeTimezone(config.schedule_timezone);
      const weekdays = getWeekdays(config.schedule_weekdays);
      const normalizedWeekdays = weekdays.length > 0 ? weekdays : [0];
      const dayLabel = normalizedWeekdays.map((day) => weekdayLabelByIndex[day]).join(", ");
      return {
        type: "weekly",
        time,
        timezone,
        weekdays: normalizedWeekdays,
        label: `Weekly on ${dayLabel} at ${formatTimeLabel(time)}`,
      };
    }
    default:
      return null;
  }
}

export function parseDatabaseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDatabaseDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function computeNextRunDate(rule: ScheduleRule, baseTime: Date): Date {
  if (rule.type === "daily" || rule.type === "weekly") {
    return findNextCalendarSlot(baseTime, rule);
  }

  const targetTime = baseTime.getTime() + (rule.intervalMinutes || 60) * 60_000;
  const nextRun = new Date(targetTime);
  nextRun.setUTCSeconds(0, 0);

  if (nextRun.getTime() < targetTime) {
    nextRun.setUTCMinutes(nextRun.getUTCMinutes() + 1);
  }

  return nextRun;
}

function extractLinksFromConfig(config: Record<string, unknown>): string[] {
  const source = readString(config.video_source);
  let raw = "";

  if (source === "google_photos") {
    raw = readString(config.google_photos_album_url);
  } else if (source === "youtube_channel") {
    raw = readString(config.youtube_channel_url);
  } else if (source === "manual_links") {
    raw = readString(config.manual_links);
  }

  return raw.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

async function getProcessedLinkCount(env: Env, automationId: number): Promise<number> {
  const result = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM jobs WHERE automation_id = ? AND status IN ('success', 'running', 'queued')"
  ).bind(automationId).first<{ cnt: number }>();
  return result?.cnt || 0;
}

export async function getLinkQueueStatus(env: Env, automationId: number): Promise<{
  totalLinks: number;
  processedLinks: number;
  currentIndex: number;
  remainingLinks: number;
  allCompleted: boolean;
  links: string[];
}> {
  const automation = await env.DB.prepare("SELECT * FROM automations WHERE id = ?").bind(automationId).first<Automation>();
  if (!automation) {
    return { totalLinks: 0, processedLinks: 0, currentIndex: 0, remainingLinks: 0, allCompleted: false, links: [] };
  }

  let config: Record<string, unknown>;
  try {
    config = parseAutomationConfig(automation.config);
  } catch {
    return { totalLinks: 0, processedLinks: 0, currentIndex: 0, remainingLinks: 0, allCompleted: false, links: [] };
  }

  const links = extractLinksFromConfig(config);
  const totalLinks = links.length;

  if (totalLinks <= 1) {
    return { totalLinks, processedLinks: 0, currentIndex: 0, remainingLinks: totalLinks, allCompleted: false, links };
  }

  const successCount = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM jobs WHERE automation_id = ? AND status = 'success'"
  ).bind(automationId).first<{ cnt: number }>();
  const processedLinks = successCount?.cnt || 0;

  const currentIndex = Math.min(processedLinks, totalLinks - 1);
  const remainingLinks = Math.max(0, totalLinks - processedLinks);
  const allCompleted = processedLinks >= totalLinks;

  return { totalLinks, processedLinks, currentIndex, remainingLinks, allCompleted, links };
}

async function hasInProgressJob(env: Env, automationId: number): Promise<boolean> {
  const existing = await env.DB.prepare(
    "SELECT id FROM jobs WHERE automation_id = ? AND status IN ('queued', 'running') ORDER BY id DESC LIMIT 1"
  ).bind(automationId).first<{ id: number }>();

  return Boolean(existing?.id);
}

async function getLatestCompletedAt(env: Env, automationId: number): Promise<string | null> {
  const latest = await env.DB.prepare(
    "SELECT completed_at FROM jobs WHERE automation_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC, id DESC LIMIT 1"
  ).bind(automationId).first<{ completed_at: string | null }>();

  return latest?.completed_at || null;
}

export async function getSchedulePersistenceValues(
  env: Env,
  configText: string,
  status: Automation["status"],
  lastRunText: string | null,
  automationId?: number
): Promise<{ schedule: string | null; nextRun: string | null }> {
  const config = parseAutomationConfig(configText);
  const rule = getScheduleRule(config);
  const schedule = rule?.label || null;

  if (!rule || status !== "active") {
    return { schedule, nextRun: null };
  }

  let baseTime = parseDatabaseDate(lastRunText);
  if (!baseTime && automationId) {
    const latestCompletedAt = await getLatestCompletedAt(env, automationId);
    baseTime = parseDatabaseDate(latestCompletedAt);
  }
  if (!baseTime) {
    baseTime = new Date();
  }

  return {
    schedule,
    nextRun: formatDatabaseDate(computeNextRunDate(rule, baseTime)),
  };
}

function buildImageWorkflowInputs(
  jobId: number,
  automationId: number,
  config: Record<string, unknown>,
  postformeApiKey?: string
): WorkflowDispatchConfig {
  const topTaglines = toStringArray(config.top_taglines);
  const bottomTaglines = toStringArray(config.bottom_taglines);
  const inputs: Record<string, string> = {
    job_id: String(jobId),
    automation_id: String(automationId),
    image_url: readString(config.image_url),
    google_photos_url: readString(config.google_photos_url || config.google_photos_album_url),
    video_duration: String(parsePositiveInteger(config.video_duration || config.short_duration) ?? 10),
    aspect_ratio: readString(config.aspect_ratio, "9:16"),
    animation: readString(config.animation, "zoom"),
    top_tagline: readString(config.top_tagline, topTaglines[0] || ""),
    bottom_tagline: readString(config.bottom_tagline, bottomTaglines[0] || ""),
    auto_publish: String(config.auto_publish === true),
    platforms: JSON.stringify(toStringArray(config.platforms)),
    worker_webhook_url: "https://automation-api.waqaskhan1437.workers.dev/api/webhook/github",
  };

  if (postformeApiKey) {
    inputs.postforme_api_key = postformeApiKey;
  }

  return {
    workflowName: "image-automation.yml",
    inputs,
  };
}

function buildWorkflowDispatch(
  automation: Automation,
  jobId: number,
  config: Record<string, unknown>,
  postformeApiKey?: string
): WorkflowDispatchConfig {
  if (automation.type === "image") {
    return buildImageWorkflowInputs(jobId, automation.id as number, config, postformeApiKey);
  }

  return {
    workflowName: "video-automation.yml",
    inputs: { ...buildWorkflowInputs(jobId, automation.id as number, config, postformeApiKey) },
  };
}

export async function triggerAutomationRun(env: Env, automation: Automation): Promise<AutomationRunResult> {
  if (!automation.id) {
    return { success: false, error: "Automation ID is required" };
  }

  let config: Record<string, unknown>;
  try {
    config = parseAutomationConfig(automation.config);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Invalid automation config",
    };
  }

  if (await hasInProgressJob(env, automation.id)) {
    return {
      success: false,
      inProgress: true,
      error: "Automation is already running",
    };
  }

  // --- Multi-link queue logic ---
  const allLinks = extractLinksFromConfig(config);
  const hasMultipleLinks = allLinks.length > 1;
  let currentLinkIndex = 0;
  let jobConfig = config;

  if (hasMultipleLinks) {
    // Count how many links have been successfully processed
    const successCount = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM jobs WHERE automation_id = ? AND status = 'success'"
    ).bind(automation.id).first<{ cnt: number }>();
    currentLinkIndex = successCount?.cnt || 0;

    // All links have been processed
    if (currentLinkIndex >= allLinks.length) {
      // Mark automation as completed
      await env.DB.prepare(
        "UPDATE automations SET status = 'completed', next_run = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(automation.id).run();
      return {
        success: false,
        error: `Saray ${allLinks.length} links process ho chuke hain! Automation complete.`,
      };
    }

    // Override config with the current link only
    const currentLink = allLinks[currentLinkIndex];
    jobConfig = { ...config };
    const source = readString(config.video_source);

    if (source === "google_photos") {
      jobConfig.google_photos_album_url = currentLink;
    } else if (source === "youtube_channel") {
      jobConfig.youtube_channel_url = currentLink;
    } else if (source === "manual_links") {
      jobConfig.manual_links = currentLink;
    }

    // Store queue metadata in job config
    jobConfig._link_index = currentLinkIndex;
    jobConfig._total_links = allLinks.length;
    jobConfig._current_link = currentLink;
  }

  const githubSettings = await env.DB.prepare("SELECT * FROM settings_github LIMIT 1").first<GithubSettings>();
  if (!githubSettings) {
    return { success: false, error: "GitHub settings not configured. Go to Settings -> GitHub Runner" };
  }

  const postformeSettings = await env.DB.prepare("SELECT * FROM settings_postforme LIMIT 1").first<PostformeSettings>();
  const jobInputData = JSON.stringify(jobConfig);
  const jobResult = await env.DB.prepare(
    "INSERT INTO jobs (automation_id, status, input_data, started_at) VALUES (?, 'queued', ?, CURRENT_TIMESTAMP)"
  ).bind(automation.id, jobInputData).run();
  const jobId = Number(jobResult.meta.last_row_id);

  const workflow = buildWorkflowDispatch(automation, jobId, jobConfig, postformeSettings?.api_key);
  const dispatchResult = await dispatchWorkflow(githubSettings, workflow.inputs, workflow.workflowName);

  if (!dispatchResult.success) {
    await env.DB.prepare(
      "UPDATE jobs SET status = 'failed', error_message = ? WHERE id = ?"
    ).bind(dispatchResult.error || "Workflow dispatch failed", jobId).run();

    return { success: false, error: dispatchResult.error || "Workflow dispatch failed" };
  }

  await env.DB.prepare(
    "UPDATE jobs SET status = 'running', github_run_id = ?, github_run_url = ? WHERE id = ?"
  ).bind(dispatchResult.runId, dispatchResult.runUrl, jobId).run();

  const rule = getScheduleRule(config);
  if (rule && automation.status === "active") {
    await env.DB.prepare(
      "UPDATE automations SET schedule = ?, next_run = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(rule.label, automation.id).run();
  }

  return {
    success: true,
    jobId,
    githubRunId: dispatchResult.runId,
  };
}

export async function markAutomationRunCompleted(env: Env, jobId: number, completedAt: Date): Promise<void> {
  const automation = await env.DB.prepare(
    "SELECT a.* FROM automations a INNER JOIN jobs j ON j.automation_id = a.id WHERE j.id = ?"
  ).bind(jobId).first<Automation>();

  if (!automation?.id) {
    return;
  }

  const completedAtText = formatDatabaseDate(completedAt);

  // Check if this automation has multiple links and should auto-continue
  let config: Record<string, unknown>;
  try {
    config = parseAutomationConfig(automation.config);
  } catch {
    config = {};
  }

  const allLinks = extractLinksFromConfig(config);
  const hasMultipleLinks = allLinks.length > 1;

  if (hasMultipleLinks && automation.status === "active") {
    const successCount = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM jobs WHERE automation_id = ? AND status = 'success'"
    ).bind(automation.id).first<{ cnt: number }>();
    const processedCount = successCount?.cnt || 0;

    if (processedCount >= allLinks.length) {
      // All links processed - mark automation as completed
      await env.DB.prepare(
        "UPDATE automations SET status = 'completed', last_run = ?, next_run = NULL, schedule = 'All links completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(completedAtText, automation.id).run();
      return;
    }

    // More links to process - update last_run and auto-trigger next link
    await env.DB.prepare(
      "UPDATE automations SET last_run = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(completedAtText, automation.id).run();

    // Auto-trigger next link after a small delay (re-fetch automation for fresh state)
    const freshAutomation = await env.DB.prepare("SELECT * FROM automations WHERE id = ?").bind(automation.id).first<Automation>();
    if (freshAutomation && freshAutomation.status === "active") {
      await triggerAutomationRun(env, freshAutomation);
    }
    return;
  }

  // Standard single-link flow
  const { schedule, nextRun } = await getSchedulePersistenceValues(
    env,
    automation.config,
    automation.status,
    completedAtText,
    automation.id
  );

  await env.DB.prepare(
    "UPDATE automations SET schedule = ?, last_run = ?, next_run = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(schedule, completedAtText, nextRun, automation.id).run();
}

export async function backfillScheduledAutomations(env: Env): Promise<void> {
  const automations = await env.DB.prepare(
    "SELECT * FROM automations WHERE status = 'active' AND next_run IS NULL"
  ).all<Automation>();

  for (const automation of automations.results || []) {
    if (!automation.id) {
      continue;
    }

    let config: Record<string, unknown>;
    try {
      config = parseAutomationConfig(automation.config);
    } catch {
      continue;
    }

    const rule = getScheduleRule(config);
    if (!rule) {
      if (automation.schedule) {
        await env.DB.prepare(
          "UPDATE automations SET schedule = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(automation.id).run();
      }
      continue;
    }

    if (await hasInProgressJob(env, automation.id)) {
      await env.DB.prepare(
        "UPDATE automations SET schedule = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(rule.label, automation.id).run();
      continue;
    }

    const { schedule, nextRun } = await getSchedulePersistenceValues(
      env,
      automation.config,
      automation.status,
      automation.last_run,
      automation.id
    );

    await env.DB.prepare(
      "UPDATE automations SET schedule = ?, next_run = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(schedule, nextRun, automation.id).run();
  }
}

export async function processDueAutomations(env: Env): Promise<void> {
  await backfillScheduledAutomations(env);

  const dueAutomations = await env.DB.prepare(
    "SELECT * FROM automations WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= CURRENT_TIMESTAMP ORDER BY next_run ASC LIMIT 20"
  ).all<Automation>();

  for (const automation of dueAutomations.results || []) {
    if (!automation.id) {
      continue;
    }

    const result = await triggerAutomationRun(env, automation);
    if (!result.success) {
      if (result.inProgress) {
        await env.DB.prepare(
          "UPDATE automations SET next_run = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(automation.id).run();
      }
      console.error(`Scheduled automation ${automation.id} failed`, result.error || "Unknown error");
    }
  }
}
