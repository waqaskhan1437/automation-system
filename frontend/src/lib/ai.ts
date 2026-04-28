import type { AIModelCatalogResponse, AIModelOption, AIProviderCatalog } from "./types";

export function getAvailableProviders(catalog: AIModelCatalogResponse | null): AIProviderCatalog[] {
  return catalog?.providers || [];
}

export function getProviderModels(
  catalog: AIModelCatalogResponse | null,
  providerId: string | null | undefined
): AIModelOption[] {
  if (!providerId) return [];
  return catalog?.providers.find((provider) => provider.id === providerId)?.models || [];
}

export function resolveProviderSelection(
  catalog: AIModelCatalogResponse | null,
  preferred: string | null | undefined
): string {
  const providers = getAvailableProviders(catalog);
  if (preferred && providers.some((provider) => provider.id === preferred)) {
    return preferred;
  }

  if (catalog?.default_provider && providers.some((provider) => provider.id === catalog.default_provider)) {
    return catalog.default_provider;
  }

  return providers[0]?.id || "";
}

export function resolveModelSelection(
  catalog: AIModelCatalogResponse | null,
  providerId: string | null | undefined,
  preferred: string | null | undefined
): string {
  const models = getProviderModels(catalog, providerId);
  if (preferred && models.some((model) => model.id === preferred)) {
    return preferred;
  }
  return models[0]?.id || "";
}
