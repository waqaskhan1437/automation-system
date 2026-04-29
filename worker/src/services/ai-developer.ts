import { AuthContext, Env, GithubSettings } from "../types";
import { githubHeaders, jsonResponse } from "../utils";
import { getScopedSettings } from "./user-settings";

export const AI_DEVELOPER_SCOPES = [
  "project.read",
  "files.read",
  "files.write",
  "automation.read",
  "automation.write",
  "settings.read",
  "settings.write",
  "integrations.manage",
  "git.read",
  "git.branch.create",
  "git.commit",
  "git.pull_request.create",
  "deploy.trigger",
  "logs.read",
  "admin.full",
] as const;

export type AiDeveloperScope = typeof AI_DEVELOPER_SCOPES[number];

export type GitHubFileUpdate = {
  path: string;
  content: string;
};

export type GitHubCommitResult = {
  branch: string;
  commit_sha: string;
  commit_url: string;
  files_changed: number;
  created_branch: boolean;
};

type GitHubRef = {
  object?: {
    sha?: string;
  };
};

type GitHubRepo = {
  default_branch?: string;
  html_url?: string;
  full_name?: string;
};

type GitHubCommit = {
  sha?: string;
  tree?: {
    sha?: string;
  };
  html_url?: string;
};

type GitHubBlob = {
  sha?: string;
};

type GitHubTree = {
  sha?: string;
};

type GitHubTreeResponse = {
  tree?: Array<{
    path?: string;
    type?: string;
    size?: number;
    sha?: string;
  }>;
  truncated?: boolean;
};

type GitHubContentFile = {
  type?: string;
  name?: string;
  path?: string;
  sha?: string;
  size?: number;
  encoding?: string;
  content?: string;
  download_url?: string | null;
  html_url?: string;
};

type GitHubPullRequest = {
  number?: number;
  html_url?: string;
  state?: string;
};

type GitHubWorkflowRun = {
  id?: number;
  html_url?: string;
  status?: string;
};

const SECRET_KEY_PATTERN = /(token|secret|password|api_key|apikey|private|cookies?|pat|key)$/i;
const TEXT_DECODER = new TextDecoder();
const TEXT_ENCODER = new TextEncoder();
const GITHUB_API_TIMEOUT_MS = 15000;

export function parseScopeList(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry).trim()).filter(Boolean);
      }
    } catch {
      // Accept comma-separated legacy values.
    }

    return trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
  }

  return [];
}

export function normalizeScopes(scopes: unknown): string[] {
  const allowed = new Set<string>(AI_DEVELOPER_SCOPES);
  return Array.from(new Set(parseScopeList(scopes).filter((scope) => allowed.has(scope))));
}

export function canUseAiScope(auth: AuthContext, requiredScope: string): boolean {
  if (auth.isAdmin && !auth.apiKeyId) {
    return true;
  }

  const permissions = auth.apiKeyPermissions || (auth.isAdmin ? "full" : "read");
  if (permissions === "full" || permissions === "admin") {
    return true;
  }

  const scopes = auth.apiKeyScopes || [];
  if (scopes.includes("admin.full") || scopes.includes(requiredScope)) {
    return true;
  }

  if (requiredScope.endsWith(".read") && scopes.includes(requiredScope.replace(".read", ".write"))) {
    return true;
  }

  if (requiredScope.endsWith(".read") && permissions === "read") {
    return true;
  }

  if (requiredScope.endsWith(".write") && permissions === "write") {
    return true;
  }

  return false;
}

export function requireAiScope(auth: AuthContext, requiredScope: string): Response | null {
  if (canUseAiScope(auth, requiredScope)) {
    return null;
  }

  return jsonResponse({
    success: false,
    error: `Missing required API scope: ${requiredScope}`,
  }, 403);
}

export function maskSecretValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (!value) {
      return value;
    }
    return "********";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => maskSecretValue(entry));
  }

  if (typeof value === "object") {
    return maskObjectSecrets(value as Record<string, unknown>);
  }

  return value;
}

export function maskObjectSecrets<T extends Record<string, unknown> | null | undefined>(record: T): T {
  if (!record) {
    return record;
  }

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      masked[key] = maskSecretValue(value);
    } else if (value && typeof value === "object") {
      masked[key] = maskSecretValue(value);
    } else {
      masked[key] = value;
    }
  }

  return masked as T;
}

