/**
 * ============================================================================
 * AUTOMATION SYSTEM - Cloudflare Worker API
 * ============================================================================
 * Project: automation-system
 * GitHub: https://github.com/waqaskhan1437/automation-system
 * Cloudflare Worker: automation-api
 * URL: https://automation-api.waqaskhan1437.workers.dev
 * 
 * This worker provides the backend API for:
 * - Automation management (CRUD)
 * - Job scheduling and execution
 * - Video upload handling
 * - Settings management
 * - GitHub Actions integration
 * 
 * Deploy command: cd worker && npm run deploy
 * ============================================================================
 */

import { Env, GithubSettings, Job, PostformeSettings } from "./types";
import { jsonResponse, githubHeaders } from "./utils";
import { unzipSync } from "fflate";
import { decompress } from "zstd-wasm-decoder/cloudflare";
import { handleSettingsRoutes } from "./routes/settings";
import { handleAutomationsRoutes } from "./routes/automations";
import { handleJobsRoutes } from "./routes/jobs";
import { handleUploadsRoutes } from "./routes/uploads";
import { formatDatabaseDate, markAutomationRunCompleted, processDueAutomations } from "./services/automation-scheduler";

function buildVideoHeaders(sourceHeaders?: Headers): Headers {
  const headers = new Headers();
  const contentType = sourceHeaders?.get("content-type");
  headers.set("Content-Type", contentType && contentType !== "application/octet-stream" ? contentType : "video/mp4");
  headers.set("Accept-Ranges", sourceHeaders?.get("accept-ranges") || "bytes");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", sourceHeaders?.get("cache-control") || "public, max-age=86400");

  const contentLength = sourceHeaders?.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  const contentRange = sourceHeaders?.get("content-range");
  if (contentRange) {
    headers.set("Content-Range", contentRange);
  }

  const etag = sourceHeaders?.get("etag");
  if (etag) {
    headers.set("ETag", etag);
  }

  const lastModified = sourceHeaders?.get("last-modified");
  if (lastModified) {
    headers.set("Last-Modified", lastModified);
  }

  return headers;
}

