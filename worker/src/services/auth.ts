import { AuthContext, Env, User } from "../types";
import { jsonResponse } from "../utils";
import { normalizeScopes } from "./ai-developer";

type ApiKeyType = "access" | "runner" | "webhook" | "external";
type ApiKeyPermissions = "read" | "write" | "admin" | "full";

type ApiKeyAuthRow = {
  api_key_id: number;
  api_key_name: string;
  api_key_type: ApiKeyType;
  api_key_permissions: ApiKeyPermissions;
  api_key_scopes?: string | null;
  api_key_allow_production_deploy?: number | boolean | null;
  api_key_allow_direct_file_write?: number | boolean | null;
  user_id: number;
  user_name: string;
  user_email: string | null;
  user_role?: "admin" | "user" | null;
  user_status: "active" | "revoked" | "suspended";
  created_by_admin: number;
  user_last_login_at: string | null;
  user_revoked_at: string | null;
  runner_hostname?: string | null;
  runner_status?: string | null;
  runner_started_at?: string | null;
  runner_last_seen_at?: string | null;
  runner_platform?: string | null;
  runner_version?: string | null;
  tailscale_status?: string | null;
  tailscale_ip?: string | null;
  tailscale_dns_name?: string | null;
  ssh_status?: string | null;
  ssh_target?: string | null;
  user_created_at?: string;
  user_updated_at?: string;
};

type CreateApiKeyOptions = {
  scopes?: string[];
  description?: string | null;
  allowedOrigins?: string[];
  allowProductionDeploy?: boolean;
  allowDirectFileWrite?: boolean;
  expiresAt?: string | null;
};

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

  // Browser-based AI tools and simple web fetchers often cannot send custom
  // Authorization headers. For safe monitoring/debug access, allow API keys in
  // the URL only for GET /api/ai/* endpoints. Mutating endpoints still require
  // Authorization or X-Access-Token headers.
  if (request.method === "GET") {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/ai")) {
        const queryToken = url.searchParams.get("ai_token") ||
          url.searchParams.get("access_token") ||
          url.searchParams.get("token");
        if (queryToken?.trim()) {
          return queryToken.trim();
        }
      }
    } catch {
      // Ignore malformed URLs and fall through to unauthenticated.
    }
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

function buildUserFromApiKeyRow(row: ApiKeyAuthRow): User {
  return {
    id: row.user_id,
    name: row.user_name,
    email: row.user_email,
    role: row.user_role || "user",
    status: row.user_status,
    access_token_hash: null,
    runner_token_hash: null,
    created_by_admin: row.created_by_admin,
    last_login_at: row.user_last_login_at,
    revoked_at: row.user_revoked_at,
    runner_hostname: row.runner_hostname || null,
    runner_status: row.runner_status || null,
    runner_started_at: row.runner_started_at || null,
    runner_last_seen_at: row.runner_last_seen_at || null,
    runner_platform: row.runner_platform || null,
    runner_version: row.runner_version || null,
    tailscale_status: row.tailscale_status || null,
    tailscale_ip: row.tailscale_ip || null,
    tailscale_dns_name: row.tailscale_dns_name || null,
    ssh_status: row.ssh_status || null,
    ssh_target: row.ssh_target || null,
    created_at: row.user_created_at,
    updated_at: row.user_updated_at,
  };
}

function dbBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function isRecoverableApiKeySchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table: api_keys|no such column: ak\./i.test(message);
}