export async function getGithubSettingsForUser(env: Env, userId: number): Promise<GithubSettings | null> {
  const settings = await getScopedSettings<GithubSettings>(env.DB, "github", userId);
  if (!settings?.pat_token || !settings.repo_owner || !settings.repo_name) {
    return null;
  }
  return settings;
}

function buildGitHubUrl(settings: GithubSettings, path: string): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `https://api.github.com/repos/${settings.repo_owner}/${settings.repo_name}/${cleanPath}`;
}

async function githubJson<T>(settings: GithubSettings, path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(buildGitHubUrl(settings, path), {
      ...init,
      signal: controller.signal,
      headers: {
        ...githubHeaders(settings.pat_token),
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/abort/i.test(message)) {
      throw new Error(`GitHub API timed out after ${GITHUB_API_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();
  let parsed: T;
  try {
    parsed = responseText ? JSON.parse(responseText) as T : ({} as T);
  } catch {
    parsed = ({ message: responseText } as unknown) as T;
  }

  if (!response.ok) {
    const errorPayload = parsed as { message?: string; documentation_url?: string };
    throw new Error(`GitHub API ${response.status}: ${errorPayload.message || responseText || "Request failed"}`);
  }

  return parsed;
}

export async function getRepositoryInfo(settings: GithubSettings): Promise<GitHubRepo> {
  return githubJson<GitHubRepo>(settings, "");
}

export async function getDefaultBranch(settings: GithubSettings): Promise<string> {
  const repo = await getRepositoryInfo(settings);
  return repo.default_branch || "master";
}

export async function getBranchHeadSha(settings: GithubSettings, branch: string): Promise<string> {
  const ref = await githubJson<GitHubRef>(settings, `git/ref/heads/${encodeURIComponent(branch)}`);
  const sha = ref.object?.sha;
  if (!sha) {
    throw new Error(`Branch not found or unreadable: ${branch}`);
  }
  return sha;
}

export async function createBranchIfMissing(settings: GithubSettings, branch: string, baseBranch?: string): Promise<{ branch: string; created: boolean; sha: string }> {
  try {
    const sha = await getBranchHeadSha(settings, branch);
    return { branch, created: false, sha };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not found|404/i.test(message)) {
      throw error;
    }
  }

  const base = baseBranch || await getDefaultBranch(settings);
  const baseSha = await getBranchHeadSha(settings, base);
  await githubJson<GitHubRef>(settings, "git/refs", {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  return { branch, created: true, sha: baseSha };
}

export async function listRepositoryFiles(settings: GithubSettings, ref?: string): Promise<{ default_branch: string; ref: string; truncated: boolean; files: Array<{ path: string; size: number | null; sha: string | null }> }> {
  const defaultBranch = await getDefaultBranch(settings);
  const branch = ref || defaultBranch;
  const branchSha = await getBranchHeadSha(settings, branch);
  const tree = await githubJson<GitHubTreeResponse>(settings, `git/trees/${branchSha}?recursive=1`);
  const files = (tree.tree || [])
    .filter((entry) => entry.type === "blob" && entry.path)
    .map((entry) => ({
      path: entry.path as string,
      size: typeof entry.size === "number" ? entry.size : null,
      sha: entry.sha || null,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    default_branch: defaultBranch,
    ref: branch,
    truncated: Boolean(tree.truncated),
    files,
  };
}

function decodeBase64Content(content: string): string {
  const normalized = content.replace(/\n/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return TEXT_DECODER.decode(bytes);
}

export async function readRepositoryFile(settings: GithubSettings, filePath: string, ref?: string): Promise<{ path: string; sha: string | null; size: number | null; encoding: string | null; content: string; html_url: string | null; ref: string | null }> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const encodedPath = filePath.split("/").map((part) => encodeURIComponent(part)).join("/");
  const file = await githubJson<GitHubContentFile>(settings, `contents/${encodedPath}${query}`);
  if (file.type !== "file") {
    throw new Error(`${filePath} is not a file`);
  }

  const content = file.encoding === "base64" && file.content ? decodeBase64Content(file.content) : (file.content || "");
  return {
    path: file.path || filePath,
    sha: file.sha || null,
    size: typeof file.size === "number" ? file.size : null,
    encoding: file.encoding || null,
    content,
    html_url: file.html_url || null,
    ref: ref || null,
  };
}

function assertSafeFilePath(filePath: string): string {
  const normalized = filePath.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.endsWith("/")) {
    throw new Error(`Unsafe or invalid file path: ${filePath}`);
  }
  return normalized;
}

export async function commitRepositoryFiles(
  settings: GithubSettings,
  files: GitHubFileUpdate[],
  options: { branch: string; baseBranch?: string; message: string }
): Promise<GitHubCommitResult> {
  if (!files.length) {
    throw new Error("At least one file is required");
  }

  const safeFiles = files.map((file) => ({
    path: assertSafeFilePath(file.path),
    content: String(file.content ?? ""),
  }));

  const branchInfo = await createBranchIfMissing(settings, options.branch, options.baseBranch);
  const currentSha = await getBranchHeadSha(settings, options.branch);
  const currentCommit = await githubJson<GitHubCommit>(settings, `git/commits/${currentSha}`);
  const baseTreeSha = currentCommit.tree?.sha;
  if (!baseTreeSha) {
    throw new Error(`Could not read tree for branch ${options.branch}`);
  }

  const treeEntries = [] as Array<{ path: string; mode: string; type: string; sha: string }>;
  for (const file of safeFiles) {
    const blob = await githubJson<GitHubBlob>(settings, "git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
    });
    if (!blob.sha) {
      throw new Error(`GitHub did not return blob SHA for ${file.path}`);
    }
    treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await githubJson<GitHubTree>(settings, "git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });
  if (!tree.sha) {
    throw new Error("GitHub did not return a new tree SHA");
  }

  const commit = await githubJson<GitHubCommit>(settings, "git/commits", {
    method: "POST",
    body: JSON.stringify({ message: options.message, tree: tree.sha, parents: [currentSha] }),
  });
  if (!commit.sha) {
    throw new Error("GitHub did not return a new commit SHA");
  }

  await githubJson<GitHubRef>(settings, `git/refs/heads/${encodeURIComponent(options.branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    branch: options.branch,
    commit_sha: commit.sha,
    commit_url: commit.html_url || `https://github.com/${settings.repo_owner}/${settings.repo_name}/commit/${commit.sha}`,
    files_changed: safeFiles.length,
    created_branch: branchInfo.created,
  };
}

export async function createRepositoryPullRequest(settings: GithubSettings, options: { title: string; head: string; base?: string; body?: string }): Promise<{ number: number | null; url: string | null; state: string | null }> {
  const base = options.base || await getDefaultBranch(settings);
  const pr = await githubJson<GitHubPullRequest>(settings, "pulls", {
    method: "POST",
    body: JSON.stringify({
      title: options.title,
      head: options.head,
      base,
      body: options.body || "Created by Automation System AI Developer API.",
    }),
  });

  return {
    number: typeof pr.number === "number" ? pr.number : null,
    url: pr.html_url || null,
    state: pr.state || null,
  };
}

export async function dispatchRepositoryWorkflow(settings: GithubSettings, workflowFile: string, ref?: string, inputs?: Record<string, string>): Promise<{ workflow: string; ref: string; dispatched: boolean; latest_run_url: string | null }> {
  const targetRef = ref || await getDefaultBranch(settings);
  const encodedWorkflow = encodeURIComponent(workflowFile);
  await githubJson<Record<string, unknown>>(settings, `actions/workflows/${encodedWorkflow}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: targetRef, inputs: inputs || {} }),
  });

  let latestRunUrl: string | null = null;
  try {
    const runs = await githubJson<{ workflow_runs?: GitHubWorkflowRun[] }>(settings, `actions/workflows/${encodedWorkflow}/runs?per_page=1`);
    latestRunUrl = runs.workflow_runs?.[0]?.html_url || null;
  } catch {
    latestRunUrl = null;
  }

  return {
    workflow: workflowFile,
    ref: targetRef,
    dispatched: true,
    latest_run_url: latestRunUrl,
  };
}

export async function logAiChange(env: Env, auth: AuthContext, action: string, target: string, status: string, payload?: unknown, result?: unknown): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO ai_change_requests (user_id, api_key_id, action, target, status, request_payload, result_payload) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      auth.userId,
      auth.apiKeyId || null,
      action,
      target,
      status,
      payload ? JSON.stringify(maskSecretValue(payload)) : null,
      result ? JSON.stringify(maskSecretValue(result)) : null
    ).run();
  } catch {
    // Optional audit table should never break API actions.
  }
}

export function textByteLength(value: string): number {
  return TEXT_ENCODER.encode(value).byteLength;
}
