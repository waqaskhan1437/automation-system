"use client";
import { useCallback, useEffect, useState } from "react";

interface ScheduledAccountDetail {
  id: string;
  platform: string;
  username: string;
  scheduled_at: string | null;
  postforme_id: string | null;
}

interface PlatformConfigurationDetail {
  platform: string;
  title?: string;
  caption?: string;
}

interface AccountConfigurationDetail {
  social_account_id: string;
  platform: string;
  username: string;
  title?: string;
  caption?: string;
}

interface ScheduledPostDetails {
  title: string;
  description: string;
  hashtags: string[];
  caption: string;
  top_tagline: string;
  bottom_tagline: string;
  schedule_mode: string;
  scheduled_accounts: ScheduledAccountDetail[];
  platform_configurations?: PlatformConfigurationDetail[];
  account_configurations?: AccountConfigurationDetail[];
}

interface ScheduledUpload {
  id: number;
  job_id: number;
  automation_id?: number | null;
  automation_name?: string | null;
  media_url: string;
  post_status: string;
  scheduled_at: string | null;
  postforme_id: string | null;
  post_details?: ScheduledPostDetails | null;
  scheduled_account_count?: number;
}

export interface ScheduledUploadsSummary {
  count: number;
  accounts: number;
  nextScheduledAt: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  automationId?: number | null;
  title?: string;
  initialUploads?: ScheduledUpload[];
  onSummaryChange?: (summary: ScheduledUploadsSummary) => void;
}

const EMPTY_INITIAL_UPLOADS: ScheduledUpload[] = [];

function isLikelyImageUrl(url: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(url);
}

function formatScheduledDate(value: string | null | undefined): string {
  if (!value) {
    return "Schedule time unavailable";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Schedule time unavailable";
  }

  return parsed.toLocaleString();
}

