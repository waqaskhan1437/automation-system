import { Env } from "../types";
import { jsonResponse, safeRequestJson } from "../utils";
import { getAuthContext, verifyApiKey } from "../services/auth";
import { triggerAutomationRun, parseAutomationConfig } from "../services/automation-scheduler";

export async function handleWebhookRoutes(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method;
  const segments = path.split("/").filter(Boolean);
  const webhookId = segments[2];
  const action = segments[3];

  // For webhook endpoints, we allow API key authentication via header or query
  let authContext = await getAuthContext(request, env);
  
  // Also allow webhook-specific API keys (more permissive)
  if (!authContext) {
    const url = new URL(request.url);
    const webhookToken = url.searchParams.get("token") || request.headers.get("X-Webhook-Token");
    if (webhookToken) {
      const apiKeyAuth = await verifyApiKey(env, webhookToken);
      if (apiKeyAuth && (apiKeyAuth.apiKey.key_type === 'webhook' || apiKeyAuth.apiKey.key_type === 'external')) {
        authContext = {
          userId: apiKeyAuth.user.id,
          user: apiKeyAuth.user,
          isAdmin: apiKeyAuth.isAdmin,
          token: webhookToken,
          apiKeyId: apiKeyAuth.apiKey.id,
          apiKeyType: apiKeyAuth.apiKey.key_type,
          apiKeyPermissions: apiKeyAuth.apiKey.permissions
        };
      }
    }
  }

  if (!authContext) {
    return jsonResponse({ success: false, error: "Unauthorized - Valid API key required" }, 401);
  }

  // POST /api/webhook/:webhook_id/trigger - Trigger automation with custom data
  if (path === `/api/webhook/${webhookId}/trigger` && method === "POST") {
    try {
      const body = await safeRequestJson<{
        automation_id?: number;
        automation_name?: string;
        input_data?: Record<string, unknown>;
        config_overrides?: Record<string, unknown>;
        scheduled_at?: string;
      }>(request);

      if (!body) {
        return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
      }

      let automation;
      
      if (body.automation_id) {
        // Get automation by ID
        automation = await env.DB.prepare(
          "SELECT * FROM automations WHERE id = ? AND user_id = ? AND status = 'active' LIMIT 1"
        ).bind(body.automation_id, authContext.userId).first();
      } else if (body.automation_name) {
        // Get automation by name
        automation = await env.DB.prepare(
          "SELECT * FROM automations WHERE name = ? AND user_id = ? AND status = 'active' LIMIT 1"
        ).bind(body.automation_name, authContext.userId).first();
      } else {
        return jsonResponse({ success: false, error: "automation_id or automation_name is required" }, 400);
      }

      if (!automation) {
        return jsonResponse({ success: false, error: "Automation not found or not active" }, 404);
      }

      let automationConfig = typeof automation.config === 'string' ? JSON.parse(automation.config) : automation.config;

      // Apply config overrides if provided
      if (body.config_overrides) {
        automationConfig = { ...automationConfig, ...body.config_overrides };
      }

      // Merge input data with automation config
      const inputData = {
        ...body.input_data,
        webhook_triggered: true,
        webhook_id: webhookId,
        triggered_at: new Date().toISOString()
      };

      // Trigger the automation
      const runResult = await triggerAutomationRun(env, {
        ...automation,
        config: JSON.stringify(automationConfig)
      } as any, authContext.userId, {
        replaceExistingLocalRun: true,
        inputData
      });

      if (!runResult.success) {
        return jsonResponse(
          { success: false, error: runResult.error || "Failed to trigger automation" },
          runResult.inProgress ? 409 : 500
        );
      }

      return jsonResponse({
        success: true,
        data: {
          job_id: runResult.jobId,
          automation_id: automation.id,
          automation_name: automation.name,
          github_run_id: runResult.githubRunId ?? null,
          message: "Automation triggered via webhook"
        }
      });
    } catch (error) {
      console.error("Webhook trigger error:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to process webhook";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  // GET /api/webhook/:webhook_id/status/:job_id - Get job status
  if (path === `/api/webhook/${webhookId}/status/${segments[3]}` && method === "GET") {
    try {
      const jobId = parseInt(segments[3], 10);
      
      const job = await env.DB.prepare(
        `SELECT j.*, a.name as automation_name 
         FROM jobs j 
         INNER JOIN automations a ON j.automation_id = a.id 
         WHERE j.id = ? AND j.user_id = ? LIMIT 1`
      ).bind(jobId, authContext.userId).first();

      if (!job) {
        return jsonResponse({ success: false, error: "Job not found" }, 404);
      }

      return jsonResponse({
        success: true,
        data: {
          job_id: job.id,
          automation_id: job.automation_id,
          automation_name: job.automation_name,
          status: job.status,
          started_at: job.started_at,
          completed_at: job.completed_at,
          error_message: job.error_message,
          video_url: job.video_url
        }
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to get job status";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  // POST /api/webhook/:webhook_id/command - Send command to runner (external control)
  if (path === `/api/webhook/${webhookId}/command` && method === "POST") {
    try {
      const body = await safeRequestJson<{
        command_type: 'restart_runner' | 'run_setup' | 'sync_runner_code' | 'refresh_remote_access' | 'custom';
        payload?: Record<string, unknown>;
      }>(request);

      if (!body) {
        return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
      }

      if (!body.command_type) {
        return jsonResponse({ success: false, error: "command_type is required" }, 400);
      }

      // Check if user has permission for runner commands
      const allowedCommands = ['restart_runner', 'run_setup', 'sync_runner_code', 'refresh_remote_access'];
      if (allowedCommands.includes(body.command_type)) {
        // Insert command into runner_commands table
        const result = await env.DB.prepare(
          `INSERT INTO runner_commands (user_id, requested_by_user_id, command_type, payload, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        ).bind(authContext.userId, authContext.userId, body.command_type, body.payload ? JSON.stringify(body.payload) : null).run();

        return jsonResponse({
          success: true,
          data: {
            command_id: result.meta.last_row_id,
            command_type: body.command_type,
            payload: body.payload,
            status: 'pending'
          },
          message: "Command queued for runner"
        }, 201);
      } else {
        return jsonResponse({ success: false, error: "Unsupported command type" }, 400);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to queue command";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  // GET /api/webhook/:webhook_id/runner/status - Get runner status
  if (path === `/api/webhook/${webhookId}/runner/status` && method === "GET") {
    try {
      const user = await env.DB.prepare(
        "SELECT runner_status, runner_hostname, runner_last_seen_at, runner_platform, tailscale_status, tailscale_ip FROM users WHERE id = ? LIMIT 1"
      ).bind(authContext.userId).first();

      return jsonResponse({
        success: true,
        data: {
          runner_status: user?.runner_status || 'offline',
          hostname: user?.runner_hostname,
          last_seen: user?.runner_last_seen_at,
          platform: user?.runner_platform,
          tailscale: {
            status: user?.tailscale_status,
            ip: user?.tailscale_ip
          }
        }
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to get runner status";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  return jsonResponse({ success: false, error: "Webhook endpoint not found" }, 404);
}
