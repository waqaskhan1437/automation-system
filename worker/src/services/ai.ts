import type { AISettings } from "../types";

export type SupportedAIProvider =
  | "openai"
  | "gemini"
  | "grok"
  | "cohere"
  | "openrouter"
  | "groq";

export interface AIModelOption {
  id: string;
  label: string;
  description?: string;
  tier?: "free" | "paid" | "unknown";
  contextWindow?: number | null;
}

export interface AIProviderCatalogItem {
  id: SupportedAIProvider;
  label: string;
  models: AIModelOption[];
  error?: string;
}

interface GenerationMessages {
  system: string;
  user: string;
}

interface GenerateTaglinesInput {
  topic: string;
  count: number;
}

interface GenerateSocialInput {
  topic: string;
  platform: string;
  count: number;
}

interface PromptPlanSegmentResult {
  hook: string;
  title: string;
  caption: string;
  hashtags: string[];
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
}

interface GenerateShortPromptPlanInput {
  prompt: string;
}

const PROVIDER_LABELS: Record<SupportedAIProvider, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  grok: "xAI Grok",
  cohere: "Cohere",
  openrouter: "OpenRouter",
  groq: "Groq",
};

const PROVIDER_ORDER: SupportedAIProvider[] = [
  "openai",
  "gemini",
  "grok",
  "cohere",
  "openrouter",
  "groq",
];

const PROVIDER_DEFAULT_MODELS: Record<SupportedAIProvider, string[]> = {
  openai: ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
  grok: ["grok-4-fast-reasoning", "grok-4", "grok-3"],
  cohere: ["command-a-03-2025", "command-r-plus", "command-r7b-12-2024"],
  openrouter: [
    "google/gemini-2.5-flash",
    "openai/gpt-4o-mini",
    "meta-llama/llama-3.3-70b-instruct:free",
  ],
  groq: [
    "openai/gpt-oss-20b",
    "llama-3.1-8b-instant",
    "meta-llama/llama-4-scout-17b-16e-instruct",
  ],
};

function uniqueModels(models: AIModelOption[]): AIModelOption[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (!model.id || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

function compareModels(a: AIModelOption, b: AIModelOption): number {
  if (a.tier === "free" && b.tier !== "free") return -1;
  if (b.tier === "free" && a.tier !== "free") return 1;
  return a.label.localeCompare(b.label);
}

function parseContextWindow(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function readProviderError(prefix: string, response: Response): Promise<never> {
  const errorText = (await response.text()).trim();
  throw new Error(errorText ? `${prefix}: ${response.status} ${errorText}` : `${prefix}: ${response.status}`);
}

function getModelTierFromPricing(pricing: unknown, id: string): "free" | "paid" | "unknown" {
  if (id.includes(":free")) return "free";
  if (!pricing || typeof pricing !== "object") return "unknown";

  const values = Object.values(pricing as Record<string, unknown>)
    .map((value) => Number.parseFloat(String(value)))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) return "unknown";
  return values.every((value) => value === 0) ? "free" : "paid";
}

function isOpenAITextModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (
    lower.includes("embedding") ||
    lower.includes("realtime") ||
    lower.includes("audio") ||
    lower.includes("transcribe") ||
    lower.includes("tts") ||
    lower.includes("moderation") ||
    lower.includes("image") ||
    lower.includes("whisper") ||
    lower.includes("sora") ||
    lower.includes("search-preview") ||
    lower.includes("deep-research")
  ) {
    return false;
  }

  // Filter out non-text models that can't handle text input
  if (
    lower.includes("clipboard") ||
    lower.includes("image") ||
    lower.includes("vision") ||
    lower.includes("embed") ||
    lower.includes("tts") ||
    lower.includes("whisper") ||
    lower.includes("audio") ||
    lower.includes("transcribe")
  ) {
    return false;
  }

  return (
    lower.startsWith("gpt-") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4") ||
    lower.startsWith("chatgpt-") ||
    lower.startsWith("gpt-oss") ||
    lower.startsWith("codex") ||
    lower.startsWith("gemini-") ||
    lower.startsWith("claude-") ||
    lower.startsWith("llama") ||
    lower.startsWith("mistral") ||
    lower.startsWith("command")
  );
}

function isGroqTextModel(id: string): boolean {
  const lower = id.toLowerCase();
  return !(
    lower.includes("whisper") ||
    lower.includes("tts") ||
    lower.includes("guard") ||
    lower.includes("vision-preview")
  );
}

function isGrokTextModel(id: string): boolean {
  const lower = id.toLowerCase();
  return !(lower.includes("image") || lower.includes("tts") || lower.includes("vision"));
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // Fall through to object extraction.
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Could not parse JSON object from provider response");
  }

  const parsed = JSON.parse(match[0]);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Provider JSON response was not an object");
  }

  return parsed as Record<string, unknown>;
}