function getCountdownLabel(value: string | null | undefined): string {
  if (!value) {
    return "Pending sync";
  }

  const scheduled = new Date(value).getTime();
  if (Number.isNaN(scheduled)) {
    return "Pending sync";
  }

  const diff = scheduled - Date.now();
  if (diff <= 0) {
    return "Due now";
  }

  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${totalMinutes % 60}m`;
  }
  return `${totalMinutes}m`;
}

function formatPlatformLabel(platform: string): string {
  if (!platform) {
    return "Account";
  }

  return platform
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getTotalScheduledAccounts(uploads: ScheduledUpload[]): number {
  return uploads.reduce((total, upload) => {
    const count = upload.post_details?.scheduled_accounts.length || upload.scheduled_account_count || 1;
    return total + count;
  }, 0);
}

function getPlatformCount(details: ScheduledPostDetails | null | undefined): number {
  return details?.platform_configurations?.length || details?.scheduled_accounts?.reduce((total, account, index, array) => {
    const alreadyCounted = array.findIndex((item) => item.platform === account.platform) !== index;
    return alreadyCounted || !account.platform ? total : total + 1;
  }, 0) || 0;
}

function getNextScheduledAt(uploads: ScheduledUpload[]): string | null {
  let nextScheduledAt: string | null = null;
  let nextScheduledAtMs: number | null = null;

  for (const upload of uploads) {
    if (!upload.scheduled_at) {
      continue;
    }

    const scheduledAtMs = Date.parse(upload.scheduled_at);
    if (Number.isNaN(scheduledAtMs)) {
      continue;
    }

    if (nextScheduledAtMs === null || scheduledAtMs < nextScheduledAtMs) {
      nextScheduledAt = upload.scheduled_at;
      nextScheduledAtMs = scheduledAtMs;
    }
  }

  return nextScheduledAt;
}

function buildScheduledSummary(uploads: ScheduledUpload[]): ScheduledUploadsSummary {
  return {
    count: uploads.length,
    accounts: getTotalScheduledAccounts(uploads),
    nextScheduledAt: getNextScheduledAt(uploads),
  };
}

export default function ScheduledPostsModal({
  isOpen,
  onClose,
  automationId = null,
  title = "Scheduled Posts",
  initialUploads = EMPTY_INITIAL_UPLOADS,
  onSummaryChange,
}: Props) {
  const [uploads, setUploads] = useState<ScheduledUpload[]>(initialUploads);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<number | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchRetryCount, setFetchRetryCount] = useState(0);
  const initialUploadsSignature = initialUploads
    .map((upload) => `${upload.id}:${upload.scheduled_at || ""}:${upload.post_status}:${upload.scheduled_account_count || 0}`)
    .join("|");

  const applyUploads = useCallback((nextUploads: ScheduledUpload[]) => {
    setUploads(nextUploads);
    setError(null);
    onSummaryChange?.(buildScheduledSummary(nextUploads));
  }, [onSummaryChange]);

  const fetchScheduledPosts = useCallback(async (retryAttempt = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: "scheduled",
        details: "1",
        sync: "1",
        limit: "500",
      });

      if (automationId) {
        params.set("automation_id", String(automationId));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`/api/uploads?${params.toString()}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        applyUploads(data.data || []);
        setFetchRetryCount(0);
      } else {
        throw new Error(data.error || "Failed to load scheduled posts");
      }
    } catch (err) {
      console.error("Failed to fetch scheduled posts:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);

      // Auto-retry up to 2 times with exponential backoff
      if (retryAttempt < 2) {
        const delay = Math.pow(2, retryAttempt) * 1000;
        console.log(`Retrying fetch in ${delay}ms (attempt ${retryAttempt + 1}/2)`);
        setTimeout(() => {
          setFetchRetryCount(retryAttempt + 1);
        }, delay);
      }
    } finally {
      setLoading(false);
    }
  }, [applyUploads, automationId]);

  useEffect(() => {
    if (isOpen) {
      if (initialUploads.length > 0) {
        applyUploads(initialUploads);
      }
      void fetchScheduledPosts();
    }
  }, [applyUploads, fetchScheduledPosts, initialUploadsSignature, isOpen]);

  // Auto-retry trigger
  useEffect(() => {
    if (fetchRetryCount > 0 && isOpen) {
      void fetchScheduledPosts(fetchRetryCount);
    }
  }, [fetchRetryCount, isOpen, fetchScheduledPosts]);

  const deleteScheduledPostRequest = async (id: number): Promise<{ success: boolean; error?: string }> => {
    const res = await fetch(`/api/uploads/${id}/schedule`, {
      method: "DELETE",
    });
    const data = await res.json();
    return { success: data.success, error: data.error };
  };

  const deleteScheduledPost = async (id: number) => {
    if (!confirm("Cancel this scheduled post?")) {
      return;
    }

    setDeleting(id);
    try {
      const result = await deleteScheduledPostRequest(id);
      if (!result.success) {
        setError(result.error || "Failed to delete from Postforme");
        return;
      }
      setError(null);
      await fetchScheduledPosts();
    } catch (err) {
      console.error("Failed to delete scheduled post:", err);
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const deleteAllScheduledPosts = async () => {
    if (!uploads.length || !confirm("Cancel all visible scheduled posts?")) {
      return;
    }

    setDeleting("all");
    try {
      let result: { success: boolean; cancelled?: number; failed?: number; errors?: string[] };

      if (!automationId) {
        const res = await fetch("/api/uploads/schedule/all", {
          method: "DELETE",
        });
        result = await res.json();
      } else {
        // Delete sequentially to avoid overwhelming the API
        let cancelled = 0;
        let failed = 0;
        const errors: string[] = [];
        for (const upload of uploads) {
          try {
            const delResult = await deleteScheduledPostRequest(upload.id);
            if (delResult.success) {
              cancelled++;
            } else {
              failed++;
              errors.push(delResult.error || `Upload ${upload.id}`);
            }
          } catch (err) {
            failed++;
            errors.push(`Upload ${upload.id}: ${err instanceof Error ? err.message : "unknown"}`);
          }
        }
        result = { success: failed === 0, cancelled, failed, errors };
      }

      if (!result.success) {
        const msg = result.errors
          ? `Deleted ${result.cancelled || 0}, failed ${result.failed || 0}: ${result.errors.slice(0, 3).join("; ")}`
          : `Failed to delete ${result.failed || 0} posts`;
        setError(msg);
      } else {
        setError(null);
      }

      await fetchScheduledPosts();
    } catch (err) {
      console.error("Failed to delete all scheduled posts:", err);
      setError(err instanceof Error ? err.message : "Delete all failed");
    } finally {
      setDeleting(null);
    }
  };

  if (!isOpen) {
    return null;
  }

  const totalScheduledAccounts = getTotalScheduledAccounts(uploads);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-5xl bg-[#18181b] border border-[rgba(255,255,255,0.1)] rounded-2xl shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.06)]">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-[#71717a]">
              {uploads.length} scheduled posts
              {totalScheduledAccounts !== uploads.length ? ` across ${totalScheduledAccounts} accounts` : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors">
            <svg className="w-5 h-5 text-[#71717a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-red-300">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-[#71717a] mt-2">Loading scheduled posts...</p>
            </div>
          ) : uploads.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-[#3f3f46] mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-[#71717a] mt-3">No scheduled posts</p>
            </div>
          ) : (
            <div className="space-y-4">
              {uploads.map((upload) => {
                const details = upload.post_details;
                const accountDetails = details?.scheduled_accounts || [];

                return (
                  <div key={upload.id} className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] p-4">
                    <div className="flex gap-4">
                      <div className="w-24 h-32 bg-[#27272a] rounded-xl overflow-hidden flex-shrink-0">
                        {isLikelyImageUrl(upload.media_url) ? (
                          <img src={upload.media_url} alt="Scheduled media preview" className="w-full h-full object-cover" />
                        ) : (
                          <video src={upload.media_url} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {upload.automation_name || `Automation #${upload.automation_id || upload.job_id}`}
                            </p>
                            <p className="text-xs text-[#71717a] mt-1">Job #{upload.job_id}</p>
                          </div>
                          <button
                            onClick={() => void deleteScheduledPost(upload.id)}
                            disabled={deleting !== null}
                            className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                            title="Cancel scheduled post"
                          >
                            {deleting === upload.id ? (
                              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-300">
                            Scheduled: {formatScheduledDate(upload.scheduled_at)}
                          </span>
                          <span className="text-xs px-2.5 py-1 rounded-full bg-[rgba(99,102,241,0.16)] text-indigo-300">
                            In {getCountdownLabel(upload.scheduled_at)}
                          </span>
                          <span className="text-xs px-2.5 py-1 rounded-full bg-[rgba(16,185,129,0.16)] text-emerald-300">
                            {(details?.schedule_mode || "scheduled").replace(/[_-]+/g, " ")}
                          </span>
                          {getPlatformCount(details) > 0 && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-[rgba(244,114,182,0.16)] text-pink-300">
                              {getPlatformCount(details)} platforms
                            </span>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
                          <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] p-3 lg:col-span-1">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717a] mb-2">Accounts</div>
                            {accountDetails.length > 0 ? (
                              <div className="space-y-2">
                                {accountDetails.map((account) => (
                                  <div key={`${upload.id}-${account.id}-${account.scheduled_at || "noschedule"}`} className="rounded-lg bg-[rgba(255,255,255,0.04)] px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-sm font-medium text-white">{account.username}</span>
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.06)] text-[#cbd5e1]">
                                        {formatPlatformLabel(account.platform)}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-[#71717a] mt-1">
                                      {formatScheduledDate(account.scheduled_at || upload.scheduled_at)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-[#71717a]">Account detail not captured for this scheduled post.</p>
                            )}
                          </div>

                          <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] p-3 lg:col-span-2">
                            <div className="grid grid-cols-1 gap-3">
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717a] mb-1">Title</div>
                                <p className="text-sm text-white">{details?.title || "Title not captured"}</p>
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717a] mb-1">Description</div>
                                <p className="text-sm text-[#d4d4d8] whitespace-pre-wrap">{details?.description || "Description not captured"}</p>
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717a] mb-2">Hashtags</div>
                                {details?.hashtags && details.hashtags.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {details.hashtags.map((hashtag) => (
                                      <span key={`${upload.id}-${hashtag}`} className="text-xs px-2.5 py-1 rounded-full bg-[rgba(245,158,11,0.16)] text-amber-300">
                                        {hashtag}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-[#71717a]">Hashtags not captured</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {details?.caption && (
                          <div className="mt-3 rounded-xl bg-[rgba(0,0,0,0.2)] border border-[rgba(255,255,255,0.04)] p-3">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717a] mb-1">Caption Preview</div>
                            <p className="text-sm text-[#cbd5e1] whitespace-pre-wrap">{details.caption}</p>
                          </div>
                        )}

                        {details?.platform_configurations && details.platform_configurations.length > 0 && (
                          <div className="mt-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] p-3">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717a] mb-2">Platform Delivery</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {details.platform_configurations.map((platformConfig) => (
                                <div key={`${upload.id}-${platformConfig.platform}`} className="rounded-lg bg-[rgba(255,255,255,0.04)] px-3 py-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-medium text-white">{formatPlatformLabel(platformConfig.platform)}</span>
                                    {platformConfig.title ? (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(99,102,241,0.16)] text-indigo-300">
                                        Title override
                                      </span>
                                    ) : (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.06)] text-[#cbd5e1]">
                                        Base caption
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-[#d4d4d8] mt-2 whitespace-pre-wrap">
                                    {platformConfig.title || "Uses the shared automation caption"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {details?.account_configurations && details.account_configurations.length > 0 && (
                          <div className="mt-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] p-3">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717a] mb-2">Account Overrides</div>
                            <div className="space-y-2">
                              {details.account_configurations.map((accountConfig) => (
                                <div key={`${upload.id}-${accountConfig.social_account_id}`} className="rounded-lg bg-[rgba(255,255,255,0.04)] px-3 py-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-medium text-white">{accountConfig.username}</span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.06)] text-[#cbd5e1]">
                                      {formatPlatformLabel(accountConfig.platform)}
                                    </span>
                                  </div>
                                  {accountConfig.title && (
                                    <p className="text-xs text-white mt-2">{accountConfig.title}</p>
                                  )}
                                  {accountConfig.caption && (
                                    <p className="text-[11px] text-[#a1a1aa] mt-1 whitespace-pre-wrap">{accountConfig.caption}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-5 border-t border-[rgba(255,255,255,0.06)]">
          <button
            onClick={() => void fetchScheduledPosts()}
            className="px-4 py-2 bg-[rgba(255,255,255,0.05)] text-sm text-[#a1a1aa] hover:text-white rounded-lg transition-colors"
          >
            Refresh
          </button>
          {uploads.length > 0 && (
            <button
              onClick={() => void deleteAllScheduledPosts()}
              disabled={deleting !== null}
              className="px-4 py-2 bg-red-500/20 text-sm text-red-400 hover:bg-red-500/30 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting === "all" ? "Deleting..." : "Delete All Visible"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
