import { GithubSettings, WorkflowInputs } from "../types";
import { githubHeaders, sleep } from "../utils";

const WORKFLOW_NAME = "video-automation.yml";
const GITHUB_FETCH_TIMEOUT_MS = 15000;
const WORKER_WEBHOOK_URL = "https://automation-api.waqaskhan1437.workers.dev/api/webhook/github";
const RUNTIME_CONFIG_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const DISPATCH_CONFIG_DROP_KEYS = new Set([
  "youtube_cookies",
  "google_photos_cookies",
  "prompt_analysis_text",
  "prompt_short_plan",
  "social_topic",
  "social_platform",
  "social_count",
  "ai_gen_provider",
  "ai_gen_model",
  "social_ai_provider",
  "social_ai_model",
  "prompt_ai_provider",
  "prompt_ai_model",
]);

function sanitizeAutomationConfigForDispatch(config: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config || {})) {
    if (value === undefined || DISPATCH_CONFIG_DROP_KEYS.has(key)) {
      continue;
    }
    sanitized[key] = value;
  }

  const preparedVideoUrls = Array.isArray(sanitized.video_urls)
    ? sanitized.video_urls
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    : [];

  if (preparedVideoUrls.length > 0) {
    sanitized.video_urls = preparedVideoUrls;
    sanitized.source_urls = preparedVideoUrls;
    delete sanitized.video_url;
    delete sanitized.manual_links;
    delete sanitized.google_photos_links;
    delete sanitized.google_photos_album_url;
    delete sanitized.youtube_channel_url;
    delete sanitized.prompt_video_url;
    delete sanitized.prompt_local_file_path;
  }

  return sanitized;
}

export interface DispatchResult {
  success: boolean;
  runId: number | null;
  runUrl: string | null;
  error?: string;
  warning?: string;
  dispatched?: boolean;
  pendingRunLookup?: boolean;
  payloadBytes?: number;
  dispatchStatus?: number;
}