const API_KEY_AUTH_SELECT = `
  SELECT
    ak.id AS api_key_id,
    ak.name AS api_key_name,
    ak.key_type AS api_key_type,
    ak.permissions AS api_key_permissions,
    ak.scopes AS api_key_scopes,
    ak.allow_production_deploy AS api_key_allow_production_deploy,
    ak.allow_direct_file_write AS api_key_allow_direct_file_write,
    u.id AS user_id,
    u.name AS user_name,
    u.email AS user_email,
    u.role AS user_role,
    u.status AS user_status,
    u.created_by_admin AS created_by_admin,
    u.last_login_at AS user_last_login_at,
    u.revoked_at AS user_revoked_at,
    u.runner_hostname AS runner_hostname,
    u.runner_status AS runner_status,
    u.runner_started_at AS runner_started_at,
    u.runner_last_seen_at AS runner_last_seen_at,
    u.runner_platform AS runner_platform,
    u.runner_version AS runner_version,
    u.tailscale_status AS tailscale_status,
    u.tailscale_ip AS tailscale_ip,
    u.tailscale_dns_name AS tailscale_dns_name,
    u.ssh_status AS ssh_status,
    u.ssh_target AS ssh_target,
    u.created_at AS user_created_at,
    u.updated_at AS user_updated_at
  FROM api_keys ak
  INNER JOIN users u ON ak.user_id = u.id
`;

