import { GithubSettings, WorkflowInputs } from "../types";
import { githubHeaders, sleep } from "../utils";

const WORKFLOW_NAME = "video-automation.yml";
const WORKER_WEBHOOK_URL = "https://automation-api.waqaskhan1437.workers.dev/api/webhook/github";

export interface DispatchResult {
  success: boolean;
  runId: number | null;
  runUrl: string | null;
  error?: string;
}

export async function dispatchWorkflow(
  githubSettings: GithubSettings,
  workflowInputs: Record<string, string>
): Promise<DispatchResult> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/workflows/${WORKFLOW_NAME}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubSettings.pat_token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "AutomationSystem/1.0",
        },
        body: JSON.stringify({ ref: "master", inputs: workflowInputs }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, runId: null, runUrl: null, error: `GitHub API error: ${errorText}` };
    }

    await sleep(2000);

    let runId: number | null = null;
    let runUrl: string | null = null;

    try {
      const runsRes = await fetch(
        `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs?per_page=1`,
        {
          headers: {
            Authorization: `Bearer ${githubSettings.pat_token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AutomationSystem/1.0",
          },
        }
      );

      if (runsRes.ok) {
        const runsData = await runsRes.json() as { workflow_runs?: Array<{ id: number; html_url: string }> };
        if (runsData.workflow_runs && runsData.workflow_runs.length > 0) {
          runId = runsData.workflow_runs[0].id;
          runUrl = runsData.workflow_runs[0].html_url;
        }
      }
    } catch {}

    return { success: true, runId, runUrl };
  } catch (err) {
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
  } catch {
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

    const data = await response.json() as { jobs?: Array<{ name: string; status: string; conclusion: string | null; number: number }> };
    return data.jobs?.[0]?.steps || [];
  } catch {
    return [];
  }
}

export function buildWorkflowInputs(
  jobId: number,
  automationId: number,
  config: Record<string, unknown>,
  postformeApiKey?: string
): WorkflowInputs {
  const inputs: WorkflowInputs = {
    job_id: String(jobId),
    automation_id: String(automationId),
    automation_config: JSON.stringify(config),
    worker_webhook_url: WORKER_WEBHOOK_URL,
  };

  if (postformeApiKey) {
    inputs.postforme_api_key = postformeApiKey;
  }

  return inputs;
}
