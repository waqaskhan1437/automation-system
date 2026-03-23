import { Env, PostformeSettings, GithubSettings, VideoSourceSettings, AISettings } from "../types";
import { jsonResponse } from "../utils";
import {
  buildAiCatalog,
  generateAiJson,
  getConfiguredProviderIds,
  getSocialMessages,
  getTaglinesMessages,
  normalizeSocialResult,
  normalizeTaglinesResult,
  resolveModelForProvider,
  type SupportedAIProvider,
} from "../services/ai";

export async function handleSettingsRoutes(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const method = request.method;

  // POSTFORME SETTINGS
  if (path === "/api/settings/postforme") {
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM settings_postforme LIMIT 1").first<PostformeSettings>();
      return jsonResponse({ success: true, data: result || null });
    }

    if (method === "POST") {
      const body = await request.json() as Partial<PostformeSettings>;
      if (!body.api_key) {
        return jsonResponse({ success: false, error: "api_key is required" }, 400);
      }

      const existing = await env.DB.prepare("SELECT id FROM settings_postforme LIMIT 1").first();
      if (existing) {
        await env.DB.prepare(
          "UPDATE settings_postforme SET api_key = ?, platforms = ?, default_schedule = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(body.api_key, body.platforms || "[]", body.default_schedule || null, existing.id).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO settings_postforme (api_key, platforms, default_schedule) VALUES (?, ?, ?)"
        ).bind(body.api_key, body.platforms || "[]", body.default_schedule || null).run();
      }
      return jsonResponse({ success: true, message: "Postforme settings saved" });
    }
  }

  // POSTFORME TEST
  if (path === "/api/settings/postforme/test" && method === "POST") {
    const body = await request.json() as { api_key: string };
    if (!body.api_key) {
      return jsonResponse({ success: false, error: "api_key required" }, 400);
    }
    try {
      const res = await fetch("https://api.postforme.dev/v1/social-accounts", {
        headers: { Authorization: `Bearer ${body.api_key}` },
      });
      if (res.ok) {
        return jsonResponse({ success: true, message: "Postforme API connected successfully!" });
      }
      const errText = await res.text();
      return jsonResponse({ success: false, message: `Error ${res.status}: ${errText || "Invalid API key"}` });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Connection failed";
      return jsonResponse({ success: false, error: errorMsg });
    }
  }

  // POSTFORME SYNC ACCOUNTS
  if (path === "/api/settings/postforme/sync" && method === "POST") {
    const body = await request.json() as { api_key: string };
    if (!body.api_key) {
      return jsonResponse({ success: false, error: "api_key required" }, 400);
    }
    try {
      const res = await fetch("https://api.postforme.dev/v1/social-accounts", {
        headers: { Authorization: `Bearer ${body.api_key}` },
      });
      if (res.ok) {
        const data = await res.json() as { data?: Array<{ platform: string; username: string; id: string }> };
        const accounts = (data.data || []).map((a) => ({
          platform: a.platform,
          username: a.username,
          connected: true,
          id: a.id,
        }));
        return jsonResponse({ success: true, data: accounts });
      }
      return jsonResponse({ success: false, error: `Postforme error: ${res.status}` });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Sync failed";
      return jsonResponse({ success: false, error: errorMsg });
    }
  }

  // GITHUB SETTINGS
  if (path === "/api/settings/github") {
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM settings_github LIMIT 1").first<GithubSettings>();
      return jsonResponse({ success: true, data: result || null });
    }

    if (method === "POST") {
      const body = await request.json() as Partial<GithubSettings>;
      if (!body.pat_token || !body.repo_owner || !body.repo_name) {
        return jsonResponse({ success: false, error: "pat_token, repo_owner, and repo_name are required" }, 400);
      }

      const existing = await env.DB.prepare("SELECT id FROM settings_github LIMIT 1").first();
      if (existing) {
        await env.DB.prepare(
          "UPDATE settings_github SET pat_token = ?, repo_owner = ?, repo_name = ?, runner_labels = ?, workflow_dispatch_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(body.pat_token, body.repo_owner, body.repo_name, body.runner_labels || "self-hosted", body.workflow_dispatch_url || null, existing.id).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO settings_github (pat_token, repo_owner, repo_name, runner_labels, workflow_dispatch_url) VALUES (?, ?, ?, ?, ?)"
        ).bind(body.pat_token, body.repo_owner, body.repo_name, body.runner_labels || "self-hosted", body.workflow_dispatch_url || null).run();
      }
      return jsonResponse({ success: true, message: "GitHub settings saved" });
    }
  }

  // VIDEO SOURCE SETTINGS
  if (path === "/api/settings/video-sources") {
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM settings_video_sources LIMIT 1").first<VideoSourceSettings>();
      return jsonResponse({ success: true, data: result || null });
    }

    if (method === "POST") {
      const body = await request.json() as Partial<VideoSourceSettings>;

      const existing = await env.DB.prepare("SELECT id FROM settings_video_sources LIMIT 1").first();
      if (existing) {
        await env.DB.prepare(
          "UPDATE settings_video_sources SET bunny_api_key = ?, bunny_library_id = ?, youtube_cookies = ? WHERE id = ?"
        ).bind(body.bunny_api_key || null, body.bunny_library_id || null, body.youtube_cookies || null, existing.id).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO settings_video_sources (bunny_api_key, bunny_library_id, youtube_cookies) VALUES (?, ?, ?)"
        ).bind(body.bunny_api_key || null, body.bunny_library_id || null, body.youtube_cookies || null).run();
      }
      return jsonResponse({ success: true, message: "Video source settings saved" });
    }
  }

  // AI SETTINGS
  if (path === "/api/settings/ai") {
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM settings_ai LIMIT 1").first<AISettings>();
      return jsonResponse({ success: true, data: result || null });
    }

    if (method === "POST") {
      const body = await request.json() as Partial<AISettings>;

      const existing = await env.DB.prepare("SELECT id FROM settings_ai LIMIT 1").first();
      if (existing) {
        await env.DB.prepare(
          "UPDATE settings_ai SET gemini_key = ?, grok_key = ?, cohere_key = ?, openrouter_key = ?, openai_key = ?, groq_key = ?, default_provider = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(body.gemini_key || null, body.grok_key || null, body.cohere_key || null, body.openrouter_key || null, body.openai_key || null, body.groq_key || null, body.default_provider || "openai", existing.id).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO settings_ai (gemini_key, grok_key, cohere_key, openrouter_key, openai_key, groq_key, default_provider) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(body.gemini_key || null, body.grok_key || null, body.cohere_key || null, body.openrouter_key || null, body.openai_key || null, body.groq_key || null, body.default_provider || "openai").run();
      }
      return jsonResponse({ success: true, message: "AI settings saved" });
    }
  }

  // AI KEY TEST
  if (path === "/api/settings/ai/test" && method === "POST") {
    const body = await request.json() as { provider: string; api_key: string };
    if (!body.provider || !body.api_key) {
      return jsonResponse({ success: false, error: "provider and api_key required" }, 400);
    }

    try {
      let testResult = false;
      let message = "";

      switch (body.provider) {
        case "openai": {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${body.api_key}` },
          });
          testResult = res.ok;
          message = res.ok ? "OpenAI connected successfully" : `OpenAI error: ${res.status}`;
          break;
        }
        case "gemini": {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${body.api_key}`);
          testResult = res.ok;
          message = res.ok ? "Gemini connected successfully" : `Gemini error: ${res.status}`;
          break;
        }
        case "grok": {
          const res = await fetch("https://api.x.ai/v1/models", {
            headers: { Authorization: `Bearer ${body.api_key}` },
          });
          testResult = res.ok;
          message = res.ok ? "Grok connected successfully" : `Grok error: ${res.status}`;
          break;
        }
        case "cohere": {
          const res = await fetch("https://api.cohere.ai/v1/models", {
            headers: { Authorization: `Bearer ${body.api_key}` },
          });
          testResult = res.ok;
          message = res.ok ? "Cohere connected successfully" : `Cohere error: ${res.status}`;
          break;
        }
        case "openrouter": {
          const res = await fetch("https://openrouter.ai/api/v1/models", {
            headers: { Authorization: `Bearer ${body.api_key}` },
          });
          testResult = res.ok;
          message = res.ok ? "OpenRouter connected successfully" : `OpenRouter error: ${res.status}`;
          break;
        }
        case "groq": {
          const res = await fetch("https://api.groq.com/openai/v1/models", {
            headers: { Authorization: `Bearer ${body.api_key}` },
          });
          testResult = res.ok;
          message = res.ok ? "Groq connected successfully" : `Groq error: ${res.status}`;
          break;
        }
        default:
          return jsonResponse({ success: false, error: "Unknown provider" }, 400);
      }

      return jsonResponse({ success: testResult, message });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Connection failed";
      return jsonResponse({ success: false, error: errorMsg });
    }
  }

  // AI MODEL CATALOG
  if (path === "/api/settings/ai/models" && method === "GET") {
    const aiSettings = await env.DB.prepare("SELECT * FROM settings_ai LIMIT 1").first<AISettings>();
    if (!aiSettings) {
      return jsonResponse({
        success: true,
        data: {
          default_provider: null,
          providers: [],
        },
      });
    }

    const catalog = await buildAiCatalog(aiSettings);
    return jsonResponse({ success: true, data: catalog });
  }

  // AI GENERATE TAGLINES
  if (path === "/api/settings/ai/generate" && method === "POST") {
    const body = await request.json() as {
      task: "taglines" | "social";
      provider?: string;
      model?: string;
      prompt?: string;
      topic?: string;
      platform?: string;
      count?: number;
    };

    if (!body.task) {
      return jsonResponse({ success: false, error: "task is required" }, 400);
    }

    const aiSettings = await env.DB.prepare("SELECT * FROM settings_ai LIMIT 1").first<AISettings>();
    if (!aiSettings) {
      return jsonResponse({ success: false, error: "No AI settings configured" }, 400);
    }

    const configuredProviders = getConfiguredProviderIds(aiSettings);
    if (configuredProviders.length === 0) {
      return jsonResponse({ success: false, error: "No AI provider API keys saved in Settings" }, 400);
    }

    try {
      const catalog = await buildAiCatalog(aiSettings);
      const requestedProvider = body.provider as SupportedAIProvider | undefined;
      const provider = requestedProvider && configuredProviders.includes(requestedProvider)
        ? requestedProvider
        : catalog.default_provider;

      if (!provider) {
        return jsonResponse({ success: false, error: "No configured AI provider available" }, 400);
      }

      const resolvedModel = resolveModelForProvider(provider, body.model, catalog.providers);

      if (body.task === "taglines") {
        const topic = String(body.prompt || body.topic || "").trim();
        const count = Math.min(Math.max(Number(body.count || 5), 1), 10);
        if (!topic) {
          return jsonResponse({ success: false, error: "prompt is required for tagline generation" }, 400);
        }

        const parsed = await generateAiJson(
          aiSettings,
          provider,
          resolvedModel,
          getTaglinesMessages({ topic, count })
        );
        const normalized = normalizeTaglinesResult(parsed, count);

        return jsonResponse({
          success: true,
          data: {
            ...normalized,
            provider,
            model: resolvedModel,
          },
        });
      }

      if (body.task === "social") {
        const topic = String(body.topic || body.prompt || "").trim();
        const platform = String(body.platform || "youtube").trim();
        const count = Math.min(Math.max(Number(body.count || 10), 1), 50);

        if (!topic) {
          return jsonResponse({ success: false, error: "topic is required for social generation" }, 400);
        }

        const parsed = await generateAiJson(
          aiSettings,
          provider,
          resolvedModel,
          getSocialMessages({ topic, platform, count })
        );
        const normalized = normalizeSocialResult(parsed, count);

        return jsonResponse({
          success: true,
          data: {
            ...normalized,
            provider,
            model: resolvedModel,
          },
        });
      }

      return jsonResponse({ success: false, error: "Unknown AI generation task" }, 400);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "AI generation failed";
      return jsonResponse({ success: false, error: errorMsg });
    }
  }

  return jsonResponse({ success: false, error: "Settings route not found" }, 404);
}