function cleanStringList(value: unknown, limit: number, hashtagMode = false): string[] {
  if (!Array.isArray(value)) return [];

  function normalize(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function isDuplicate(newItem: string, existing: string[]): boolean {
    const normalizedNew = normalize(newItem);
    return existing.some((item) => normalize(item) === normalizedNew);
  }

  const seen: string[] = [];
  const items = value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .map((item) => (hashtagMode ? (item.startsWith("#") ? item : `#${item.replace(/^#+/, "")}`) : item))
    .filter((item) => !isDuplicate(item, seen))
    .slice(0, limit)
    .forEach((item) => seen.push(item));

  return seen;
}

function cleanTextBlock(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.replace(/\r\n?/g, "\n").trim();
}

function parseTimestampSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  const raw = cleanTextBlock(value);
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!timeMatch) return null;

  const first = Number.parseInt(timeMatch[1], 10);
  const second = Number.parseInt(timeMatch[2], 10);
  const third = timeMatch[3] ? Number.parseInt(timeMatch[3], 10) : null;
  if (!Number.isFinite(first) || !Number.isFinite(second) || (third !== null && !Number.isFinite(third))) {
    return null;
  }

  if (third !== null) {
    return first * 3600 + second * 60 + third;
  }

  return first * 60 + second;
}

function buildTaglinesPrompt({ topic, count }: GenerateTaglinesInput): GenerationMessages {
  return {
    system:
      "You create short-form video overlay copy. Return valid JSON only. No markdown, no prose, no code fences. IMPORTANT: Never generate duplicate taglines - even if they differ slightly in wording, they must be meaningfully different.",
    user: [
      `Generate exactly ${count} TOP taglines and exactly ${count} BOTTOM taglines for short videos.`,
      `Topic: ${topic}`,
      "",
      "TOP TAGLINES (hooks that create curiosity and explain content):",
      "- Describe WHAT is happening in the video",
      "- Create curiosity or surprise",
      "- Short phrases that make viewers want to watch",
      "- Examples: 'What he did next will shock you', 'This is not what it looks like', 'She never expected this'",
      "- DO NOT repeat similar phrases even with different words",
      "",
      "BOTTOM TAGLINES (call-to-action for the website):",
      "- Website link CTA format: 'Order on [WEBSITE].com'",
      "- Examples: 'Order on prankwish.com', 'Get yours at prankwish.com', 'Shop now at prankwish.com'",
      "- Include the full website domain without 'https://'",
      "- Keep it short and punchy",
      "- DO NOT use generic CTAs like 'Follow for more' or 'Like and subscribe'",
      "",
      "IMPORTANT RULES:",
      "- NEVER generate duplicate taglines - each must be unique in meaning and words",
      "- Top and bottom taglines should complement each other, not overlap",
      "- Avoid emojis entirely",
      "- Each tagline should work alone but pair well with the other section",
      'Return JSON with this exact shape: {"top":["..."],"bottom":["..."]}',
    ].join("\n"),
  };
}

function buildSocialPrompt({ topic, platform, count }: GenerateSocialInput): GenerationMessages {
  const hashtagCount = Math.min(Math.max(count * 3, 10), 40);

  return {
    system:
      "You create social media metadata. Return valid JSON only. No markdown, no prose, no code fences.",
    user: [
      `Generate social content for ${platform}.`,
      `Topic: ${topic}`,
      `Create exactly ${count} titles.`,
      `Create exactly ${count} descriptions.`,
      `Create exactly ${hashtagCount} hashtags.`,
      "Rules:",
      "- titles should be catchy and platform-native",
      "- descriptions should be short and usable as captions",
      "- hashtags must be unique and relevant",
      '- return JSON with this exact shape: {"titles":["..."],"descriptions":["..."],"hashtags":["#..."]}',
    ].join("\n"),
  };
}

