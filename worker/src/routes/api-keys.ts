import { Env } from "../types";
import { jsonResponse, safeRequestJson } from "../utils";
import { createApiKey, listApiKeys, revokeApiKey, rotateApiKey, runApiKeyMigration } from "../services/auth";
import { AI_DEVELOPER_SCOPES, normalizeScopes } from "../services/ai-developer";

type CreateKeyBody = {
  name: string;
  description?: string | null;
  key_type?: "access" | "runner" | "webhook" | "external";
  permissions?: "read" | "write" | "admin" | "full";
  scopes?: string[];
  expires_in_days?: number;
  allowed_origins?: string[];
  allow_production_deploy?: boolean;
  allow_direct_file_write?: boolean;
};

function defaultScopesForPermissions(permissions: string): string[] {
  if (permissions === "full" || permissions === "admin") {
    return ["admin.full"];
  }
  if (permissions === "write") {
    return [
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
      "logs.read",
    ];
  }
  return ["project.read", "files.read", "automation.read", "settings.read", "git.read", "logs.read"];
}

export async function handleApiKeysRoutes(request: Request, env: Env, path: string, auth: { userId: number; isAdmin: boolean }): Promise<Response> {
  await runApiKeyMigration(env);
  const method = request.method;
  const segments = path.split("/").filter(Boolean);
  const id = segments[2] ? parseInt(segments[2], 10) : null;

  if (path === "/api/keys/scopes" && method === "GET") {
    return jsonResponse({ success: true, data: AI_DEVELOPER_SCOPES });
  }

  if (path === "/api/keys" && method === "GET") {
    try {
      const keys = await listApiKeys(env, auth.userId);
      return jsonResponse({ success: true, data: keys });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to list API keys";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  if (path === "/api/keys" && method === "POST") {
    try {
      const body = await safeRequestJson<CreateKeyBody>(request);

      if (!body) {
        return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
      }

      if (!body.name || body.name.trim() === "") {
        return jsonResponse({ success: false, error: "Name is required" }, 400);
      }

      const requestedKeyType = body.key_type || "access";
      const keyType = requestedKeyType === "external" ? "access" : requestedKeyType;
      const permissions = auth.isAdmin ? (body.permissions || "write") : (body.permissions || "read");
      const expiresInDays = Number.isFinite(body.expires_in_days) ? Number(body.expires_in_days) : undefined;

      if (!auth.isAdmin) {
        if (keyType !== "access") {
          return jsonResponse({ success: false, error: "Only admin can create runner/webhook keys" }, 403);
        }
        if (permissions === "full" || permissions === "admin") {
          return jsonResponse({ success: false, error: "Insufficient permissions to create high-privilege keys" }, 403);
        }
      }

      const normalizedScopes = normalizeScopes(body.scopes && body.scopes.length > 0 ? body.scopes : defaultScopesForPermissions(permissions));
      const newKey = await createApiKey(
        env,
        auth.userId,
        body.name.trim(),
        keyType,
        permissions,
        expiresInDays,
        {
          description: body.description || null,
          scopes: normalizedScopes,
          allowedOrigins: Array.isArray(body.allowed_origins) ? body.allowed_origins : [],
          allowProductionDeploy: Boolean(body.allow_production_deploy),
          allowDirectFileWrite: Boolean(body.allow_direct_file_write),
        }
      );

      return jsonResponse({
        success: true,
        data: newKey,
        message: "API key created successfully. Copy it now; it will not be shown again.",
      }, 201);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to create API key";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  if (id && segments[3] === "rotate" && method === "POST") {
    try {
      const rotated = await rotateApiKey(env, id, auth.userId);
      if (!rotated) {
        return jsonResponse({ success: false, error: "API key not found or already revoked" }, 404);
      }

      return jsonResponse({
        success: true,
        data: rotated,
        message: "API key rotated successfully. Copy the new key now; it will not be shown again.",
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to rotate API key";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  if (id && method === "DELETE") {
    try {
      const revoked = await revokeApiKey(env, id, auth.userId);
      if (!revoked) {
        return jsonResponse({ success: false, error: "API key not found or already revoked" }, 404);
      }

      return jsonResponse({
        success: true,
        message: "API key revoked successfully",
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to revoke API key";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  return jsonResponse({ success: false, error: "API key route not found" }, 404);
}