export async function getAuthContext(request: Request, env: Env): Promise<AuthContext | null> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const hashed = await hashToken(token);

  let apiKeyResult: ApiKeyAuthRow | null = null;
  try {
    apiKeyResult = await env.DB.prepare(
      `${API_KEY_AUTH_SELECT}
       WHERE ak.key_hash = ?
         AND ak.revoked_at IS NULL
         AND (ak.expires_at IS NULL OR ak.expires_at > datetime('now'))
         AND u.status = 'active'
       LIMIT 1`
    ).bind(hashed).first<ApiKeyAuthRow>();
  } catch (error) {
    if (!isRecoverableApiKeySchemaError(error)) {
      throw error;
    }
    await runApiKeyMigration(env).catch(() => undefined);
    try {
      apiKeyResult = await env.DB.prepare(
        `${API_KEY_AUTH_SELECT}
         WHERE ak.key_hash = ?
           AND ak.revoked_at IS NULL
           AND (ak.expires_at IS NULL OR ak.expires_at > datetime('now'))
           AND u.status = 'active'
         LIMIT 1`
      ).bind(hashed).first<ApiKeyAuthRow>();
    } catch (retryError) {
      if (!isRecoverableApiKeySchemaError(retryError)) {
        throw retryError;
      }
      apiKeyResult = null;
    }
  }

  if (apiKeyResult) {
    await env.DB.prepare(
      "UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(apiKeyResult.api_key_id).run().catch(() => undefined);

    const user = buildUserFromApiKeyRow(apiKeyResult);
    const keyIsAdmin = apiKeyResult.api_key_permissions === "admin" || apiKeyResult.api_key_permissions === "full";

    return {
      userId: user.id,
      user,
      isAdmin: user.role === "admin" || keyIsAdmin || isAdminRequest(request, env),
      token,
      apiKeyId: apiKeyResult.api_key_id,
      apiKeyName: apiKeyResult.api_key_name,
      apiKeyType: apiKeyResult.api_key_type,
      apiKeyPermissions: apiKeyResult.api_key_permissions,
      apiKeyScopes: normalizeScopes(apiKeyResult.api_key_scopes || "[]"),
      apiKeyScopesRaw: apiKeyResult.api_key_scopes || null,
      apiKeyAllowProductionDeploy: dbBoolean(apiKeyResult.api_key_allow_production_deploy),
      apiKeyAllowDirectFileWrite: dbBoolean(apiKeyResult.api_key_allow_direct_file_write),
    };
  }

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
  const permissions = auth.apiKeyPermissions || (auth.isAdmin ? "full" : "read");

  if (permissions === "full" || permissions === "admin") {
    return null;
  }

  if (requiredPermission === "read") {
    return null;
  }

  if (requiredPermission === "write" && permissions === "write") {
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
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
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

function getKeyPrefix(keyType: ApiKeyType): string {
  if (keyType === "runner") return "rnr";
  if (keyType === "webhook") return "whk";
  if (keyType === "external") return "aik";
  return "atk";
}

export async function createApiKey(
  env: Env,
  userId: number,
  name: string,
  keyType: ApiKeyType,
  permissions: ApiKeyPermissions = "read",
  expiresInDays?: number,
  options: CreateApiKeyOptions = {}
): Promise<{ id: number; key: string; name: string; key_type: string; permissions: string; scopes: string[]; expires_at: string | null }> {
  const keyPrefix = getKeyPrefix(keyType);
  const key = createOpaqueToken(keyPrefix);
  const keyHash = await hashToken(key);
  const scopes = normalizeScopes(options.scopes || []);
  const expiresAt = options.expiresAt !== undefined
    ? options.expiresAt
    : (expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null);

  const result = await env.DB.prepare(
    `INSERT INTO api_keys (
      user_id,
      name,
      key_prefix,
      key_hash,
      key_type,
      permissions,
      description,
      scopes,
      allowed_origins,
      allow_production_deploy,
      allow_direct_file_write,
      expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    userId,
    name,
    keyPrefix,
    keyHash,
    keyType,
    permissions,
    options.description || null,
    JSON.stringify(scopes),
    JSON.stringify(options.allowedOrigins || []),
    options.allowProductionDeploy ? 1 : 0,
    options.allowDirectFileWrite ? 1 : 0,
    expiresAt
  ).run();

  return {
    id: Number(result.meta.last_row_id),
    key,
    name,
    key_type: keyType,
    permissions,
    scopes,
    expires_at: expiresAt,
  };
}

export async function revokeApiKey(env: Env, keyId: number, userId: number): Promise<boolean> {
  const result = await env.DB.prepare(
    "UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
  ).bind(keyId, userId).run();

  return result.meta.changes > 0;
}

export async function rotateApiKey(env: Env, keyId: number, userId: number): Promise<{ id: number; key: string; name: string; key_type: string; permissions: string; scopes: string[]; expires_at: string | null } | null> {
  const existing = await env.DB.prepare(
    "SELECT name, key_type, permissions, expires_at, description, scopes, allowed_origins, allow_production_deploy, allow_direct_file_write FROM api_keys WHERE id = ? AND user_id = ? AND revoked_at IS NULL LIMIT 1"
  ).bind(keyId, userId).first<{
    name: string;
    key_type: ApiKeyType;
    permissions: ApiKeyPermissions;
    expires_at: string | null;
    description?: string | null;
    scopes?: string | null;
    allowed_origins?: string | null;
    allow_production_deploy?: number | boolean | null;
    allow_direct_file_write?: number | boolean | null;
  }>();

  if (!existing) {
    return null;
  }

  await env.DB.prepare(
    "UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
  ).bind(keyId, userId).run();

  let allowedOrigins: string[] = [];
  try {
    const parsed = existing.allowed_origins ? JSON.parse(existing.allowed_origins) as unknown : [];
    allowedOrigins = Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    allowedOrigins = [];
  }

  return createApiKey(env, userId, existing.name, existing.key_type, existing.permissions, undefined, {
    description: existing.description || null,
    scopes: normalizeScopes(existing.scopes || "[]"),
    allowedOrigins,
    allowProductionDeploy: dbBoolean(existing.allow_production_deploy),
    allowDirectFileWrite: dbBoolean(existing.allow_direct_file_write),
    expiresAt: existing.expires_at,
  });
}

export async function listApiKeys(env: Env, userId: number): Promise<Array<{
  id: number;
  name: string;
  key_type: string;
  permissions: string;
  description: string | null;
  scopes: string[];
  allowed_origins: string[];
  allow_production_deploy: boolean;
  allow_direct_file_write: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}>> {
  const result = await env.DB.prepare(
    `SELECT id, name, key_type, permissions, description, scopes, allowed_origins, allow_production_deploy, allow_direct_file_write, last_used_at, expires_at, created_at, revoked_at
     FROM api_keys
     WHERE user_id = ?
     ORDER BY created_at DESC`
  ).bind(userId).all<any>();

  return (result.results || []).map((row: any) => {
    let allowedOrigins: string[] = [];
    try {
      const parsed = row.allowed_origins ? JSON.parse(String(row.allowed_origins)) as unknown : [];
      allowedOrigins = Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    } catch {
      allowedOrigins = [];
    }

    return {
      id: Number(row.id),
      name: String(row.name || ""),
      key_type: String(row.key_type || "access"),
      permissions: String(row.permissions || "read"),
      description: row.description || null,
      scopes: normalizeScopes(row.scopes || "[]"),
      allowed_origins: allowedOrigins,
      allow_production_deploy: dbBoolean(row.allow_production_deploy),
      allow_direct_file_write: dbBoolean(row.allow_direct_file_write),
      last_used_at: row.last_used_at || null,
      expires_at: row.expires_at || null,
      created_at: row.created_at,
      revoked_at: row.revoked_at || null,
    };
  });
}

export async function verifyApiKey(env: Env, token: string): Promise<{ user: User; apiKey: any; isAdmin: boolean } | null> {
  const hashed = await hashToken(token);

  let row: ApiKeyAuthRow | null = null;
  try {
    row = await env.DB.prepare(
      `${API_KEY_AUTH_SELECT}
       WHERE ak.key_hash = ?
         AND ak.revoked_at IS NULL
         AND (ak.expires_at IS NULL OR ak.expires_at > datetime('now'))
         AND u.status = 'active'
       LIMIT 1`
    ).bind(hashed).first<ApiKeyAuthRow>();
  } catch (error) {
    if (!isRecoverableApiKeySchemaError(error)) {
      throw error;
    }
    await runApiKeyMigration(env).catch(() => undefined);
    try {
      row = await env.DB.prepare(
        `${API_KEY_AUTH_SELECT}
         WHERE ak.key_hash = ?
           AND ak.revoked_at IS NULL
           AND (ak.expires_at IS NULL OR ak.expires_at > datetime('now'))
           AND u.status = 'active'
         LIMIT 1`
      ).bind(hashed).first<ApiKeyAuthRow>();
    } catch (retryError) {
      if (!isRecoverableApiKeySchemaError(retryError)) {
        throw retryError;
      }
      row = null;
    }
  }

  if (!row) {
    return null;
  }

  await env.DB.prepare(
    "UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(row.api_key_id).run().catch(() => undefined);

  const user = buildUserFromApiKeyRow(row);
  return {
    user,
    apiKey: {
      id: row.api_key_id,
      name: row.api_key_name,
      type: row.api_key_type,
      permissions: row.api_key_permissions,
      scopes: normalizeScopes(row.api_key_scopes || "[]"),
    },
    isAdmin: user.role === "admin" || row.api_key_permissions === "admin" || row.api_key_permissions === "full",
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
      description TEXT,
      scopes TEXT DEFAULT '[]',
      allowed_origins TEXT DEFAULT '[]',
      allow_production_deploy INTEGER DEFAULT 0,
      allow_direct_file_write INTEGER DEFAULT 0,
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
    "CREATE INDEX IF NOT EXISTS idx_api_audit_logs_endpoint ON api_audit_logs(endpoint)",
    `CREATE TABLE IF NOT EXISTS ai_change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      api_key_id INTEGER,
      action TEXT NOT NULL,
      target TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      request_payload TEXT,
      result_payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_ai_change_requests_user ON ai_change_requests(user_id, created_at)",
    "ALTER TABLE api_keys ADD COLUMN description TEXT",
    "ALTER TABLE api_keys ADD COLUMN scopes TEXT DEFAULT '[]'",
    "ALTER TABLE api_keys ADD COLUMN allowed_origins TEXT DEFAULT '[]'",
    "ALTER TABLE api_keys ADD COLUMN allow_production_deploy INTEGER DEFAULT 0",
    "ALTER TABLE api_keys ADD COLUMN allow_direct_file_write INTEGER DEFAULT 0",
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