function buildShortPromptPlanMessages({ prompt }: GenerateShortPromptPlanInput): GenerationMessages {
  return {
    system:
      "You convert pasted short-video planning text into structured JSON. Return valid JSON only. No markdown, no prose, no code fences.",
    user: [
      "Analyze the pasted prompt and extract a reusable short-video plan.",
      "The prompt may include hooks, captions, hashtags, titles, timestamps, durations, short ideas, and merge hints.",
      "Rules:",
      "- If timestamps appear, convert them to numeric seconds.",
      "- Preserve the user's hook/caption/title wording as much as possible, but clean obvious formatting noise.",
      "- If a segment has a start and end time, duration_seconds must equal end_seconds - start_seconds.",
      "- If a segment is missing a title, create a short usable title from the same segment idea.",
      "- If a segment is missing hashtags, infer a few relevant ones from the same segment only.",
      "- If the prompt clearly suggests multiple shorts, return multiple segments in the same order.",
      "- recommended_merge should be true only when the prompt clearly asks to merge generated shorts.",
      '- Return JSON with this exact shape: {"overview":"...","recommended_merge":false,"segments":[{"hook":"...","title":"...","caption":"...","hashtags":["#..."],"start_seconds":16,"end_seconds":35,"duration_seconds":19}],"titles":["..."],"descriptions":["..."],"hashtags":["#..."]}',
      "",
      "Prompt text:",
      prompt,
    ].join("\n"),
  };
}

async function parseTextResponse(response: Response): Promise<string> {
  const payload = await response.json() as Record<string, unknown>;

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (Array.isArray(payload.output)) {
    const text = (payload.output as Array<Record<string, unknown>>)
      .flatMap((item) => {
        const content = item.content;
        if (!Array.isArray(content)) return [];
        return content
          .map((part) => (typeof part?.text === "string" ? part.text : ""))
          .filter(Boolean);
      })
      .join("\n");

    if (text.trim()) return text;
  }

  if (Array.isArray(payload.choices)) {
    const text = (payload.choices as Array<Record<string, unknown>>)
      .map((choice) => {
        const message = choice.message as Record<string, unknown> | undefined;
        if (typeof message?.content === "string") return message.content;
        return "";
      })
      .join("\n");

    if (text.trim()) return text;
  }

  throw new Error("Provider returned no usable text");
}

async function generateWithOpenAI(
  apiKey: string,
  model: string,
  messages: GenerationMessages
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
    }),
  });

  if (response.ok) {
    return parseTextResponse(response);
  }

  const fallback = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
      temperature: 0.7,
    }),
  });

  if (!fallback.ok) {
    const errorText = await fallback.text();
    throw new Error(`OpenAI request failed: ${fallback.status} ${errorText}`);
  }

  return parseTextResponse(fallback);
}

