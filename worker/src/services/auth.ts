import { AuthContext, Env, User } from "../types";
import { jsonResponse } from "../utils";

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return hex(digest);
}

export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const accessToken = request.headers.get("X-Access-Token");
  if (accessToken?.trim()) {
    return accessToken.trim();
  }

  return null;
}

export function isAdminRequest(request: Request, env: Env): boolean {
  const adminKey = request.headers.get("X-Admin-Key");
  const expectedKey = env.ADMIN_KEY;
  if (!expectedKey) return false;
  return Boolean(adminKey && adminKey === expectedKey);
}

export function getAdminEmail(env: Env): string {
  return env.ADMIN_EMAIL || "";
}

export function getAdminPassword(env: Env): string {
  return env.ADMIN_PASSWORD || env.ADMIN_KEY || "";
}

export async function getAuthContext(request: Request, env: Env): Promise<AuthContext | null> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const hashed = await hashToken(token);

  // First check if it's an API key (supports multiple key types)
  const apiKeyResult = await env.DB.prepare(
    `SELECT ak.*, u.* 
     FROM api_keys ak 
     INNER JOIN users u ON ak.user_id = u.id 
     WHERE ak.key_hash = ? 
       AND ak.revoked_at IS NULL 
       AND (ak.expires_at IS NULL OR ak.expires_at > datetime('now'))
       AND u.status = 'active' 
      LIMIT 1`
  ).bind(hashed).first() as any;

  if (apiKeyResult) {
    const user: User = {
      id: apiKeyResult.user_id as number,
      name: apiKeyResult.name as string,
      email: apiKeyResult.email as string,
      role: apiKeyResult.role as "admin" | "user" | undefined,
      status: apiKeyResult.status as "active" | "revoked" | "suspended",
      access_token_hash: null,
      runner_token_hash: null,
      created_by_admin: apiKeyResult.created_by_admin as number,
      last_login_at: apiKeyResult.last_login_at as string | null,
      revoked_at: apiKeyResult.revoked_at as string | null,
      runner_hostname: apiKeyResult.runner_hostname as string | null,
      runner_status: apiKeyResult.runner_status as string | null,
      runner_started_at: apiKeyResult.runner_started_at as string | null,
      runner_last_seen_at: apiKeyResult.runner_last_seen_at as string | null,
      runner_platform: apiKeyResult.runner_platform as string | null,
      runner_version: apiKeyResult.runner_version as string | null,
      tailscale_status: apiKeyResult.tailscale_status as string | null,
      tailscale_ip: apiKeyResult.tailscale_ip as string | null,
      tailscale_dns_name: apiKeyResult.tailscale_dns_name as string | null,
      ssh_status: apiKeyResult.ssh_status as string | null,
      ssh_target: apiKeyResult.ssh_target as string | null,
      created_at: apiKeyResult.created_at as string,
      updated_at: apiKeyResult.updated_at as string
    };

    return {
      userId: user.id,
      user,
      isAdmin: user.role === "admin" || isAdminRequest(request, env),
      token,
      apiKeyId: apiKeyResult.id as number,
      apiKeyType: apiKeyResult.key_type as "access" | "runner" | "webhook" | "external" | undefined,
      apiKeyPermissions: apiKeyResult.permissions as string | undefined
    };
  }

  // Fallback to direct access token (legacy support)
  const user = await env.DB.prepare(
    "SELECT * FROM users WHERE access_token_hash = ? AND status = 'active' LIMIT 1"
  ).bind(hashed).first<User>();

  if (!user) {
    return null;
  }

  await env.DB.prepare(
    "UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(user.id).run();

  return {
    userId: user.id,
    user,
    isAdmin: user.role === "admin" || isAdminRequest(request, env),
    token,
  };
}

export async function requireAuth(request: Request, env: Env): Promise<AuthContext | Response> {
  const context = await getAuthContext(request, env);
  if (!context) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }
  return context;
}

export function requirePermission(auth: AuthContext, requiredPermission: string): Response | null {
  const permissions = auth.apiKeyPermissions || (auth.isAdmin ? 'full' : 'read');
  
  if (permissions === 'full' || permissions === 'admin') {
    return null;
  }
  
  if (requiredPermission === 'read') {
    return null;
  }
  
  if (requiredPermission === 'write' && (permissions === 'write' || permissions === 'admin')) {
    return null;
  }
  
  return jsonResponse({ success: false, error: "Insufficient permissions" }, 403);
}