function buildVideoResponse(request: Request, fileBytes: Uint8Array): Response {
  const rangeHeader = request.headers.get("range");
  const total = fileBytes.byteLength;

  if (!rangeHeader) {
    const headers = buildVideoHeaders();
    headers.set("Content-Length", String(total));
    return new Response(request.method === "HEAD" ? null : fileBytes, {
      status: 200,
      headers,
    });
  }

  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    const headers = buildVideoHeaders();
    headers.set("Content-Length", String(total));
    return new Response(request.method === "HEAD" ? null : fileBytes, {
      status: 200,
      headers,
    });
  }

  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const end = match[2] ? Number.parseInt(match[2], 10) : total - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= total || end < start) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${total}`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const chunk = fileBytes.slice(start, Math.min(end + 1, total));
  const headers = buildVideoHeaders();
  headers.set("Content-Length", String(chunk.byteLength));
  headers.set("Content-Range", `bytes ${start}-${start + chunk.byteLength - 1}/${total}`);
  return new Response(request.method === "HEAD" ? null : chunk, {
    status: 206,
    headers,
  });
}

type GithubContentFile = {
  download_url?: string;
};

async function fetchRepoVideoResponse(request: Request, githubSettings: GithubSettings, jobId: number): Promise<Response | null> {
  const fileName = `video-job-${jobId}.mp4`;
  const apiUrl = `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/contents/${fileName}`;
  const metadataRes = await fetch(apiUrl, {
    headers: githubHeaders(githubSettings.pat_token),
  });

  if (!metadataRes.ok) {
    return null;
  }

  const metadata = await metadataRes.json() as GithubContentFile;
  if (!metadata.download_url) {
    return null;
  }

  const upstreamHeaders: Record<string, string> = {
    "User-Agent": "AutomationSystem/1.0",
  };
  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    upstreamHeaders.Range = rangeHeader;
  }

  const upstreamRes = await fetch(metadata.download_url, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: upstreamHeaders,
  });

  if (!upstreamRes.ok && upstreamRes.status !== 206) {
    return null;
  }

  const headers = buildVideoHeaders(upstreamRes.headers);
  return new Response(request.method === "HEAD" ? null : upstreamRes.body, {
    status: upstreamRes.status,
    headers,
  });
}

async function fetchArtifactVideoBytes(githubSettings: GithubSettings, job: Job): Promise<Uint8Array | null> {
  if (!job.github_run_id) {
    console.log("No github_run_id for job");
    return null;
  }

  console.log("Fetching artifact for run:", job.github_run_id);
  console.log("Repo:", githubSettings.repo_owner, githubSettings.repo_name);

  const artRes = await fetch(
    `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${job.github_run_id}/artifacts`,
    { headers: githubHeaders(githubSettings.pat_token) }
  );

  console.log("Artifact API response:", artRes.status);
  
  if (!artRes.ok) {
    const errorText = await artRes.text();
    console.log("Artifact API error:", errorText);
    return null;
  }

  const artData = await artRes.json() as {
    artifacts?: Array<{ id: number; archive_download_url: string; name: string; size_in_bytes: number; created_at: string }>;
    total_count?: number;
  };
  console.log("Total artifacts:", artData.total_count);
  console.log("Artifacts found:", artData.artifacts?.length || 0);
  
  const artifact = artData.artifacts?.[0];
  if (!artifact) {
    console.log("No artifact found in response");
    return null;
  }
  
  console.log("Artifact:", artifact.name, artifact.size_in_bytes, "bytes");
  
  // Use GitHub's artifact download API instead of the pre-signed URL
  console.log("Downloading artifact using GitHub API...");
  
  const downloadRes = await fetch(
    `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/artifacts/${artifact.id}/zip`,
    {
      headers: {
        ...githubHeaders(githubSettings.pat_token),
        "Accept": "application/vnd.github+json",
      },
      redirect: "manual", // Handle redirect manually
    }
  );

  console.log("Download response status:", downloadRes.status);
  
  // Handle redirect
  const location = downloadRes.headers.get("location");
  if (location && (downloadRes.status === 302 || downloadRes.status === 301)) {
    console.log("Following redirect to artifact storage:", location.substring(0, 100));
    
    // The redirect URL already contains the authentication token
    // Just follow it without adding extra headers
    const redirectRes = await fetch(location, {
      redirect: "follow",
    });
    
    console.log("Redirect fetch status:", redirectRes.status);
    
    if (!redirectRes.ok) {
      console.log("Redirect fetch failed:", redirectRes.status);
      return null;
    }
    
    const zipBytes = new Uint8Array(await redirectRes.arrayBuffer());
    console.log("Downloaded size:", zipBytes.length, "bytes");
    
    if (zipBytes.length < 100) {
      console.log("Downloaded file too small");
      return null;
    }
    
    // Check if it's a ZIP file
    const header = zipBytes[0] === 0x50 && zipBytes[1] === 0x4B;
    console.log("Is ZIP file:", header);
    
    if (header) {
      const extracted = unzipSync(zipBytes);
      console.log("Extracted files:", Object.keys(extracted).join(", "));
      const fileName = Object.keys(extracted).find((name) => name.toLowerCase().endsWith(".mp4"));
      console.log("Found mp4 file:", fileName);
      return fileName ? extracted[fileName] : null;
    }
    
    // Check if it's ZSTD
    const isZstd = zipBytes[0] === 0x28 && zipBytes[1] === 0xb5 && zipBytes[2] === 0x2f && zipBytes[3] === 0xfd;
    console.log("Is ZSTD file:", isZstd);
    
    if (isZstd) {
      try {
        const decompressed = await decompress(zipBytes);
        const dataToExtract = new Uint8Array(decompressed);
        console.log("Decompressed size:", dataToExtract.length, "bytes");
        const extracted = unzipSync(dataToExtract);
        const fileName = Object.keys(extracted).find((name) => name.toLowerCase().endsWith(".mp4"));
        return fileName ? extracted[fileName] : null;
      } catch (err) {
        console.log("ZSTD decompression failed:", err instanceof Error ? err.message : String(err));
        return null;
      }
    }
    
    return null;
  }
  
  // Direct download (no redirect)
  if (downloadRes.ok) {
    const zipBytes = new Uint8Array(await downloadRes.arrayBuffer());
    console.log("Direct download size:", zipBytes.length, "bytes");
    
    if (zipBytes.length > 100) {
      const header = zipBytes[0] === 0x50 && zipBytes[1] === 0x4B;
      if (header) {
        const extracted = unzipSync(zipBytes);
        const fileName = Object.keys(extracted).find((name) => name.toLowerCase().endsWith(".mp4"));
        return fileName ? extracted[fileName] : null;
      }
    }
  }
  
  console.log("Could not download artifact");
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (path === "/" || path === "/api") {
      return jsonResponse({
        success: true,
        data: { name: "Automation API", version: "1.0.0" },
      });
    }

    if (path.startsWith("/api/settings")) {
      return handleSettingsRoutes(request, env, path);
    }

    if (path.startsWith("/api/automations")) {
      return handleAutomationsRoutes(request, env, path);
    }

    if (path.startsWith("/api/jobs")) {
      return handleJobsRoutes(request, env, path);
    }

    if (path.startsWith("/api/uploads")) {
      return handleUploadsRoutes(request, env, path);
    }

    // Serve video file - redirect to Litterbox URL stored in DB
    if (path.startsWith("/api/output/") && (method === "GET" || method === "HEAD")) {
      const segments = path.split("/").filter(Boolean);
      const jobId = segments[2] ? parseInt(segments[2]) : null;
      if (!jobId) {
        return jsonResponse({ success: false, error: "Job ID required" }, 400);
      }

      const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first<Job>();
      if (!job) {
        return jsonResponse({ success: false, error: "Job not found" }, 404);
      }

      // Use video_url from DB (Litterbox URL)
      const videoUrl = (job as any).video_url as string | null;
      if (videoUrl && videoUrl.startsWith("https://")) {
        return new Response(null, {
          status: 302,
          headers: {
            "Location": videoUrl,
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Fallback: try GitHub artifact
      const githubSettings = await env.DB.prepare("SELECT * FROM settings_github LIMIT 1").first<GithubSettings>();
      if (!githubSettings || !job.github_run_id) {
        return jsonResponse({ success: false, error: "Video not available" }, 404);
      }

      try {
        const artifactBytes = await fetchArtifactVideoBytes(githubSettings, job);
        if (!artifactBytes) {
          return jsonResponse({ success: false, error: "Video not found — may have expired" }, 404);
        }
        return buildVideoResponse(request, artifactBytes);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        return jsonResponse({ success: false, error: errorMsg }, 500);
      }
    }

    // Serve video stream (for playing in browser)
    if (path.startsWith("/api/video/") && (method === "GET" || method === "HEAD")) {
      const segments = path.split("/").filter(Boolean);
      const jobId = segments[2] ? parseInt(segments[2]) : null;
      if (!jobId) {
        return jsonResponse({ success: false, error: "Job ID required" }, 400);
      }

      const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first<Job>();
      if (!job) {
        return jsonResponse({ success: false, error: "Job not found" }, 404);
      }

      const githubSettings = await env.DB.prepare("SELECT * FROM settings_github LIMIT 1").first<GithubSettings>();
      if (!githubSettings) {
        return jsonResponse({ success: false, error: "GitHub settings not configured" }, 400);
      }

      try {
        const repoResponse = await fetchRepoVideoResponse(request, githubSettings, jobId);
        if (repoResponse) {
          return repoResponse;
        }

        if (!job.github_run_id) {
          return jsonResponse({ success: false, error: "No GitHub run" }, 400);
        }

        const artifactBytes = await fetchArtifactVideoBytes(githubSettings, job);
        if (!artifactBytes) {
          return jsonResponse({ success: false, error: "No artifacts found" }, 404);
        }

        return buildVideoResponse(request, artifactBytes);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        return jsonResponse({ success: false, error: errorMsg }, 500);
      }
    }

    // Redirect to GitHub artifact download
    if (path.startsWith("/api/download/") && method === "GET") {
      const segments = path.split("/").filter(Boolean);
      const jobId = segments[2] ? parseInt(segments[2]) : null;
      if (!jobId) {
        return jsonResponse({ success: false, error: "Job ID required" }, 400);
      }

      const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first<Job>();
      if (!job) {
        return jsonResponse({ success: false, error: "Job not found" }, 404);
      }

      const githubSettings = await env.DB.prepare("SELECT * FROM settings_github LIMIT 1").first<GithubSettings>();
      if (!githubSettings || !job.github_run_id) {
        return jsonResponse({ success: false, error: "No GitHub run" }, 400);
      }

      try {
        const artRes = await fetch(
          `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${job.github_run_id}/artifacts`,
          {
            headers: {
              Authorization: `Bearer ${githubSettings.pat_token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "AutomationSystem/1.0",
            },
          }
        );

        const artData = await artRes.json() as { artifacts?: Array<{ archive_download_url: string }> };
        const artifact = artData.artifacts?.[0];

        if (artifact) {
          // Redirect to download URL
          return new Response(null, {
            status: 302,
            headers: {
              Location: artifact.archive_download_url,
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      } catch {}

      return jsonResponse({ success: false, error: "No artifact found" }, 404);
    }

    if (path === "/api/webhook/github" && method === "POST") {
      const body = await request.json() as Record<string, unknown>;
      const jobId = body.job_id as number;
      const status = body.status as string;
      const videoUrl = body.video_url as string | undefined;
      const outputDataRaw = body.output_data;
      const isTerminalStatus = status === "success" || status === "failed";
      const completedAt = isTerminalStatus ? new Date() : null;
      const completedAtText = completedAt ? formatDatabaseDate(completedAt) : null;
      
      if (jobId && status) {
        let mergedOutputData: Record<string, unknown> | null = null;
        if (typeof outputDataRaw === "string" && outputDataRaw.trim()) {
          try {
            const parsed = JSON.parse(outputDataRaw);
            if (parsed && typeof parsed === "object") {
              mergedOutputData = parsed as Record<string, unknown>;
            }
          } catch {
            mergedOutputData = { raw_output: outputDataRaw };
          }
        } else if (outputDataRaw && typeof outputDataRaw === "object") {
          mergedOutputData = outputDataRaw as Record<string, unknown>;
        }

        if (videoUrl) {
          mergedOutputData = { ...(mergedOutputData || {}), video_url: videoUrl };
        }

        if (isTerminalStatus) {
          await env.DB.prepare(
            "UPDATE jobs SET status = ?, output_data = ?, video_url = ?, completed_at = ? WHERE id = ?"
          ).bind(status, mergedOutputData ? JSON.stringify(mergedOutputData) : null, videoUrl || null, completedAtText, jobId).run();

          await markAutomationRunCompleted(env, jobId, completedAt as Date);
        } else {
          await env.DB.prepare(
            "UPDATE jobs SET status = ?, output_data = ?, video_url = ? WHERE id = ?"
          ).bind(status, mergedOutputData ? JSON.stringify(mergedOutputData) : null, videoUrl || null, jobId).run();
        }

        if (status === "success" && videoUrl) {
          // Extract draft_post_id from output_data if runner saved it
          let draftPostId: string | null = null;
          let livePostId: string | null = null;
          if (mergedOutputData) {
            draftPostId = (mergedOutputData.draft_post_id as string) || null;
            livePostId = (mergedOutputData.live_post_id as string) || null;
          }

          const existingUpload = await env.DB.prepare(
            "SELECT id FROM video_uploads WHERE job_id = ? LIMIT 1"
          ).bind(jobId).first<{ id: number }>();

          if (existingUpload?.id) {
            await env.DB.prepare(
              "UPDATE video_uploads SET media_url = ?, postforme_id = ?, upload_status = 'uploaded', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            ).bind(videoUrl, livePostId || draftPostId, existingUpload.id).run();
          } else {
            await env.DB.prepare(
              "INSERT INTO video_uploads (job_id, postforme_id, media_url, upload_status, post_status, aspect_ratio) VALUES (?, ?, ?, 'uploaded', 'pending', '9:16')"
            ).bind(jobId, livePostId || draftPostId, videoUrl).run();
          }

          // Save draft_post_id to jobs table for review queue
          if (draftPostId) {
            await env.DB.prepare(
              "UPDATE jobs SET draft_post_id = ?, video_expires_at = datetime('now', '+72 hours') WHERE id = ?"
            ).bind(draftPostId, jobId).run().catch(() => {
              // Column may not exist yet — ignore error
            });
          }
        }
        
        return jsonResponse({ success: true, message: "Job updated" });
      }
      return jsonResponse({ success: false, error: "Missing job_id or status" }, 400);
    }

    // GET /api/review-queue — Videos pending review (draft on PostForMe)
    if (path === "/api/review-queue" && method === "GET") {
      const jobs = await env.DB.prepare(`
        SELECT j.*, vu.postforme_id, vu.media_url as upload_media_url
        FROM jobs j
        LEFT JOIN video_uploads vu ON vu.job_id = j.id
        WHERE j.status = 'success'
          AND j.video_url IS NOT NULL
        ORDER BY j.created_at DESC
        LIMIT 50
      `).all<any>();
      return jsonResponse({ success: true, data: jobs.results });
    }

    // POST /api/review-queue/:postId/publish — Publish draft to accounts
    if (path.match(/^\/api\/review-queue\/(.+)\/publish$/) && method === "POST") {
      const postId = path.split("/")[3];
      const body = await request.json() as { account_ids: string[]; scheduled_at?: string | null };
      const postformeSettings = await env.DB.prepare("SELECT * FROM settings_postforme LIMIT 1").first<PostformeSettings>();
      if (!postformeSettings?.api_key) {
        return jsonResponse({ success: false, error: "PostForMe API key not configured" }, 400);
      }
      try {
        const updateBody: Record<string, unknown> = {
          isDraft: false,
          social_accounts: body.account_ids || [],
        };
        if (body.scheduled_at) {
          updateBody.scheduled_at = body.scheduled_at;
        }
        const res = await fetch(`https://api.postforme.dev/v1/social-posts/${postId}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${postformeSettings.api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateBody),
        });
        if (!res.ok) {
          const errText = await res.text();
          return jsonResponse({ success: false, error: errText }, 400);
        }
        const data = await res.json();
        return jsonResponse({ success: true, data });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        return jsonResponse({ success: false, error: errorMsg }, 500);
      }
    }

    return jsonResponse({ success: false, error: "Not found" }, 404);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processDueAutomations(env));
  },
};
