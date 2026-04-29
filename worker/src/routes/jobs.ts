import { AuthContext, Env, Job, GithubSettings } from "../types";
import { jsonResponse, githubHeaders, safeRequestJson } from "../utils";
import { getScopedSettings } from "../services/user-settings";

export async function handleJobsRoutes(
  request: Request,
  env: Env,
  path: string,
  auth: AuthContext
): Promise<Response> {
  const method = request.method;
  const userId = auth.userId;
  const segments = path.split("/").filter(Boolean);
  const id = segments[2] ? parseInt(segments[2]) : null;
  const action = segments[3];

  // GET /api/jobs - List all
  if (path === "/api/jobs" && method === "GET") {
    const url = new URL(request.url);
    const automationId = url.searchParams.get("automation_id");
    const status = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    let query = "SELECT * FROM jobs WHERE user_id = ?";
    const params: (string | number)[] = [userId];

    if (automationId) {
      query += " AND automation_id = ?";
      params.push(parseInt(automationId));
    }
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const result = await env.DB.prepare(query).bind(...params).all<Job>();
    return jsonResponse({ success: true, data: result.results });
  }

  // Single job routes
  if (id && !action) {
    // GET /api/jobs/:id
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").bind(id, userId).first<Job>();
      if (!result) {
        return jsonResponse({ success: false, error: "Job not found" }, 404);
      }
      return jsonResponse({ success: true, data: result });
    }
  }

  // POST /api/jobs/:id/retry
  if (id && action === "retry" && method === "POST") {
    const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").bind(id, userId).first<Job>();
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    await env.DB.prepare(
      "UPDATE jobs SET status = 'queued', error_message = NULL, completed_at = NULL WHERE id = ? AND user_id = ?"
    ).bind(id, userId).run();

    return jsonResponse({ success: true, message: "Job queued for retry" });
  }

  // GET /api/jobs/:id/artifacts - Get GitHub Actions artifacts
  if (id && action === "artifacts" && method === "GET") {
    const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").bind(id, userId).first<Job>();
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    const githubSettings = await getScopedSettings<GithubSettings>(env.DB, "github", userId);
    if (!githubSettings) {
      return jsonResponse({ success: false, error: "GitHub settings not configured" }, 400);
    }

    if (!job.github_run_id) {
      return jsonResponse({ success: false, error: "No GitHub run associated with this job" }, 400);
    }

    try {
      const res = await fetch(
        `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${job.github_run_id}/artifacts`,
        {
          headers: githubHeaders(githubSettings.pat_token),
        }
      );

      if (res.ok) {
        const data = await res.json() as { artifacts?: Array<{ name: string; archive_download_url: string; size_in_bytes: number }> };
        return jsonResponse({ success: true, data: data.artifacts || [] });
      }
      return jsonResponse({ success: false, error: "Failed to fetch artifacts" });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      return jsonResponse({ success: false, error: errorMsg });
    }
  }

  // GET /api/jobs/:id/logs - Get GitHub Actions run logs
  if (id && action === "logs" && method === "GET") {
    const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").bind(id, userId).first<Job>();
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    if (!job.github_run_id) {
      const localSteps = (() => {
        if (job.status === "queued") {
          return [
            { name: "Queued on local runner", status: "completed", conclusion: "success", number: 1 },
            { name: "Waiting for runner pickup", status: "in_progress", conclusion: null, number: 2 },
          ];
        }
        if (job.status === "running") {
          return [
            { name: "Queued on local runner", status: "completed", conclusion: "success", number: 1 },
            { name: "Runner picked up job", status: "completed", conclusion: "success", number: 2 },
            { name: "Processing local video", status: "in_progress", conclusion: null, number: 3 },
          ];
        }
        if (job.status === "success") {
          return [
            { name: "Queued on local runner", status: "completed", conclusion: "success", number: 1 },
            { name: "Runner picked up job", status: "completed", conclusion: "success", number: 2 },
            { name: "Processing local video", status: "completed", conclusion: "success", number: 3 },
            { name: "Upload complete", status: "completed", conclusion: "success", number: 4 },
          ];
        }
        if (job.status === "failed") {
          return [
            { name: "Queued on local runner", status: "completed", conclusion: "success", number: 1 },
            { name: "Processing local video", status: "completed", conclusion: "failure", number: 2 },
          ];
        }
        if (job.status === "cancelled") {
          return [
            { name: "Queued on local runner", status: "completed", conclusion: "success", number: 1 },
            { name: "Superseded by a newer local run", status: "completed", conclusion: "cancelled", number: 2 },
          ];
        }
        return [];
      })();

      return jsonResponse({
        success: true,
        data: {
          run_id: null,
          run_status: job.status,
          run_conclusion: job.status === "success"
            ? "success"
            : (job.status === "failed" ? "failure" : (job.status === "cancelled" ? "cancelled" : null)),
          run_url: null,
          steps: localSteps,
          log_url: null,
        },
      });
    }

    const githubSettings = await getScopedSettings<GithubSettings>(env.DB, "github", userId);
    if (!githubSettings) {
      return jsonResponse({ success: false, error: "GitHub settings not configured" }, 400);
    }

    if (!job.github_run_id) {
      return jsonResponse({ success: false, error: "No GitHub run associated with this job" }, 400);
    }

    try {
      // First get run details
      const runRes = await fetch(
        `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${job.github_run_id}`,
        {
          headers: githubHeaders(githubSettings.pat_token),
        }
      );

      let runStatus = "unknown";
      let runConclusion = null;
      let runUrl = job.github_run_url || "";

      if (runRes.ok) {
        const runData = await runRes.json() as { status: string; conclusion: string | null; html_url: string };
        runStatus = runData.status;
        runConclusion = runData.conclusion;
        runUrl = runData.html_url;

        if (runData.status === "completed") {
          const dbStatus = runData.conclusion === "success" ? "success" : (runData.conclusion === "cancelled" ? "cancelled" : "failed");
          const canCorrectBlankFailure = job.status === "failed" && dbStatus === "success" && (!job.error_message || !job.error_message.trim());
          if (job.status !== dbStatus && (job.status !== "failed" || canCorrectBlankFailure)) {
            await env.DB.prepare("UPDATE jobs SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
              .bind(dbStatus, dbStatus === "success" ? null : "GitHub Actions concluded " + (runData.conclusion || "failure"), id, userId)
              .run();
          }
        } else if (runData.status === "in_progress" && job.status === "queued") {
          await env.DB.prepare("UPDATE jobs SET status = 'running' WHERE id = ? AND user_id = ?").bind(id, userId).run();
        }
      }

      // Get jobs list for step details
      const jobsRes = await fetch(
        `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${job.github_run_id}/jobs`,
        {
          headers: githubHeaders(githubSettings.pat_token),
        }
      );

      let steps: Array<{ name: string; status: string; conclusion: string | null; number: number }> = [];
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json() as { jobs?: Array<{ name: string; status: string; conclusion: string | null; steps?: Array<{ name: string; status: string; conclusion: string | null; number: number }> }> };
        if (jobsData.jobs && jobsData.jobs.length > 0) {
          steps = jobsData.jobs[0].steps || [];
        }
      }

      // Get log URL (actual logs require download)
      const logUrl = `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${job.github_run_id}/logs`;

      return jsonResponse({
        success: true,
        data: {
          run_id: job.github_run_id,
          run_status: runStatus,
          run_conclusion: runConclusion,
          run_url: runUrl,
          steps: steps,
          log_url: logUrl,
        },
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      return jsonResponse({ success: false, error: errorMsg });
    }
  }

  // GET /api/jobs/:id/status - Get real-time job status
  if (id && action === "status" && method === "GET") {
    const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").bind(id, userId).first<Job>();
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    const githubSettings = await getScopedSettings<GithubSettings>(env.DB, "github", userId);
    if (!githubSettings || !job.github_run_id) {
      return jsonResponse({ success: true, data: { status: job.status, error: job.error_message } });
    }

    try {
      const runRes = await fetch(
        `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${job.github_run_id}`,
        {
          headers: githubHeaders(githubSettings.pat_token),
        }
      );

      if (runRes.ok) {
        const runData = await runRes.json() as { status: string; conclusion: string | null; html_url: string };
        
        // Update job status in DB based on GitHub run status
        let dbStatus = job.status;
        if (runData.status === "completed") {
          dbStatus = runData.conclusion === "success" ? "success" : (runData.conclusion === "cancelled" ? "cancelled" : "failed");
          await env.DB.prepare(
            "UPDATE jobs SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
          ).bind(dbStatus, dbStatus === "success" ? null : "GitHub Actions concluded " + (runData.conclusion || "failure"), id, userId).run();
        } else if (runData.status === "in_progress") {
          dbStatus = "running";
          await env.DB.prepare("UPDATE jobs SET status = 'running' WHERE id = ? AND user_id = ?").bind(id, userId).run();
        }

        return jsonResponse({
          success: true,
          data: {
            status: dbStatus,
            github_status: runData.status,
            github_conclusion: runData.conclusion,
            run_url: runData.html_url,
            error: job.error_message,
          },
        });
      }
    } catch {}

    return jsonResponse({ success: true, data: { status: job.status, error: job.error_message } });
  }

  // DELETE /api/jobs - Delete all jobs
  if (path === "/api/jobs" && method === "DELETE") {
    // Delete video_uploads first due to foreign key constraint
    await env.DB.prepare("DELETE FROM video_uploads WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM jobs WHERE user_id = ?").bind(userId).run();
    return jsonResponse({ success: true, message: "All jobs deleted" });
  }

  // DELETE /api/jobs/:id - Delete single job
  if (id && !action && method === "DELETE") {
    const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").bind(id, userId).first<Job>();
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }
    // Delete video_uploads first due to foreign key constraint
    await env.DB.prepare("DELETE FROM video_uploads WHERE job_id = ? AND user_id = ?").bind(id, userId).run();
    await env.DB.prepare("DELETE FROM jobs WHERE id = ? AND user_id = ?").bind(id, userId).run();
    return jsonResponse({ success: true, message: "Job deleted" });
  }

  // POST /api/jobs/:id/cancel - Cancel a running job (cancel GitHub workflow)
  if (id && action === "cancel" && method === "POST") {
    const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").bind(id, userId).first<Job>();
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }
    
    // If job has a GitHub run ID, cancel it
    if (job.github_run_id) {
      const githubSettings = await getScopedSettings<GithubSettings>(env.DB, "github", userId);
      if (githubSettings) {
        try {
          const cancelResponse = await fetch(
            `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${job.github_run_id}/cancel`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${githubSettings.pat_token}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
              },
            }
          );
          
          if (cancelResponse.ok || cancelResponse.status === 409) {
            // Update job status
            await env.DB.prepare(
              "UPDATE jobs SET status = 'cancelled', error_message = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
            ).bind("Cancelled by user", id, userId).run();
            
            return jsonResponse({ success: true, message: "Job cancelled successfully" });
          } else {
            const errorText = await cancelResponse.text();
            return jsonResponse({ success: false, error: `GitHub cancel failed: ${errorText}` }, 500);
          }
        } catch (err) {
          return jsonResponse({ success: false, error: `Cancel error: ${err instanceof Error ? err.message : "Unknown"}` }, 500);
        }
      }
    }
    
    // If no GitHub run, just mark as cancelled
    await env.DB.prepare(
      "UPDATE jobs SET status = 'cancelled', error_message = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
    ).bind("Cancelled by user", id, userId).run();
    
    return jsonResponse({ success: true, message: "Job marked as cancelled" });
  }

  return jsonResponse({ success: false, error: "Job route not found" }, 404);
}