async function generateWithOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: GenerationMessages,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Provider request failed: ${response.status} ${errorText}`);
  }

  return parseTextResponse(response);
}

async function generateWithGemini(
  apiKey: string,
  model: string,
  messages: GenerationMessages
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${messages.system}\n\n${messages.user}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no usable text");
  return text;
}

async function generateWithCohere(
  apiKey: string,
  model: string,
  messages: GenerationMessages
): Promise<string> {
  const response = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const fallback = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: messages.system },
          { role: "user", content: messages.user },
        ],
      }),
    });

    if (!fallback.ok) {
      const errorText = await fallback.text();
      throw new Error(`Cohere request failed: ${fallback.status} ${errorText}`);
    }

    const payload = await fallback.json() as {
      message?: { content?: Array<{ text?: string }> };
    };

    const text = payload.message?.content?.find((item) => typeof item.text === "string")?.text;
    if (!text) throw new Error("Cohere returned no usable text");
    return text;
  }

  const payload = await response.json() as {
    message?: { content?: Array<{ text?: string }> };
  };
  const text = payload.message?.content?.find((item) => typeof item.text === "string")?.text;
  if (!text) throw new Error("Cohere returned no usable text");
  return text;
}

async function fetchOpenAIModels(apiKey: string): Promise<AIModelOption[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    await readProviderError("OpenAI models failed", response);
  }

  const payload = await response.json() as { data?: Array<{ id: string }> };
  return uniqueModels(
    (payload.data || [])
      .filter((model) => model?.id && isOpenAITextModel(model.id))
      .map((model) => ({
        id: model.id,
        label: model.id,
        tier: "paid" as const,
      }))
      .sort(compareModels)
  );
}

async function fetchGeminiModels(apiKey: string): Promise<AIModelOption[]> {
  const params = new URLSearchParams({ key: apiKey.trim() });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?${params.toString()}`);
  if (!response.ok) {
    await readProviderError("Gemini models failed", response);
  }

  const payload = await response.json() as {
    models?: Array<{
      name: string;
      displayName?: string;
      description?: string;
      supportedGenerationMethods?: string[];
      inputTokenLimit?: number;
    }>;
  };

  return uniqueModels(
    (payload.models || [])
      .filter((model) => (model.supportedGenerationMethods || []).includes("generateContent"))
      .map((model) => ({
        id: model.name.replace(/^models\//, ""),
        label: model.displayName || model.name.replace(/^models\//, ""),
        description: model.description,
        contextWindow: parseContextWindow(model.inputTokenLimit),
        tier: "paid" as const,
      }))
      .sort(compareModels)
  );
}

async function fetchGrokModels(apiKey: string): Promise<AIModelOption[]> {
  const response = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    await readProviderError("xAI models failed", response);
  }

  const payload = await response.json() as {
    data?: Array<{
      id: string;
      created?: number;
    }>;
  };

  return uniqueModels(
    (payload.data || [])
      .filter((model) => model?.id && isGrokTextModel(model.id))
      .map((model) => ({
        id: model.id,
        label: model.id,
        tier: "paid" as const,
      }))
      .sort(compareModels)
  );
}

async function fetchCohereModels(apiKey: string): Promise<AIModelOption[]> {
  const response = await fetch("https://api.cohere.com/v1/models?endpoint=chat&page_size=1000", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    await readProviderError("Cohere models failed", response);
  }

  const payload = await response.json() as {
    models?: Array<{
      name: string;
      is_deprecated?: boolean;
      endpoints?: string[];
      features?: string[];
      context_length?: number;
    }>;
  };

  return uniqueModels(
    (payload.models || [])
      .filter((model) => !model.is_deprecated)
      .filter((model) => {
        const endpoints = model.endpoints || [];
        const features = model.features || [];
        return endpoints.includes("chat") || features.includes("chat-completions");
      })
      .map((model) => ({
        id: model.name,
        label: model.name,
        contextWindow: parseContextWindow(model.context_length),
        tier: "paid" as const,
      }))
      .sort(compareModels)
  );
}

async function fetchOpenRouterModels(apiKey: string): Promise<AIModelOption[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    await readProviderError("OpenRouter models failed", response);
  }

  const payload = await response.json() as {
    data?: Array<{
      id: string;
      name?: string;
      description?: string;
      pricing?: Record<string, unknown>;
      context_length?: number;
      architecture?: {
        input_modalities?: string[];
        output_modalities?: string[];
      };
      top_provider?: {
        context_length?: number;
      };
    }>;
  };

  return uniqueModels(
    (payload.data || [])
      .filter((model) => {
        const outputModalities = model.architecture?.output_modalities || [];
        return outputModalities.includes("text");
      })
      .map((model) => {
        const tier = getModelTierFromPricing(model.pricing, model.id);
        const labelSuffix = tier === "free" ? " (Free)" : "";
        return {
          id: model.id,
          label: `${model.name || model.id}${labelSuffix}`,
          description: model.description,
          tier,
          contextWindow: parseContextWindow(
            model.top_provider?.context_length ?? model.context_length
          ),
        };
      })
      .sort(compareModels)
  );
}

async function fetchGroqModels(apiKey: string): Promise<AIModelOption[]> {
  const response = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    await readProviderError("Groq models failed", response);
  }

  const payload = await response.json() as {
    data?: Array<{ id: string }>;
  };

  return uniqueModels(
    (payload.data || [])
      .filter((model) => model?.id && isGroqTextModel(model.id))
      .map((model) => ({
        id: model.id,
        label: model.id,
        tier: "paid" as const,
      }))
      .sort(compareModels)
  );
}

