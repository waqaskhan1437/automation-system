import { Env, PostformeSettings, VideoUpload } from "../types";
import {
  AccountConfigurationMetadata,
  PlatformConfigurationMetadata,
  ScheduledAccountMetadata,
  StoredPostMetadata,
  buildStoredPostMetadata,
  inferStoredPostMetadata,
  parseSavedPostformeAccounts,
} from "./post-metadata";
import { getScopedSettings } from "./user-settings";

const POSTFORME_REQUEST_TIMEOUT_MS = 15_000;

const SCHEDULED_STATUSES = new Set(["scheduled"]);
const POSTED_STATUSES = new Set(["processing", "processed", "published", "posted", "completed"]);
const FAILED_STATUSES = new Set(["failed", "error", "cancelled", "canceled", "rejected"]);
const PENDING_STATUSES = new Set(["draft", "pending"]);

export interface SyncCandidateUpload {
  id: number;
  user_id: number;
  job_id: number;
  postforme_id: string | null;
  post_status: VideoUpload["post_status"];
  scheduled_at: string | null;
  posted_at: string | null;
  post_metadata?: string | null;
  automation_config?: string | null;
  job_output_data?: string | null;
}

export interface PostformePostSnapshot {
  status: string;
  caption: string;
  scheduled_at: string | null;
  posted_at: string | null;
  scheduled_accounts: ScheduledAccountMetadata[];
  platform_configurations: PlatformConfigurationMetadata[];
  account_configurations: AccountConfigurationMetadata[];
}

export interface PostformePostFetchResult {
  snapshot: PostformePostSnapshot | null;
  notFound: boolean;
  error: string | null;
}

export interface SyncedUploadResult<T extends SyncCandidateUpload> {
  upload: T;
  snapshot: PostformePostSnapshot | null;
  localStatus: VideoUpload["post_status"];
  postDetails: StoredPostMetadata | null;
  changed: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanCaptionValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  const record = asRecord(value);
  return cleanString(record.text) || cleanString(record.value) || cleanString(record.caption);
}

function sanitizeScheduledAccounts(
  value: unknown,
  savedAccountsRaw: string | null | undefined,
  scheduledAt: string | null,
  postformeId: string | null
): ScheduledAccountMetadata[] {
  const savedAccounts = parseSavedPostformeAccounts(savedAccountsRaw);
  const items = Array.isArray(value) ? value : [];

  return items
    .map((item) => {
      const record = asRecord(item);
      const id = cleanString(record.id);
      if (!id) {
        return null;
      }

      const saved = savedAccounts.find((account) => account.id === id);
      return {
        id,
        platform: cleanString(record.platform) || saved?.platform || "unknown",
        username: cleanString(record.username) || cleanString(record.name) || saved?.username || id,
        scheduled_at: cleanString(record.scheduled_at) || cleanString(record.scheduledAt) || scheduledAt || null,
        postforme_id: postformeId,
      };
    })
    .filter((item): item is ScheduledAccountMetadata => Boolean(item));
}

function sanitizePlatformConfigurations(value: unknown): PlatformConfigurationMetadata[] {
  const configurations = asRecord(value);

  return Object.entries(configurations)
    .map(([platform, config]) => {
      const record = asRecord(config);
      const title = cleanString(record.title);
      const caption = cleanCaptionValue(record.caption);

      if (!title && !caption) {
        return null;
      }

      return {
        platform,
        title,
        caption,
      };
    })
    .filter((item): item is PlatformConfigurationMetadata => Boolean(item));
}

function sanitizeAccountConfigurations(
  value: unknown,
  scheduledAccounts: ScheduledAccountMetadata[]
): AccountConfigurationMetadata[] {
  const items = Array.isArray(value) ? value : [];

  return items
    .map((item) => {
      const record = asRecord(item);
      const socialAccountId = cleanString(record.social_account_id);
      const configuration = asRecord(record.configuration);
      if (!socialAccountId) {
        return null;
      }

      const scheduledAccount = scheduledAccounts.find((account) => account.id === socialAccountId);
      const title = cleanString(configuration.title) || cleanString(record.title);
      const caption = cleanCaptionValue(configuration.caption) || cleanCaptionValue(record.caption);
      if (!title && !caption) {
        return null;
      }

      return {
        social_account_id: socialAccountId,
        platform: scheduledAccount?.platform || "unknown",
        username: scheduledAccount?.username || socialAccountId,
        title,
        caption,
      };
    })
    .filter((item): item is AccountConfigurationMetadata => Boolean(item));
}

