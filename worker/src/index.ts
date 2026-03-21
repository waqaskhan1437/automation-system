import { Env, ApiResponse, GithubSettings, Job, PostformeSettings } from "./types";
import { handleSettingsRoutes } from "./routes/settings";
import { handleAutomationsRoutes } from "./routes/automations";
import { handleJobsRoutes } from "./routes/jobs";
import { handleUploadsRoutes } from "./routes/uploads";

function jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
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

    // Serve video/image output files
    if (path.startsWith("/api/output/") && method === "GET") {
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
        return jsonResponse({ success: false, error: "No GitHub run associated" }, 400);
      }

      try {
        // Get artifacts list
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

        if (!artRes.ok) {
          return jsonResponse({ success: false, error: "Failed to fetch artifacts" }, 500);
        }

        const artData = await artRes.json() as { artifacts?: Array<{ name: string; archive_download_url: string }> };
        const artifacts = artData.artifacts || [];

        if (artifacts.length === 0) {
          return jsonResponse({ success: false, error: "No artifacts found" }, 404);
        }

        // Get the artifact download URL
        const artifact = artifacts[0];
        const downloadUrl = artifact.archive_download_url;

        // Fetch the actual artifact (it's a zip file)
        const fileRes = await fetch(downloadUrl, {
          headers: {
            Authorization: `Bearer ${githubSettings.pat_token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AutomationSystem/1.0",
          },
          redirect: "follow",
        });

        if (!fileRes.ok) {
          return jsonResponse({ success: false, error: "Failed to download artifact" }, 500);
        }

        // Return the zip file with proper headers
        return new Response(fileRes.body, {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${artifact.name}.zip"`,
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        return jsonResponse({ success: false, error: errorMsg }, 500);
      }
    }

    // Serve video stream (for playing in browser)
    if (path.startsWith("/api/video/") && method === "GET") {
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

        if (!artRes.ok) {
          return jsonResponse({ success: false, error: "Failed to fetch artifacts" }, 500);
        }

        const artData = await artRes.json() as { artifacts?: Array<{ id: number; name: string; archive_download_url: string }> };
        const artifacts = artData.artifacts || [];

        if (artifacts.length === 0) {
          return jsonResponse({ success: false, error: "No artifacts found" }, 404);
        }

        const artifact = artifacts[0];

        // Download the artifact and serve as video
        const fileRes = await fetch(artifact.archive_download_url, {
          headers: {
            Authorization: `Bearer ${githubSettings.pat_token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AutomationSystem/1.0",
          },
          redirect: "follow",
        });

        if (!fileRes.ok) {
          return jsonResponse({ success: false, error: "Failed to download" }, 500);
        }

        // Return the zip file for download
        return new Response(fileRes.body, {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="video-job${jobId}.zip"`,
            "Access-Control-Allow-Origin": "*",
          },
        });
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
      
      if (jobId && status) {
        await env.DB.prepare(
          "UPDATE jobs SET status = ?, output_data = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(status, videoUrl ? JSON.stringify({ video_url: videoUrl }) : null, jobId).run();

        if (status === "success" && videoUrl) {
          await env.DB.prepare(
            "INSERT INTO video_uploads (job_id, media_url, upload_status, post_status, aspect_ratio) VALUES (?, ?, 'uploaded', 'pending', '9:16')"
          ).bind(jobId, videoUrl).run();
          
          const postformeSettings = await env.DB.prepare("SELECT * FROM settings_postforme LIMIT 1").first<PostformeSettings>();
          
          if (postformeSettings?.api_key) {
            try {
              const platforms = postformeSettings.platforms ? JSON.parse(postformeSettings.platforms) : ["instagram", "tiktok"];
              
              const accountRes = await fetch("https://api.postforme.dev/v1/social-accounts", {
                headers: { "Authorization": `Bearer ${postformeSettings.api_key}` },
              });
              
              if (accountRes.ok) {
                const accountData = await accountRes.json() as { data?: Array<{ id: string; platform: string }> };
                const accounts = accountData.data || [];
                const selectedAccounts = accounts.filter((a: any) => platforms.some((p: string) => a.platform === p)).map((a: any) => a.id);
                
                if (selectedAccounts.length > 0) {
                  const postRes = await fetch("https://api.postforme.dev/v1/social-posts", {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${postformeSettings.api_key}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      media: [{ url: videoUrl }],
                      social_accounts: selectedAccounts,
                      caption: "Automated video post",
                    }),
                  });

                  if (postRes.ok) {
                    const postData = await postRes.json() as { id?: string; data?: { id?: string } };
                    const postId = postData?.id || postData?.data?.id;
                    
                    await env.DB.prepare(
                      "UPDATE video_uploads SET postforme_id = ? WHERE job_id = ?"
                    ).bind(postId, jobId).run();
                  }
                }
              }
            } catch (err) {
              console.error("Auto-upload failed:", err);
            }
          }
        }
        
        return jsonResponse({ success: true, message: "Job updated" });
      }
      return jsonResponse({ success: false, error: "Missing job_id or status" }, 400);
    }

    return jsonResponse({ success: false, error: "Not found" }, 404);
  },
};