async function fetchProviderModels(
  provider: SupportedAIProvider,
  apiKey: string
): Promise<AIModelOption[]> {
  switch (provider) {
    case "openai":
      return fetchOpenAIModels(apiKey);
    case "gemini":
      return fetchGeminiModels(apiKey);
    case "grok":
      return fetchGrokModels(apiKey);
    case "cohere":
      return fetchCohereModels(apiKey);
    case "openrouter":
      return fetchOpenRouterModels(apiKey);
    case "groq":
      return fetchGroqModels(apiKey);
  }
}

function fallbackModels(provider: SupportedAIProvider): AIModelOption[] {
  return PROVIDER_DEFAULT_MODELS[provider].map((id) => ({
    id,
    label: id,
    tier: id.includes(":free") ? "free" : "unknown",
  }));
}

export function getProviderApiKey(
  settings: AISettings,
  provider: SupportedAIProvider
): string {
  switch (provider) {
    case "openai":
      return settings.openai_key || "";
    case "gemini":
      return settings.gemini_key || "";
    case "grok":
      return settings.grok_key || "";
    case "cohere":
      return settings.cohere_key || "";
    case "openrouter":
      return settings.openrouter_key || "";
    case "groq":
      return settings.groq_key || "";
  }
}

export function getConfiguredProviderIds(settings: AISettings): SupportedAIProvider[] {
  return PROVIDER_ORDER.filter((provider) => Boolean(getProviderApiKey(settings, provider)));
}

export async function buildAiCatalog(settings: AISettings): Promise<{
  default_provider: SupportedAIProvider | null;
  providers: AIProviderCatalogItem[];
}> {
  const configuredProviders = getConfiguredProviderIds(settings);
  const providers = await Promise.all(
    configuredProviders.map(async (provider) => {
      const apiKey = getProviderApiKey(settings, provider);
      try {
        const models = await fetchProviderModels(provider, apiKey);
        return {
          id: provider,
          label: PROVIDER_LABELS[provider],
          models: models.length > 0 ? models : fallbackModels(provider),
        } satisfies AIProviderCatalogItem;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch models";
        return {
          id: provider,
          label: PROVIDER_LABELS[provider],
          models: fallbackModels(provider),
          error: message,
        } satisfies AIProviderCatalogItem;
      }
    })
  );

  const defaultProvider = configuredProviders.includes(settings.default_provider as SupportedAIProvider)
    ? (settings.default_provider as SupportedAIProvider)
    : configuredProviders[0] || null;

  return {
    default_provider: defaultProvider,
    providers,
  };
}

export function resolveModelForProvider(
  provider: SupportedAIProvider,
  preferredModel: string | undefined,
  catalog: AIProviderCatalogItem[]
): string {
  const providerModels = catalog.find((item) => item.id === provider)?.models || [];
  if (preferredModel && providerModels.some((model) => model.id === preferredModel)) {
    return preferredModel;
  }

  const configuredDefault = PROVIDER_DEFAULT_MODELS[provider].find((id) =>
    providerModels.some((model) => model.id === id)
  );
  if (configuredDefault) return configuredDefault;

  return providerModels[0]?.id || PROVIDER_DEFAULT_MODELS[provider][0];
}

export async function generateAiJson(
  settings: AISettings,
  provider: SupportedAIProvider,
  model: string,
  messages: GenerationMessages
): Promise<Record<string, unknown>> {
  const apiKey = getProviderApiKey(settings, provider);
  if (!apiKey) {
    throw new Error(`No API key saved for ${PROVIDER_LABELS[provider]}`);
  }

  let rawText = "";
  switch (provider) {
    case "openai":
      rawText = await generateWithOpenAI(apiKey, model, messages);
      break;
    case "gemini":
      rawText = await generateWithGemini(apiKey, model, messages);
      break;
    case "grok":
      rawText = await generateWithOpenAICompatible("https://api.x.ai/v1", apiKey, model, messages);
      break;
    case "cohere":
      rawText = await generateWithCohere(apiKey, model, messages);
      break;
    case "openrouter":
      rawText = await generateWithOpenAICompatible(
        "https://openrouter.ai/api/v1",
        apiKey,
        model,
        messages,
        {
          "HTTP-Referer": "https://automation-frontend-woad.vercel.app",
          "X-Title": "Automation Frontend",
        }
      );
      break;
    case "groq":
      rawText = await generateWithOpenAICompatible(
        "https://api.groq.com/openai/v1",
        apiKey,
        model,
        messages
      );
      break;
  }

  return parseJsonObject(rawText);
}