async function timedFetch(url: string, options: RequestInit, timeoutMs = POSTFORME_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export function mapPostformeStatusToLocalStatus(
  status: string | null | undefined,
  fallbackStatus: VideoUpload["post_status"] = "scheduled"
): VideoUpload["post_status"] {
  const normalized = cleanString(status).toLowerCase();

  if (!normalized) {
    return fallbackStatus;
  }
  if (SCHEDULED_STATUSES.has(normalized)) {
    return "scheduled";
  }
  if (POSTED_STATUSES.has(normalized)) {
    return "posted";
  }
  if (FAILED_STATUSES.has(normalized)) {
    return "failed";
  }
  if (PENDING_STATUSES.has(normalized)) {
    return "pending";
  }

  return fallbackStatus;
}

export async function fetchPostformePostSnapshot(
  apiKey: string,
  postformeId: string,
  savedAccountsRaw: string | null | undefined
): Promise<PostformePostSnapshot | null> {
  const result = await fetchPostformePostSnapshotWithStatus(apiKey, postformeId, savedAccountsRaw);
  return result.snapshot;
}

export async function fetchPostformePostSnapshotWithStatus(
  apiKey: string,
  postformeId: string,
  savedAccountsRaw: string | null | undefined
): Promise<PostformePostFetchResult> {
  try {
    const response = await timedFetch(`https://api.postforme.dev/v1/social-posts/${postformeId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.status === 404) {
      return { snapshot: null, notFound: true, error: null };
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      return { snapshot: null, notFound: false, error: `HTTP ${response.status}: ${errBody}` };
    }

    const payloadRoot = asRecord(await response.json());
    const payload = Object.keys(asRecord(payloadRoot.data)).length > 0 ? asRecord(payloadRoot.data) : payloadRoot;
    const scheduledAt = cleanString(payload.scheduled_at) || cleanString(payload.scheduledAt) || null;
    const postedAt =
      cleanString(payload.posted_at)
      || cleanString(payload.published_at)
      || cleanString(payload.processed_at)
      || cleanString(payload.updated_at)
      || null;
    const scheduledAccounts = sanitizeScheduledAccounts(payload.social_accounts, savedAccountsRaw, scheduledAt, postformeId);

    return {
      snapshot: {
        status: cleanString(payload.status),
        caption: cleanCaptionValue(payload.caption),
        scheduled_at: scheduledAt,
        posted_at: postedAt,
        scheduled_accounts: scheduledAccounts,
        platform_configurations: sanitizePlatformConfigurations(payload.platform_configurations),
        account_configurations: sanitizeAccountConfigurations(payload.account_configurations, scheduledAccounts),
      },
      notFound: false,
      error: null,
    };
  } catch (err) {
    return { snapshot: null, notFound: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function loadSyncCandidates(
  env: Env,
  options: { userId?: number; limit: number; onlyDue?: boolean }
): Promise<SyncCandidateUpload[]> {
  let query = `
    SELECT
      vu.id,
      vu.user_id,
      vu.job_id,
      vu.postforme_id,
      vu.post_status,
      vu.scheduled_at,
      vu.posted_at,
      vu.post_metadata,
      a.config AS automation_config,
      j.output_data AS job_output_data
    FROM video_uploads vu
    INNER JOIN jobs j ON j.id = vu.job_id
    LEFT JOIN automations a ON a.id = j.automation_id
    WHERE vu.post_status = 'scheduled'
      AND vu.postforme_id IS NOT NULL
  `;
  const params: Array<number | string> = [];

  if (options.userId) {
    query += " AND vu.user_id = ?";
    params.push(options.userId);
  }

  if (options.onlyDue) {
    query += " AND (vu.scheduled_at IS NULL OR vu.scheduled_at <= datetime('now', '+10 minutes'))";
  }

  query += " ORDER BY COALESCE(vu.scheduled_at, vu.created_at) ASC, vu.id ASC LIMIT ?";
  params.push(options.limit);

  const result = await env.DB.prepare(query).bind(...params).all<SyncCandidateUpload>();
  return result.results || [];
}

export async function syncScheduledUploads<T extends SyncCandidateUpload>(
  env: Env,
  options: {
    uploads?: T[];
    userId?: number;
    limit?: number;
    onlyDue?: boolean;
  } = {}
): Promise<Array<SyncedUploadResult<T>>> {
  const candidates = options.uploads || await loadSyncCandidates(env, {
    userId: options.userId,
    limit: options.limit ?? 25,
    onlyDue: options.onlyDue,
  }) as T[];

  if (candidates.length === 0) {
    return [];
  }

  const settingsCache = new Map<number, PostformeSettings | null>();
  const results: Array<SyncedUploadResult<T>> = [];

  for (const upload of candidates) {
    const cacheKey = upload.user_id;
    if (!settingsCache.has(cacheKey)) {
      settingsCache.set(
        cacheKey,
        await getScopedSettings<PostformeSettings>(env.DB, "postforme", cacheKey)
      );
    }

    const settings = settingsCache.get(cacheKey);
    if (!settings?.api_key || !upload.postforme_id) {
      results.push({
        upload,
        snapshot: null,
        localStatus: upload.post_status,
        postDetails: inferStoredPostMetadata({
          rawMetadata: upload.post_metadata,
          config: upload.automation_config,
          outputData: upload.job_output_data,
          savedAccountsRaw: settings?.saved_accounts,
          scheduledAt: upload.scheduled_at,
          postformeId: upload.postforme_id,
        }),
        changed: false,
      });
      continue;
    }

    const fetchResult = await fetchPostformePostSnapshotWithStatus(settings.api_key, upload.postforme_id, settings.saved_accounts);
    const { snapshot, notFound, error } = fetchResult;

    // Reconciliation: post was deleted externally on Postforme
    if (notFound) {
      console.log(`[SYNC] Post ${upload.postforme_id} not found on Postforme (deleted externally), marking upload ${upload.id} as failed`);
      await env.DB.prepare(
        `UPDATE video_uploads
         SET post_status = 'failed',
             error_message = 'Post deleted on Postforme',
             scheduled_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(upload.id).run();

      results.push({
        upload,
        snapshot: null,
        localStatus: "failed",
        postDetails: null,
        changed: true,
      });
      continue;
    }

    // API error — keep local status as-is but record the error
    if (error) {
      console.error(`[SYNC] Failed to fetch post ${upload.postforme_id}: ${error}`);
      results.push({
        upload,
        snapshot: null,
        localStatus: upload.post_status,
        postDetails: inferStoredPostMetadata({
          rawMetadata: upload.post_metadata,
          config: upload.automation_config,
          outputData: upload.job_output_data,
          savedAccountsRaw: settings.saved_accounts,
          scheduledAt: upload.scheduled_at,
          postformeId: upload.postforme_id,
        }),
        changed: false,
      });
      continue;
    }

    // At this point snapshot is guaranteed non-null (notFound and error cases handled above)
    const snap = snapshot!;

    const localStatus = mapPostformeStatusToLocalStatus(snap.status, upload.post_status);
    const postDetails = inferStoredPostMetadata({
      rawMetadata: upload.post_metadata,
      config: upload.automation_config,
      outputData: upload.job_output_data,
      savedAccountsRaw: settings.saved_accounts,
      scheduledAt: snap.scheduled_at || upload.scheduled_at,
      postformeId: upload.postforme_id,
      captionOverride: snap.caption,
      scheduledAccountsOverride: snap.scheduled_accounts,
      platformConfigurations: snap.platform_configurations,
      accountConfigurations: snap.account_configurations,
    });
    const storedMetadata = postDetails ? JSON.stringify(buildStoredPostMetadata(postDetails)) : upload.post_metadata || null;
    const nextScheduledAt = localStatus === "scheduled" ? (snap.scheduled_at || upload.scheduled_at || null) : null;
    const nextPostedAt = localStatus === "posted"
      ? (snap.posted_at || upload.posted_at || new Date().toISOString())
      : upload.posted_at;
    const changed = Boolean(
      upload.post_status !== localStatus
      || (upload.scheduled_at || null) !== nextScheduledAt
      || (upload.posted_at || null) !== (nextPostedAt || null)
      || (upload.post_metadata || null) !== (storedMetadata || null)
    );

    if (changed) {
      await env.DB.prepare(
        `UPDATE video_uploads
         SET post_status = ?,
             scheduled_at = ?,
             posted_at = ?,
             post_metadata = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(
        localStatus,
        nextScheduledAt,
        nextPostedAt || null,
        storedMetadata,
        upload.id
      ).run();
    }

    results.push({
      upload: {
        ...upload,
        post_status: localStatus,
        scheduled_at: nextScheduledAt,
        posted_at: nextPostedAt || null,
        post_metadata: storedMetadata,
      },
      snapshot,
      localStatus,
      postDetails,
      changed,
    });
  }

  return results;
}
