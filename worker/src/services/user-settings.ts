import { AISettings, GithubSettings, PostformeSettings, TailscaleSettings, VideoSourceSettings } from "../types";

type SupportedSettings = PostformeSettings | GithubSettings | VideoSourceSettings | AISettings | TailscaleSettings;

const SETTINGS_TABLES = {
  postforme: "settings_postforme",
  github: "settings_github",
  "video-sources": "settings_video_sources",
  ai: "settings_ai",
  tailscale: "settings_tailscale",
} as const;

export type SettingsKey = keyof typeof SETTINGS_TABLES;

export async function getScopedSettings<T extends SupportedSettings>(
  db: D1Database,
  key: SettingsKey,
  userId: number
): Promise<T | null> {
  const table = SETTINGS_TABLES[key];
  const result = await db.prepare(
    `SELECT * FROM ${table} WHERE user_id = ? ORDER BY id DESC LIMIT 1`
  ).bind(userId).first<T>();
  return result || null;
}

export async function upsertScopedSettings(
  db: D1Database,
  table: string,
  userId: number,
  data: Record<string, unknown>
): Promise<void> {
  const existing = await db.prepare(`SELECT id FROM ${table} WHERE user_id = ? LIMIT 1`).bind(userId).first<{ id: number }>();

  const entries = Object.entries(data);
  const columns = entries.map(([column]) => column);
  const values = entries.map(([, value]) => value);

  if (existing?.id) {
    const updates = columns.map((column) => `${column} = ?`).join(", ");
    try {
      await db.prepare(
        `UPDATE ${table} SET ${updates}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(...values, existing.id).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("no such column: updated_at")) {
        throw error;
      }

      await db.prepare(
        `UPDATE ${table} SET ${updates} WHERE id = ?`
      ).bind(...values, existing.id).run();
    }
    return;
  }

  const insertColumns = ["user_id", ...columns].join(", ");
  const placeholders = ["?", ...columns.map(() => "?")].join(", ");
  await db.prepare(
    `INSERT INTO ${table} (${insertColumns}) VALUES (${placeholders})`
  ).bind(userId, ...values).run();
}
