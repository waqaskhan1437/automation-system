import { Env } from "../types";
import { jsonResponse, safeRequestJson } from "../utils";
import { createApiKey, listApiKeys, revokeApiKey, rotateApiKey } from "../services/auth";

export async function handleApiKeysRoutes(request: Request, env: Env, path: string, auth: { userId: number; isAdmin: boolean }): Promise<Response> {
  const method = request.method;
  const segments = path.split("/").filter(Boolean);
  const id = segments[2] ? parseInt(segments[2], 10) : null;

  // GET /api/keys - List user's API keys
  if (path === "/api/keys" && method === "GET") {
    try {
      const keys = await listApiKeys(env, auth.userId);
      return jsonResponse({ success: true, data: keys });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to list API keys";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  // POST /api/keys - Create new API key
  if (path === "/api/keys" && method === "POST") {
    try {
      const body = await safeRequestJson<{
        name: string;
        key_type?: 'access' | 'runner' | 'webhook' | 'external';
        permissions?: 'read' | 'write' | 'admin' | 'full';
        expires_in_days?: number;
      }>(request);

      if (!body) {
        return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
      }

      if (!body.name || body.name.trim() === "") {
        return jsonResponse({ success: false, error: "Name is required" }, 400);
      }

      const keyType = body.key_type || 'access';
      const permissions = auth.isAdmin ? (body.permissions || 'full') : (body.permissions || 'read');

      // Non-admins can only create 'access' type keys with limited permissions
      if (!auth.isAdmin) {
        if (keyType !== 'access') {
          return jsonResponse({ success: false, error: "Only admin can create runner/webhook/external keys" }, 403);
        }
        if (permissions === 'full' || permissions === 'admin') {
          return jsonResponse({ success: false, error: "Insufficient permissions to create high-privilege keys" }, 403);
        }
      }

      const newKey = await createApiKey(
        env,
        auth.userId,
        body.name.trim(),
        keyType,
        permissions,
        body.expires_in_days
      );

      return jsonResponse({
        success: true,
        data: newKey,
        message: "API key created successfully"
      }, 201);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to create API key";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  // Rotate /api/keys/:id/rotate - Rotate existing API key
  if (id && segments[3] === "rotate" && method === "POST") {
    try {
      const rotated = await rotateApiKey(env, id, auth.userId);
      if (!rotated) {
        return jsonResponse({ success: false, error: "API key not found or already revoked" }, 404);
      }

      return jsonResponse({
        success: true,
        data: rotated,
        message: "API key rotated successfully"
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to rotate API key";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  // Delete /api/keys/:id - Revoke API key
  if (id && method === "DELETE") {
    try {
      const revoked = await revokeApiKey(env, id, auth.userId);
      if (!revoked) {
        return jsonResponse({ success: false, error: "API key not found or already revoked" }, 404);
      }

      return jsonResponse({
        success: true,
        message: "API key revoked successfully"
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to revoke API key";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  return jsonResponse({ success: false, error: "API key route not found" }, 404);
}