export function normalizeTaglinesResult(
  payload: Record<string, unknown>,
  count: number
): { top: string[]; bottom: string[] } {
  const top = cleanStringList(payload.top, count);
  const bottom = cleanStringList(payload.bottom, count);

  if (top.length === 0 || bottom.length === 0) {
    throw new Error("Provider response did not include valid top/bottom taglines");
  }

  return { top, bottom };
}

export function normalizeSocialResult(
  payload: Record<string, unknown>,
  count: number
): { titles: string[]; descriptions: string[]; hashtags: string[] } {
  const titles = cleanStringList(payload.titles, count);
  const descriptions = cleanStringList(payload.descriptions, count);
  const hashtags = cleanStringList(payload.hashtags, Math.min(Math.max(count * 3, 10), 40), true);

  if (titles.length === 0 || descriptions.length === 0 || hashtags.length === 0) {
    throw new Error("Provider response did not include valid titles, descriptions, and hashtags");
  }

  return { titles, descriptions, hashtags };
}

export function normalizeShortPromptPlanResult(payload: Record<string, unknown>): {
  overview: string;
  recommended_merge: boolean;
  segments: PromptPlanSegmentResult[];
  titles: string[];
  descriptions: string[];
  hashtags: string[];
} {
  const rawSegments = Array.isArray(payload.segments) ? payload.segments : [];
  const segments = rawSegments
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const hook = cleanTextBlock(record.hook);
      const title = cleanTextBlock(record.title || record.headline || record.name);
      const caption = cleanTextBlock(record.caption || record.description);
      const hashtags = cleanStringList(record.hashtags, 12, true);
      const start = parseTimestampSeconds(record.start_seconds ?? record.start ?? record.timestamp_start);
      const end = parseTimestampSeconds(record.end_seconds ?? record.end ?? record.timestamp_end);
      const durationValue = parseTimestampSeconds(record.duration_seconds ?? record.duration);
      const resolvedStart = start ?? 0;
      const resolvedEnd = end ?? (durationValue !== null ? resolvedStart + durationValue : null);
      const resolvedDuration = resolvedEnd !== null
        ? Math.max(1, resolvedEnd - resolvedStart)
        : (durationValue !== null ? Math.max(1, durationValue) : null);

      if ((!hook && !title && !caption) || resolvedEnd === null || resolvedEnd <= resolvedStart) {
        return null;
      }

      return {
        hook: hook || title || caption || `Segment ${index + 1}`,
        title: title || hook || `Short ${index + 1}`,
        caption: caption || title || hook || "",
        hashtags,
        start_seconds: resolvedStart,
        end_seconds: resolvedEnd,
        duration_seconds: resolvedDuration || Math.max(1, resolvedEnd - resolvedStart),
      };
    })
    .filter((item): item is PromptPlanSegmentResult => Boolean(item));

  if (segments.length === 0) {
    throw new Error("Provider response did not include valid timestamp segments");
  }

  const socialSetCount = Math.max(segments.length, 1);
  const titles = cleanStringList(payload.titles, socialSetCount);
  const descriptions = cleanStringList(payload.descriptions, socialSetCount);
  const hashtags = cleanStringList(payload.hashtags, Math.min(Math.max(socialSetCount * 3, 3), 40), true);
  const overview = cleanTextBlock(payload.overview, `Prompt-based short plan with ${segments.length} segment(s).`);
  const recommendedMerge = payload.recommended_merge === true;

  return {
    overview,
    recommended_merge: recommendedMerge,
    segments,
    titles: titles.length > 0 ? titles : segments.map((segment) => segment.title),
    descriptions: descriptions.length > 0 ? descriptions : segments.map((segment) => segment.caption),
    hashtags: hashtags.length > 0
      ? hashtags
      : Array.from(new Set(segments.flatMap((segment) => segment.hashtags))).slice(0, 40),
  };
}

export function getTaglinesMessages(input: GenerateTaglinesInput): GenerationMessages {
  return buildTaglinesPrompt(input);
}

export function getSocialMessages(input: GenerateSocialInput): GenerationMessages {
  return buildSocialPrompt(input);
}

export function getShortPromptPlanMessages(input: GenerateShortPromptPlanInput): GenerationMessages {
  return buildShortPromptPlanMessages(input);
}
