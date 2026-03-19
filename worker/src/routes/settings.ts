import { Env, ApiResponse, PostformeSettings, GithubSettings, VideoSourceSettings, AISettings } from "../types";

function jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

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
      const res = await fetch("https://api.postforme.io/v1/me", {
        headers: { Authorization: `Bearer ${body.api_key}` },
      });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        return jsonResponse({ success: true, message: "Postforme API connected successfully" });
      }
      return jsonResponse({ success: false, message: `Postforme error: ${res.status} - Invalid API key` });
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
      const res = await fetch("https://api.postforme.io/v1/accounts", {
        headers: { Authorization: `Bearer ${body.api_key}` },
      });
      if (res.ok) {
        const data = await res.json() as { accounts?: Array<{ platform: string; username: string; connected: boolean }> };
        return jsonResponse({ success: true, data: data.accounts || [] });
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
          "UPDATE settings_ai SET gemini_key = ?, grok_key = ?, cohere_key = ?, openrouter_key = ?, openai_key = ?, default_provider = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(body.gemini_key || null, body.grok_key || null, body.cohere_key || null, body.openrouter_key || null, body.openai_key || null, body.default_provider || "openai", existing.id).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO settings_ai (gemini_key, grok_key, cohere_key, openrouter_key, openai_key, default_provider) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(body.gemini_key || null, body.grok_key || null, body.cohere_key || null, body.openrouter_key || null, body.openai_key || null, body.default_provider || "openai").run();
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
        default:
          return jsonResponse({ success: false, error: "Unknown provider" }, 400);
      }

      return jsonResponse({ success: testResult, message });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Connection failed";
      return jsonResponse({ success: false, error: errorMsg });
    }
  }

  // AI GENERATE TAGLINES
  if (path === "/api/settings/ai/generate" && method === "POST") {
    const body = await request.json() as { provider: string; prompt: string };
    if (!body.provider || !body.prompt) {
      return jsonResponse({ success: false, error: "provider and prompt required" }, 400);
    }

    const aiSettings = await env.DB.prepare("SELECT * FROM settings_ai LIMIT 1").first<AISettings>();
    if (!aiSettings) {
      return jsonResponse({ success: false, error: "No AI settings configured" }, 400);
    }

    let apiKey = "";
    switch (body.provider) {
      case "openai": apiKey = aiSettings.openai_key || ""; break;
      case "gemini": apiKey = aiSettings.gemini_key || ""; break;
      case "grok": apiKey = aiSettings.grok_key || ""; break;
      case "cohere": apiKey = aiSettings.cohere_key || ""; break;
      case "openrouter": apiKey = aiSettings.openrouter_key || ""; break;
      default: return jsonResponse({ success: false, error: "Unknown provider" }, 400);
    }

    if (!apiKey) {
      return jsonResponse({ success: false, error: `No API key for ${body.provider}` }, 400);
    }

    try {
      let response;
      const systemPrompt = "You are a creative social media expert. Always respond with valid JSON only.";

      switch (body.provider) {
        case "openai": {
          response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: body.prompt }], temperature: 0.8 }),
          });
          break;
        }
        case "openrouter": {
          response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "meta-llama/llama-3.1-8b-instruct:free", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: body.prompt }], temperature: 0.8 }),
          });
          break;
        }
        case "grok": {
          response = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "grok-beta", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: body.prompt }], temperature: 0.8 }),
          });
          break;
        }
        case "gemini": {
          response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: body.prompt }] }], generationConfig: { temperature: 0.8 } }),
          });
          break;
        }
        case "cohere": {
          response = await fetch("https://api.cohere.ai/v1/generate", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "command-r", prompt: body.prompt, temperature: 0.8, max_tokens: 500 }),
          });
          break;
        }
      }

      if (!response || !response.ok) {
        return jsonResponse({ success: false, error: "AI API request failed" }, 500);
      }

      const aiData = await response.json() as Record<string, unknown>;
      let content = "";

      if (body.provider === "gemini") {
        const candidates = (aiData as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
        content = candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else if (body.provider === "cohere") {
        const generations = (aiData as { generations?: Array<{ text?: string }> }).generations;
        content = generations?.[0]?.text || "";
      } else {
        const choices = (aiData as { choices?: Array<{ message?: { content?: string }> }> }).choices;
        content = choices?.[0]?.message?.content || "";
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { top?: string[]; bottom?: string[] };
        return jsonResponse({ success: true, data: parsed });
      }

      return jsonResponse({ success: false, error: "Could not parse AI response" });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "AI generation failed";
      return jsonResponse({ success: false, error: errorMsg });
    }
  }

  return jsonResponse({ success: false, error: "Settings route not found" }, 404);
}