async function fetchGithubWithTimeout(url: string, init: RequestInit, timeoutMs: number = GITHUB_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getWorkflowRunsUrl(githubSettings: GithubSettings, workflowFile: string): string {
  return `https://github.com/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/workflows/${workflowFile}`;
}

type GitHubWorkflowListItem = {
  id: number;
  name: string;
  path: string;
  state?: string;
};

function expectedWorkflowNames(workflowFile: string): string[] {
  if (workflowFile === "image-automation.yml") {
    return ["Image Automation Runner"];
  }
  if (workflowFile === "video-automation.yml") {
    return ["Video Automation Runner"];
  }
  return [];
}

async function resolveWorkflowDispatchTarget(
  githubSettings: GithubSettings,
  workflowFile: string
): Promise<{ idOrFile: string; warning?: string }> {
  try {
    const workflowsUrl = `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/workflows?per_page=100`;
    const response = await fetchGithubWithTimeout(workflowsUrl, {
      headers: githubHeaders(githubSettings.pat_token),
    }, 12000);

    if (!response.ok) {
      const body = await response.text();
      return {
        idOrFile: workflowFile,
        warning: `Could not list GitHub workflows (${response.status}): ${body.substring(0, 240)}`,
      };
    }

    const data = await response.json() as { workflows?: GitHubWorkflowListItem[] };
    const workflows = Array.isArray(data.workflows) ? data.workflows : [];
    const names = expectedWorkflowNames(workflowFile);

    const match = workflows.find((workflow) => {
      const path = String(workflow.path || "");
      const name = String(workflow.name || "");
      return path.endsWith(`/${workflowFile}`) || path === workflowFile || names.includes(name);
    });

    if (!match) {
      const available = workflows
        .map((workflow) => `${workflow.name} (${workflow.path})`)
        .slice(0, 8)
        .join(", ");
      return {
        idOrFile: workflowFile,
        warning: `GitHub workflow ${workflowFile} was not found in the default branch. Available workflows: ${available || "none"}`,
      };
    }

    if (match.state && match.state !== "active") {
      return {
        idOrFile: String(match.id),
        warning: `GitHub workflow ${match.name} exists but state is ${match.state}. Enable it in GitHub Actions if dispatch still fails.`,
      };
    }

    return { idOrFile: String(match.id) };
  } catch (error) {
    return {
      idOrFile: workflowFile,
      warning: `Could not resolve GitHub workflow ID: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}


function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function createHmacSha256(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return new Uint8Array(signature);
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
}

export async function buildWorkflowRuntimeConfigToken(jobId: number, patToken: string): Promise<string> {
  const expiresAt = Date.now() + RUNTIME_CONFIG_TOKEN_TTL_MS;
  const payload = `${jobId}.${expiresAt}`;
  const signature = await createHmacSha256(patToken, `runtime-config:${payload}`);
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifyWorkflowRuntimeConfigToken(jobId: number, token: string, patToken: string): Promise<boolean> {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return false;
  }

  const parsedJobId = Number.parseInt(parts[0] || "", 10);
  const expiresAt = Number.parseInt(parts[1] || "", 10);
  if (!Number.isFinite(parsedJobId) || !Number.isFinite(expiresAt) || parsedJobId !== jobId) {
    return false;
  }

  if (Date.now() > expiresAt) {
    return false;
  }

  const actualSignature = fromBase64Url(parts[2] || "");
  if (!actualSignature) {
    return false;
  }

  const expectedSignature = await createHmacSha256(patToken, `runtime-config:${parts[0]}.${parts[1]}`);
  return timingSafeEqual(actualSignature, expectedSignature);
}

export async function dispatchWorkflow(
  githubSettings: GithubSettings,
  workflowInputs: Record<string, string>,
  workflowName: string = WORKFLOW_NAME
): Promise<DispatchResult> {
  try {
    const workflowFile = workflowName || WORKFLOW_NAME;
    console.log("[dispatchWorkflow] Workflow file:", workflowFile);
    console.log("[dispatchWorkflow] Workflow inputs keys:", Object.keys(workflowInputs));

    const requestBody = JSON.stringify({ ref: "master", inputs: workflowInputs });
    const payloadBytes = new TextEncoder().encode(requestBody).length;
    console.log("[dispatchWorkflow] Payload bytes:", payloadBytes);

    let workflowDispatchTarget = workflowFile;
    let workflowResolveWarning: string | undefined;

    async function postDispatch(idOrFile: string): Promise<{ status: number; text: string }> {
      const encodedWorkflow = encodeURIComponent(idOrFile);
      const dispatchUrl = `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/workflows/${encodedWorkflow}/dispatches`;
      console.log("[dispatchWorkflow] Dispatch URL:", dispatchUrl);
      const response = await fetchGithubWithTimeout(dispatchUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubSettings.pat_token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "AutomationSystem/1.0",
        },
        body: requestBody,
      });
      const status = response.status;
      const text = await response.text();
      console.log("[dispatchWorkflow] Response status:", status, "body:", text.substring(0, 500));
      return { status, text };
    }

    let dispatchResponse = await postDispatch(workflowDispatchTarget);
    let status = dispatchResponse.status;
    let responseText = dispatchResponse.text;

    if (
      status !== 204 &&
      status !== 201 &&
      status !== 200 &&
      (status === 404 || status === 422) &&
      /workflow_dispatch|not found|does not exist/i.test(responseText)
    ) {
      const resolved = await resolveWorkflowDispatchTarget(githubSettings, workflowFile);
      workflowResolveWarning = resolved.warning;
      if (resolved.idOrFile !== workflowDispatchTarget) {
        workflowDispatchTarget = resolved.idOrFile;
        console.log("[dispatchWorkflow] Retrying dispatch with resolved workflow target:", workflowDispatchTarget);
        dispatchResponse = await postDispatch(workflowDispatchTarget);
        status = dispatchResponse.status;
        responseText = dispatchResponse.text;
      }
    }

    if (status !== 204 && status !== 201 && status !== 200) {
      console.log("[dispatchWorkflow] Error response:", responseText);
      if (status === 422 && responseText.includes("inputs are too large")) {
        return {
          success: false,
          runId: null,
          runUrl: null,
          error: `GitHub workflow dispatch payload is too large (${payloadBytes} bytes) even after trimming automation_config.`,
          payloadBytes,
          dispatchStatus: status,
        };
      }
      const workflowHint = workflowResolveWarning
        ? ` ${workflowResolveWarning}.`
        : ` Confirm .github/workflows/${workflowFile} exists on master/main and contains workflow_dispatch.`;
      return {
        success: false,
        runId: null,
        runUrl: null,
        error: `GitHub API error while dispatching ${workflowFile}: ${status} - ${responseText}.${workflowHint}`,
        payloadBytes,
        dispatchStatus: status,
      };
    }
    console.log("[dispatchWorkflow] Workflow dispatched, checking for run ID...");

    let runId: number | null = null;
    let runUrl: string | null = null;
    let runLookupWarning = "";

    for (const waitMs of [2000, 5000, 9000]) {
      await sleep(waitMs);
      try {
        const runsRes = await fetchGithubWithTimeout(
          `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/workflows/${workflowDispatchTarget}/runs?event=workflow_dispatch&branch=master&per_page=5`,
          {
            headers: {
              Authorization: `Bearer ${githubSettings.pat_token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "AutomationSystem/1.0",
            },
          },
          12000
        );

        if (!runsRes.ok) {
          const body = await runsRes.text();
          runLookupWarning = `Workflow dispatched but run lookup failed: GitHub API ${runsRes.status} - ${body.substring(0, 300)}`;
          console.error("[dispatchWorkflow] Failed to get workflow runs:", runsRes.status, body);
        } else {
          const runsData = await runsRes.json() as { workflow_runs?: Array<{ id: number; html_url: string; event?: string; head_branch?: string }> };
          const run = (runsData.workflow_runs || []).find((item) => item.event === "workflow_dispatch") || runsData.workflow_runs?.[0];
          if (run) {
            runId = run.id;
            runUrl = run.html_url;
            console.log("[dispatchWorkflow] Got run ID:", runId);
            break;
          }
          runLookupWarning = "Workflow dispatched but no workflow_dispatch run was visible yet.";
          console.log("[dispatchWorkflow] No workflow runs found yet");
        }
      } catch (e) {
        runLookupWarning = `Workflow dispatched but run lookup errored: ${e instanceof Error ? e.message : String(e)}`;
        console.error("[dispatchWorkflow] Error getting workflow runs:", e);
      }
    }

    if (!runId) {
      const fallbackUrl = getWorkflowRunsUrl(githubSettings, workflowFile);
      console.error("[dispatchWorkflow] Dispatch returned success but no run ID found. Keeping job running with pending lookup.");
      return {
        success: true,
        runId: null,
        runUrl: fallbackUrl,
        warning: runLookupWarning || "Workflow dispatched but run ID was not visible yet.",
        dispatched: true,
        pendingRunLookup: true,
        payloadBytes,
        dispatchStatus: status,
      };
    }

    return { success: true, runId, runUrl, dispatched: true, payloadBytes, dispatchStatus: status };
  } catch (err) {
    console.error("[dispatchWorkflow] Error:", err instanceof Error ? err.message : String(err));
    return {
      success: false,
      runId: null,
      runUrl: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function getWorkflowRunStatus(
  githubSettings: GithubSettings,
  runId: number
): Promise<{ status: string; conclusion: string | null; html_url: string } | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${runId}`,
      { headers: githubHeaders(githubSettings.pat_token) }
    );

    if (!response.ok) return null;

    const data = await response.json() as { status: string; conclusion: string | null; html_url: string };
    return { status: data.status, conclusion: data.conclusion, html_url: data.html_url };
  } catch (err) {
    console.error("[getWorkflowRunStatus] Error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function getWorkflowRunJobs(
  githubSettings: GithubSettings,
  runId: number
): Promise<Array<{ name: string; status: string; conclusion: string | null; number: number }>> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${runId}/jobs`,
      { headers: githubHeaders(githubSettings.pat_token) }
    );

    if (!response.ok) return [];

    const data = await response.json() as {
      jobs?: Array<{
        steps?: Array<{ name: string; status: string; conclusion: string | null; number: number }>;
      }>;
    };
    return data.jobs?.[0]?.steps || [];
  } catch (err) {
    console.error("[getWorkflowRunJobs] Error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export function buildWorkflowInputs(
  jobId: number,
  automationId: number,
  config: Record<string, unknown>,
  postformeApiKey?: string
): WorkflowInputs {
  const dispatchConfig = sanitizeAutomationConfigForDispatch(config);
  const automationConfig = JSON.stringify(dispatchConfig);
  console.log("[buildWorkflowInputs] automation_config bytes:", new TextEncoder().encode(automationConfig).length);

  const inputs: WorkflowInputs = {
    job_id: String(jobId),
    automation_id: String(automationId),
    automation_config: automationConfig,
    worker_webhook_url: WORKER_WEBHOOK_URL,
  };

  if (postformeApiKey) {
    inputs.postforme_api_key = postformeApiKey;
  }

  return inputs;
}
