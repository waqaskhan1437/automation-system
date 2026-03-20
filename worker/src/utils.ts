import { ApiResponse, GithubSettings } from "../types";

export function jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
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

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function githubHeaders(patToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${patToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "AutomationSystem/1.0",
  };
}

export async function fetchGithubArtifact(
  githubSettings: GithubSettings,
  githubRunId: number
): Promise<{ ok: boolean; body: ReadableStream<Uint8Array> | null; name: string; error?: string }> {
  const artRes = await fetch(
    `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${githubRunId}/artifacts`,
    { headers: githubHeaders(githubSettings.pat_token) }
  );

  if (!artRes.ok) {
    return { ok: false, body: null, name: "", error: "Failed to fetch artifacts" };
  }

  const artData = await artRes.json() as { artifacts?: Array<{ name: string; archive_download_url: string }> };
  const artifact = artData.artifacts?.[0];

  if (!artifact) {
    return { ok: false, body: null, name: "", error: "No artifacts found" };
  }

  const fileRes = await fetch(artifact.archive_download_url, {
    headers: githubHeaders(githubSettings.pat_token),
    redirect: "follow",
  });

  if (!fileRes.ok) {
    return { ok: false, body: null, name: "", error: "Failed to download artifact" };
  }

  return { ok: true, body: fileRes.body, name: artifact.name };
}

export function parseJobId(path: string, segmentIndex: number): number | null {
  const segments = path.split("/").filter(Boolean);
  const id = segments[segmentIndex] ? parseInt(segments[segmentIndex]) : null;
  return id && !isNaN(id) ? id : null;
}

export function validateRequiredFields(obj: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    if (!obj[field]) {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
