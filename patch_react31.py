from pathlib import Path
root = Path('/mnt/data/react31_fix')
ai = root/'frontend/src/lib/ai.ts'
text = ai.read_text()
text = r'''import type { AIModelCatalogResponse, AIModelOption, AIProviderCatalog } from "./types";

function stringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return stringFromUnknown(record.id)
      || stringFromUnknown(record.value)
      || stringFromUnknown(record.name)
      || stringFromUnknown(record.label)
      || stringFromUnknown(record.displayName);
  }
  return "";
}

function labelFromUnknown(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return labelFromUnknown(record.label)
      || labelFromUnknown(record.displayName)
      || labelFromUnknown(record.name)
      || labelFromUnknown(record.id)
      || fallback;
  }
  return fallback;
}

function normalizeModel(model: unknown): AIModelOption | null {
  const id = stringFromUnknown(model).trim();
  if (!id) return null;

  if (typeof model === "string") {
    return { id, label: id };
  }

  const record = model && typeof model === "object" ? model as Record<string, unknown> : {};
  const tier = record.tier === "free" || record.tier === "paid" || record.tier === "unknown"
    ? record.tier
    : undefined;
  const contextWindow = typeof record.contextWindow === "number"
    ? record.contextWindow
    : typeof record.context_window === "number"
      ? record.context_window
      : null;

  return {
    id,
    label: labelFromUnknown(record.label, id),
    description: typeof record.description === "string" ? record.description : undefined,
    tier,
    contextWindow,
  };
}

function normalizeProvider(provider: unknown): AIProviderCatalog | null {
  if (!provider || typeof provider !== "object") return null;
  const record = provider as Record<string, unknown>;
  const id = stringFromUnknown(record.id).trim();
  if (!id) return null;
  const rawModels = Array.isArray(record.models) ? record.models : [];
  const models = rawModels
    .map(normalizeModel)
    .filter((model): model is AIModelOption => Boolean(model));

  return {
    id,
    label: labelFromUnknown(record.label, id),
    models,
    error: typeof record.error === "string" ? record.error : undefined,
  };
}

export function normalizeAiCatalog(catalog: AIModelCatalogResponse | null | undefined): AIModelCatalogResponse {
  const rawProviders = Array.isArray(catalog?.providers) ? catalog.providers : [];
  const providers = rawProviders
    .map(normalizeProvider)
    .filter((provider): provider is AIProviderCatalog => Boolean(provider));
  const defaultProvider = stringFromUnknown(catalog?.default_provider) || null;

  return {
    default_provider: defaultProvider,
    providers,
  };
}

export function getAvailableProviders(catalog: AIModelCatalogResponse | null): AIProviderCatalog[] {
  return normalizeAiCatalog(catalog).providers;
}

export function getProviderModels(
  catalog: AIModelCatalogResponse | null,
  providerId: string | null | undefined
): AIModelOption[] {
  if (!providerId) return [];
  return getAvailableProviders(catalog).find((provider) => provider.id === providerId)?.models || [];
}

export function resolveProviderSelection(
  catalog: AIModelCatalogResponse | null,
  preferred: string | null | undefined
): string {
  const providers = getAvailableProviders(catalog);
  const preferredId = stringFromUnknown(preferred);
  if (preferredId && providers.some((provider) => provider.id === preferredId)) {
    return preferredId;
  }

  const defaultProvider = stringFromUnknown(catalog?.default_provider);
  if (defaultProvider && providers.some((provider) => provider.id === defaultProvider)) {
    return defaultProvider;
  }

  return providers[0]?.id || "";
}

export function resolveModelSelection(
  catalog: AIModelCatalogResponse | null,
  providerId: string | null | undefined,
  preferred: string | null | undefined
): string {
  const provider = stringFromUnknown(providerId);
  const models = getProviderModels(catalog, provider);
  const preferredId = stringFromUnknown(preferred);
  if (preferredId && models.some((model) => model.id === preferredId)) {
    return preferredId;
  }
  return models[0]?.id || "";
}
'''
ai.write_text(text)

modal = root/'frontend/src/components/automations/AutomationModal.tsx'
text = modal.read_text()
text = text.replace('import { getAvailableProviders, resolveModelSelection, resolveProviderSelection } from "@/lib/ai";', 'import { getAvailableProviders, normalizeAiCatalog, resolveModelSelection, resolveProviderSelection } from "@/lib/ai";')
old = '''      if (res.success && res.data) {
        const transformedData = {
          default_provider: res.data.default_provider,
          providers: (res.data.providers || []).map(p => ({
            id: p.id,
            label: p.name || p.id,
            models: (p.models || []).map(m => ({ id: m, label: m }))
          }))
        };
        setAiCatalog(transformedData);
      } else {
        setAiCatalog({ default_provider: null, providers: [] });
      }'''
new = '''      if (res.success && res.data) {
        setAiCatalog(normalizeAiCatalog(res.data as AIModelCatalogResponse));
      } else {
        setAiCatalog({ default_provider: null, providers: [] });
      }'''
if old not in text:
    raise SystemExit('old modal block not found')
text = text.replace(old, new)
modal.write_text(text)

img = root/'frontend/src/components/automations/image/ImageAutomationEditor.tsx'
text = img.read_text()
text = text.replace('import { getAvailableProviders, resolveModelSelection, resolveProviderSelection } from "@/lib/ai";', 'import { getAvailableProviders, normalizeAiCatalog, resolveModelSelection, resolveProviderSelection } from "@/lib/ai";')
old = '''      if (result.success) {
        setAiCatalog(result.data || { default_provider: null, providers: [] });
      } else {
        setAiCatalog({ default_provider: null, providers: [] });
      }'''
new = '''      if (result.success) {
        setAiCatalog(normalizeAiCatalog(result.data || { default_provider: null, providers: [] }));
      } else {
        setAiCatalog({ default_provider: null, providers: [] });
      }'''
if old not in text:
    raise SystemExit('old image block not found')
text = text.replace(old, new)
img.write_text(text)
print('[OK] patched ai catalog normalization')
