import { seal } from "tweetsodium";
import { GithubSettings } from "../types";
import { githubHeaders } from "../utils";

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
  const encryptedBytes = seal(
    new TextEncoder().encode(secretValue),
    decodeBase64(publicKey.key)
  );

  const response = await fetch(
    `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/secrets/${secretName}`,
    {
      method: "PUT",
      headers: {
        ...githubHeaders(githubSettings.pat_token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        encrypted_value: encodeBase64(encryptedBytes),
        key_id: publicKey.key_id,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub secret update failed (${response.status})`);
  }
}

async function deleteRepoSecret(githubSettings: GithubSettings, secretName: string): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/secrets/${secretName}`,
    {
      method: "DELETE",
      headers: githubHeaders(githubSettings.pat_token),
    }
  );

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    throw new Error(`GitHub secret delete failed (${response.status})`);
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
