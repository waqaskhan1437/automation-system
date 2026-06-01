import { seal } from "tweetsodium";
import { GithubSettings } from "../types";
import { githubHeaders } from "../utils";

// GitHub encrypted_value field has a 64 KB (65536 chars) base64 limit.
// Base64 expands binary by 4/3 (~33%). Sodium seal adds ~48 bytes overhead.
// Max raw bytes ≈ 49104. We use 44000 to leave safe margin.
const GITHUB_SECRET_MAX_RAW_BYTES = 44 * 1024;

export interface RepoSecretSyncResult {
  attempted: boolean;
  success: boolean;
  message: string;
  updated: string[];
  deleted: string[];
  failed: Array<{ name: string; error: string }>;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function getRepoPublicKey(githubSettings: GithubSettings): Promise<{ key: string; key_id: string }> {
  const response = await fetch(
    `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/secrets/public-key`,
    { headers: githubHeaders(githubSettings.pat_token) }
  );

  if (!response.ok) {
    throw new Error(`Could not fetch GitHub Actions public key (${response.status})`);
  }

  return await response.json() as { key: string; key_id: string };
}

async function putRepoSecret(
  githubSettings: GithubSettings,
  secretName: string,
  secretValue: string,
  publicKey: { key: string; key_id: string }
): Promise<void> {
  const encoder = new TextEncoder();
  let rawBytes = encoder.encode(secretValue);
  const originalLen = rawBytes.length;

  if (rawBytes.length > GITHUB_SECRET_MAX_RAW_BYTES) {
    const kept = GITHUB_SECRET_MAX_RAW_BYTES;
    const truncated = secretValue.slice(0, kept);
    rawBytes = encoder.encode(truncated);
    console.warn(`[github-secrets] ${secretName} value was ${originalLen} bytes (limit ${GITHUB_SECRET_MAX_RAW_BYTES}) — truncated to ${rawBytes.length} bytes. Some cookies may be missing.`);
  }

  const encryptedBytes = seal(rawBytes, decodeBase64(publicKey.key));
  const encryptedB64 = encodeBase64(encryptedBytes);

  // Safety check: encrypted base64 must be under 64 KB
  if (encryptedB64.length > 64000) {
    const factor = 64000 / encryptedB64.length;
    const newKept = Math.floor(rawBytes.length * factor * 0.95);
    const truncated = secretValue.slice(0, newKept);
    rawBytes = encoder.encode(truncated);
    console.warn(`[github-secrets] ${secretName} encrypted base64 was ${encryptedB64.length} chars — retrying with ${rawBytes.length} raw bytes.`);
  }

  // Re-encrypt with potentially reduced data
  const finalEncrypted = seal(rawBytes, decodeBase64(publicKey.key));
  const finalB64 = encodeBase64(finalEncrypted);

  async function doPut(): Promise<Response> {
    return fetch(
      `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/secrets/${secretName}`,
      {
        method: "PUT",
        headers: {
          ...githubHeaders(githubSettings.pat_token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          encrypted_value: finalB64,
          key_id: publicKey.key_id,
        }),
      }
    );
  }

  let response = await doPut();

  // Retry once on 5xx (transient server errors)
  if (response.status >= 500) {
    console.warn(`[github-secrets] ${secretName} got ${response.status}, retrying once...`);
    await new Promise((r) => setTimeout(r, 2000));
    response = await doPut();
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body ? ` — ${body.slice(0, 200)}` : "";
    throw new Error(`GitHub secret update failed (${response.status})${detail}`);
  }
}

async function deleteRepoSecret(githubSettings: GithubSettings, secretName: string): Promise<void> {
  async function doDelete(): Promise<Response> {
    return fetch(
      `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/secrets/${secretName}`,
      {
        method: "DELETE",
        headers: githubHeaders(githubSettings.pat_token),
      }
    );
  }

  let response = await doDelete();

  if (response.status === 404) {
    return;
  }

  if (response.status >= 500) {
    console.warn(`[github-secrets] DELETE ${secretName} got ${response.status}, retrying once...`);
    await new Promise((r) => setTimeout(r, 2000));
    response = await doDelete();
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body ? ` — ${body.slice(0, 200)}` : "";
    throw new Error(`GitHub secret delete failed (${response.status})${detail}`);
  }
}

export async function syncVideoSourceSecretsToGithub(
  githubSettings: GithubSettings | null,
  secrets: {
    youtubeCookies: string | null;
    googlePhotosCookies: string | null;
  }
): Promise<RepoSecretSyncResult> {
  if (!githubSettings?.pat_token || !githubSettings.repo_owner || !githubSettings.repo_name) {
    return {
      attempted: false,
      success: true,
      message: "GitHub settings not configured. Cookies were saved locally only.",
      updated: [],
      deleted: [],
      failed: [],
    };
  }

  const syncTargets = [
    { name: "YOUTUBE_COOKIES", value: secrets.youtubeCookies },
    { name: "GOOGLE_PHOTOS_COOKIES", value: secrets.googlePhotosCookies },
  ];

  const result: RepoSecretSyncResult = {
    attempted: true,
    success: true,
    message: "",
    updated: [],
    deleted: [],
    failed: [],
  };

  let publicKey: { key: string; key_id: string } | null = null;

  for (const target of syncTargets) {
    try {
      if (target.value && target.value.trim()) {
        if (!publicKey) {
          publicKey = await getRepoPublicKey(githubSettings);
        }
        await putRepoSecret(githubSettings, target.name, target.value, publicKey);
        result.updated.push(target.name);
      } else {
        await deleteRepoSecret(githubSettings, target.name);
        result.deleted.push(target.name);
      }
    } catch (error) {
      result.success = false;
      result.failed.push({
        name: target.name,
        error: error instanceof Error ? error.message : "Unknown GitHub sync error",
      });
    }
  }

  if (!result.attempted) {
    result.message = "GitHub sync was not attempted.";
  } else if (result.success) {
    result.message = `GitHub Actions secrets synced for ${githubSettings.repo_owner}/${githubSettings.repo_name}.`;
  } else {
    result.message = `Cookies saved, but GitHub secret sync failed for: ${result.failed.map((item) => item.name).join(", ")}.`;
  }

  return result;
}