export function requireAdmin(request: Request, env: Env, auth?: AuthContext | null): Response | null {
  if (!(auth?.isAdmin || isAdminRequest(request, env))) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }
  return null;
}

export async function findUserByRunnerToken(env: Env, token: string): Promise<User | null> {
  const hashed = await hashToken(token);
  return env.DB.prepare(
    "SELECT * FROM users WHERE runner_token_hash = ? AND status = 'active' LIMIT 1"
  ).bind(hashed).first<User>();
}

export async function findUserByAccessToken(env: Env, token: string): Promise<User | null> {
  const hashed = await hashToken(token);
  return env.DB.prepare(
    "SELECT * FROM users WHERE access_token_hash = ? AND status = 'active' LIMIT 1"
  ).bind(hashed).first<User>();
}

export function createOpaqueToken(prefix: string): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(18));
  const random = Array.from(randomBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}_${random}`;
}

export async function issueAdminAccessToken(env: Env): Promise<{ user: User; accessToken: string }> {
  const email = getAdminEmail(env);
  const accessToken = createOpaqueToken("atk");
  const accessTokenHash = await hashToken(accessToken);

  const existing = await env.DB.prepare(
    "SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
  ).first<User>();

  if (existing?.id) {
    await env.DB.prepare(
      "UPDATE users SET name = ?, email = ?, role = 'admin', access_token_hash = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind("Administrator", email, accessTokenHash, existing.id).run();

    const user = await env.DB.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(existing.id).first<User>();
    return { user: user as User, accessToken };
  }

  const result = await env.DB.prepare(
    "INSERT INTO users (name, email, role, access_token_hash, status) VALUES (?, ?, 'admin', ?, 'active')"
  ).bind("Administrator", email, accessTokenHash).run();

  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(Number(result.meta.last_row_id)).first<User>();
  return { user: user as User, accessToken };
}

export async function createApiKey(env: Env, userId: number, name: string, keyType: 'access' | 'runner' | 'webhook' | 'external', permissions: string = 'read', expiresInDays?: number): Promise<{ id: number; key: string; name: string; key_type: string; permissions: string; expires_at: string | null }> {
  const keyPrefix = keyType === 'runner' ? 'rnr' : keyType === 'webhook' ? 'whk' : keyType === 'external' ? 'ext' : 'atk';
  const key = createOpaqueToken(keyPrefix);
  const keyHash = await hashToken(key);

  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;

  const result = await env.DB.prepare(
    "INSERT INTO api_keys (user_id, name, key_prefix, key_hash, key_type, permissions, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(userId, name, keyPrefix, keyHash, keyType, permissions, expiresAt).run();

  return {
    id: Number(result.meta.last_row_id),
    key,
    name,
    key_type: keyType,
    permissions,
    expires_at: expiresAt
  };
}

export async function revokeApiKey(env: Env, keyId: number, userId: number): Promise<boolean> {
  const result = await env.DB.prepare(
    "UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
  ).bind(keyId, userId).run();

  return result.meta.changes > 0;
}

export async function rotateApiKey(env: Env, keyId: number, userId: number): Promise<{ key: string; name: string; key_type: string; permissions: string; expires_at: string | null } | null> {
  const existing = await env.DB.prepare(
    "SELECT name, key_type, permissions, expires_at FROM api_keys WHERE id = ? AND user_id = ? AND revoked_at IS NULL LIMIT 1"
  ).bind(keyId, userId).first<{ name: string; key_type: string; permissions: string; expires_at: string | null }>();

  if (!existing) {
    return null;
  }

  const newKey = createOpaqueToken(existing.key_type === 'runner' ? 'rnr' : existing.key_type === 'webhook' ? 'whk' : existing.key_type === 'external' ? 'ext' : 'atk');
  const newKeyHash = await hashToken(newKey);

  await env.DB.prepare(
    "UPDATE api_keys SET key_hash = ?, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
  ).bind(newKeyHash, keyId, userId).run();

  const result = await env.DB.prepare(
    "INSERT INTO api_keys (user_id, name, key_prefix, key_hash, key_type, permissions, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(userId, existing.name, existing.key_type === 'runner' ? 'rnr' : existing.key_type === 'webhook' ? 'whk' : existing.key_type === 'external' ? 'ext' : 'atk', await hashToken(newKey), existing.key_type, existing.permissions, existing.expires_at).run();

  return {
    key: newKey,
    name: existing.name,
    key_type: existing.key_type,
    permissions: existing.permissions,
    expires_at: existing.expires_at
  };
}

export async function listApiKeys(env: Env, userId: number): Promise<Array<{ id: number; name: string; key_type: string; permissions: string; last_used_at: string | null; expires_at: string | null; created_at: string; revoked_at: string | null }>> {
  const result = await env.DB.prepare(
    "SELECT id, name, key_type, permissions, last_used_at, expires_at, created_at, revoked_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC"
  ).bind(userId).all() as any;

  return result.results || [];
}

export async function verifyApiKey(env: Env, token: string): Promise<{ user: User; apiKey: any; isAdmin: boolean } | null> {
  const hashed = await hashToken(token);

  const apiKey = await env.DB.prepare(
    "SELECT ak.*, u.* FROM api_keys ak INNER JOIN users u ON ak.user_id = u.id WHERE ak.key_hash = ? AND ak.revoked_at IS NULL AND u.status = 'active' LIMIT 1"
  ).bind(hashed).first() as any;

  if (!apiKey) {
    return null;
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at as any) < new Date()) {
    return null;
  }

  await env.DB.prepare(
    "UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(apiKey.id).run();

  const user: User = {
    id: apiKey.user_id as number,
    name: apiKey.name as string,
    email: apiKey.email as string,
    role: apiKey.role as "admin" | "user" | undefined,
    status: apiKey.status as "active" | "revoked" | "suspended",
    access_token_hash: null,
    runner_token_hash: null,
    created_by_admin: apiKey.created_by_admin as number,
    last_login_at: apiKey.last_login_at as string | null,
    revoked_at: apiKey.revoked_at as string | null,
    runner_hostname: apiKey.runner_hostname as string | null,
    runner_status: apiKey.runner_status as string | null,
    runner_started_at: apiKey.runner_started_at as string | null,
    runner_last_seen_at: apiKey.runner_last_seen_at as string | null,
    runner_platform: apiKey.runner_platform as string | null,
    runner_version: apiKey.runner_version as string | null,
    tailscale_status: apiKey.tailscale_status as string | null,
    tailscale_ip: apiKey.tailscale_ip as string | null,
    tailscale_dns_name: apiKey.tailscale_dns_name as string | null,
    ssh_status: apiKey.ssh_status as string | null,
    ssh_target: apiKey.ssh_target as string | null,
    created_at: apiKey.created_at as string,
    updated_at: apiKey.updated_at as string
  };

  return {
    user,
    apiKey,
    isAdmin: apiKey.role === 'admin'
  };
}

export async function logApiRequest(env: Env, userId: number | null | undefined, apiKeyId: number | null | undefined, endpoint: string, method: string, statusCode: number, ip?: string, userAgent?: string, requestSize?: number, responseSize?: number, durationMs?: number, errorMessage?: string | null): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO api_audit_logs (user_id, api_key_id, endpoint, method, status_code, ip_address, user_agent, request_size, response_size, duration_ms, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(userId, apiKeyId, endpoint, method, statusCode, ip, userAgent, requestSize, responseSize, durationMs, errorMessage).run();
  } catch {
    // Silently fail audit logging to not break requests
  }
}

export async function runApiKeyMigration(env: Env): Promise<{ applied: string[]; skipped: string[] }> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_type TEXT NOT NULL CHECK(key_type IN ('access','runner','webhook','external')),
      permissions TEXT DEFAULT 'read' CHECK(permissions IN ('read','write','admin','full')),
      last_used_at DATETIME,
      expires_at DATETIME,
      revoked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    "CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)",
    "CREATE INDEX IF NOT EXISTS idx_api_keys_revoked ON api_keys(revoked_at)",
    `CREATE TABLE IF NOT EXISTS api_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      api_key_id INTEGER,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      request_size INTEGER,
      response_size INTEGER,
      duration_ms INTEGER,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_api_audit_logs_user_id ON api_audit_logs(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_api_audit_logs_api_key_id ON api_audit_logs(api_key_id)",
    "CREATE INDEX IF NOT EXISTS idx_api_audit_logs_created_at ON api_audit_logs(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_api_audit_logs_endpoint ON api_audit_logs(endpoint)"
  ];

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const statement of statements) {
    try {
      await env.DB.prepare(statement).run();
      applied.push(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("duplicate column name") || message.includes("already exists")) {
        skipped.push(statement);
        continue;
      }
      throw error;
    }
  }

  return { applied, skipped };
}
