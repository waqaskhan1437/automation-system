export interface SavedPostformeAccount {
  id: string;
  platform: string;
  username: string;
}

export interface ScheduledAccountMetadata {
  id: string;
  platform: string;
  username: string;
  scheduled_at: string | null;
  postforme_id: string | null;
}

export interface PlatformConfigurationMetadata {
  platform: string;
  title: string;
  caption: string;
}

export interface AccountConfigurationMetadata {
  social_account_id: string;
  platform: string;
  username: string;
  title: string;
  caption: string;
}

export interface StoredPostMetadata {
  title: string;
  description: string;
  hashtags: string[];
  caption: string;
  top_tagline: string;
  bottom_tagline: string;
  schedule_mode: string;
  scheduled_accounts: ScheduledAccountMetadata[];
  platform_configurations: PlatformConfigurationMetadata[];
  account_configurations: AccountConfigurationMetadata[];
}

interface AutomationPostConfig {
  titles: string[];
  descriptions: string[];
  hashtags: string[];
  topTaglines: string[];
  bottomTaglines: string[];
  accountIds: string[];
  publishMode: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanCaptionValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  const record = asRecord(value);
  return cleanString(record.text) || cleanString(record.value) || cleanString(record.caption);
}

function cleanStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item)).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return cleanStringArray(parsed);
    } catch {
      return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function ensureHashtag(value: string): string {
  const cleaned = value.replace(/\s+/g, "").trim();
  if (!cleaned) {
    return "";
  }

  const normalized = cleaned.replace(/^#+/, "");
  return normalized ? `#${normalized}` : "";
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push(value);
  }

  return next;
}

function normalizeHashtagArray(value: unknown): string[] {
  return uniqueStrings(
    cleanStringArray(value)
      .map((item) => ensureHashtag(item))
      .filter(Boolean)
  );
}

function pickCaptionMatch(caption: string, candidates: string[]): string {
  if (!caption) {
    return candidates.length === 1 ? candidates[0] : "";
  }

  return candidates.find((candidate) => caption.includes(candidate)) || (candidates.length === 1 ? candidates[0] : "");
}

function pickHashtagMatches(caption: string, hashtags: string[]): string[] {
  if (!caption) {
    return hashtags.length <= 3 ? normalizeHashtagArray(hashtags) : [];
  }

  const normalizedHashtags = normalizeHashtagArray(hashtags);
  const matches = normalizedHashtags.filter((hashtag) => caption.includes(hashtag));
  return matches.length > 0 ? matches : [];
}

function extractHashtagsFromCaption(caption: string): string[] {
  const matches = caption.match(/#[A-Za-z0-9_]+/g) || [];
  return uniqueStrings(matches.map((hashtag) => ensureHashtag(hashtag)).filter(Boolean));
}

function splitCaptionBlocks(caption: string): string[] {
  return caption
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function isHashtagOnlyBlock(block: string): boolean {
  if (!block) {
    return false;
  }

  return block.replace(/#[A-Za-z0-9_]+/g, "").trim().length === 0;
}

function inferCaptionStructure(caption: string): { title: string; description: string } {
  const blocks = splitCaptionBlocks(caption);
  const nonHashtagBlocks = blocks.filter((block) => !isHashtagOnlyBlock(block));

  if (nonHashtagBlocks.length === 0) {
    return { title: "", description: "" };
  }

  if (nonHashtagBlocks.length === 1) {
    const [single] = nonHashtagBlocks;
    return single.length <= 120
      ? { title: single, description: "" }
      : { title: "", description: single };
  }

  const [first, ...rest] = nonHashtagBlocks;
  if (first.length > 160) {
    return { title: "", description: nonHashtagBlocks.join("\n\n") };
  }

  return {
    title: first,
    description: rest.join("\n\n").trim(),
  };
}

export function parseSavedPostformeAccounts(raw: string | null | undefined): SavedPostformeAccount[] {
  if (!raw || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const record = asRecord(item);
        const id = cleanString(record.id);
        if (!id) {
          return null;
        }

        return {
          id,
          platform: cleanString(record.platform) || "unknown",
          username: cleanString(record.username) || cleanString(record.name) || id,
        };
      })
      .filter((item): item is SavedPostformeAccount => Boolean(item));
  } catch {
    return [];
  }
}

export function resolveScheduledAccounts(
  accountIds: string[],
  savedAccountsRaw: string | null | undefined,
  overrides?: Array<Partial<ScheduledAccountMetadata>>
): ScheduledAccountMetadata[] {
  const savedAccounts = parseSavedPostformeAccounts(savedAccountsRaw);

  return accountIds.map((accountId, index) => {
    const saved = savedAccounts.find((account) => account.id === accountId);
    const override = overrides?.[index] || {};

    return {
      id: accountId,
      platform: cleanString(override.platform) || saved?.platform || "unknown",
      username: cleanString(override.username) || saved?.username || accountId,
      scheduled_at: cleanString(override.scheduled_at) || null,
      postforme_id: cleanString(override.postforme_id) || null,
    };
  });
}

function normalizeScheduledAccounts(
  value: Array<Partial<ScheduledAccountMetadata>> | undefined,
  savedAccountsRaw: string | null | undefined
): ScheduledAccountMetadata[] {
  return (Array.isArray(value) ? value : [])
    .map((account) => {
      const id = cleanString(account?.id);
      if (!id) {
        return null;
      }

      return resolveScheduledAccounts([id], savedAccountsRaw, [account])[0] || null;
    })
    .filter((account): account is ScheduledAccountMetadata => Boolean(account));
}

function mergeScheduledAccounts(...sources: ScheduledAccountMetadata[][]): ScheduledAccountMetadata[] {
  const order: string[] = [];
  const merged = new Map<string, ScheduledAccountMetadata>();

  for (const source of sources) {
    for (const account of source) {
      const id = cleanString(account.id);
      if (!id) {
        continue;
      }

      if (!merged.has(id)) {
        order.push(id);
        merged.set(id, {
          id,
          platform: "unknown",
          username: id,
          scheduled_at: null,
          postforme_id: null,
        });
      }

      const current = merged.get(id)!;
      merged.set(id, {
        id,
        platform: cleanString(account.platform) || current.platform || "unknown",
        username: cleanString(account.username) || current.username || id,
        scheduled_at: cleanString(account.scheduled_at) || current.scheduled_at || null,
        postforme_id: cleanString(account.postforme_id) || current.postforme_id || null,
      });
    }
  }

  return order.map((id) => merged.get(id)!).filter(Boolean);
}

function normalizePlatformConfigurations(value: unknown): PlatformConfigurationMetadata[] {
  const entries = Array.isArray(value)
    ? value
    : Object.entries(asRecord(value)).map(([platform, config]) => ({ platform, ...asRecord(config) }));

  return entries
    .map((entry) => {
      const record = asRecord(entry);
      const platform = cleanString(record.platform);
      if (!platform) {
        return null;
      }

      const title = cleanString(record.title);
      const caption = cleanCaptionValue(record.caption);
      if (!title && !caption) {
        return null;
      }

      return {
        platform,
        title,
        caption,
      };
    })
    .filter((entry): entry is PlatformConfigurationMetadata => Boolean(entry));
}

function mergePlatformConfigurations(...sources: PlatformConfigurationMetadata[][]): PlatformConfigurationMetadata[] {
  const order: string[] = [];
  const merged = new Map<string, PlatformConfigurationMetadata>();

  for (const source of sources) {
    for (const item of source) {
      const platform = cleanString(item.platform);
      if (!platform) {
        continue;
      }

      if (!merged.has(platform)) {
        order.push(platform);
        merged.set(platform, { platform, title: "", caption: "" });
      }

      const current = merged.get(platform)!;
      merged.set(platform, {
        platform,
        title: cleanString(item.title) || current.title,
        caption: cleanCaptionValue(item.caption) || current.caption,
      });
    }
  }

  return order
    .map((platform) => merged.get(platform)!)
    .filter((item) => item && (item.title || item.caption));
}

function normalizeAccountConfigurations(
  value: unknown,
  savedAccountsRaw: string | null | undefined
): AccountConfigurationMetadata[] {
  const savedAccounts = parseSavedPostformeAccounts(savedAccountsRaw);
  const items = Array.isArray(value) ? value : [];

  return items
    .map((item) => {
      const record = asRecord(item);
      const socialAccountId = cleanString(record.social_account_id) || cleanString(record.id);
      if (!socialAccountId) {
        return null;
      }

      const configuration = asRecord(record.configuration);
      const savedAccount = savedAccounts.find((account) => account.id === socialAccountId);
      const title = cleanString(configuration.title) || cleanString(record.title);
      const caption = cleanCaptionValue(configuration.caption) || cleanCaptionValue(record.caption);

      if (!title && !caption) {
        return null;
      }

      return {
        social_account_id: socialAccountId,
        platform: cleanString(record.platform) || savedAccount?.platform || "unknown",
        username: cleanString(record.username) || savedAccount?.username || socialAccountId,
        title,
        caption,
      };
    })
    .filter((item): item is AccountConfigurationMetadata => Boolean(item));
}

function mergeAccountConfigurations(...sources: AccountConfigurationMetadata[][]): AccountConfigurationMetadata[] {
  const order: string[] = [];
  const merged = new Map<string, AccountConfigurationMetadata>();

  for (const source of sources) {
    for (const item of source) {
      const socialAccountId = cleanString(item.social_account_id);
      if (!socialAccountId) {
        continue;
      }

      if (!merged.has(socialAccountId)) {
        order.push(socialAccountId);
        merged.set(socialAccountId, {
          social_account_id: socialAccountId,
          platform: "unknown",
          username: socialAccountId,
          title: "",
          caption: "",
        });
      }

      const current = merged.get(socialAccountId)!;
      merged.set(socialAccountId, {
        social_account_id: socialAccountId,
        platform: cleanString(item.platform) || current.platform,
        username: cleanString(item.username) || current.username,
        title: cleanString(item.title) || current.title,
        caption: cleanCaptionValue(item.caption) || current.caption,
      });
    }
  }

  return order
    .map((socialAccountId) => merged.get(socialAccountId)!)
    .filter((item) => item && (item.title || item.caption));
}

export function buildStoredPostMetadata(input: Partial<StoredPostMetadata>): StoredPostMetadata {
  return {
    title: cleanString(input.title),
    description: cleanString(input.description),
    hashtags: normalizeHashtagArray(input.hashtags),
    caption: cleanCaptionValue(input.caption),
    top_tagline: cleanString(input.top_tagline),
    bottom_tagline: cleanString(input.bottom_tagline),
    schedule_mode: cleanString(input.schedule_mode) || "immediate",
    scheduled_accounts: Array.isArray(input.scheduled_accounts)
      ? input.scheduled_accounts.map((account) => ({
          id: cleanString(account?.id),
          platform: cleanString(account?.platform) || "unknown",
          username: cleanString(account?.username) || cleanString(account?.id),
          scheduled_at: cleanString(account?.scheduled_at) || null,
          postforme_id: cleanString(account?.postforme_id) || null,
        })).filter((account) => account.id)
      : [],
    platform_configurations: normalizePlatformConfigurations(input.platform_configurations),
    account_configurations: normalizeAccountConfigurations(input.account_configurations, null),
  };
}

export function parseStoredPostMetadata(raw: unknown): StoredPostMetadata | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const metadata = buildStoredPostMetadata(asRecord(parsed));
    const hasContent = Boolean(
      metadata.title ||
      metadata.description ||
      metadata.caption ||
      metadata.hashtags.length > 0 ||
      metadata.scheduled_accounts.length > 0 ||
      metadata.platform_configurations.length > 0 ||
      metadata.account_configurations.length > 0
    );

    return hasContent ? metadata : null;
  } catch {
    return null;
  }
}

function extractAutomationPostConfig(config: unknown): AutomationPostConfig {
  const record = typeof config === "string" ? asRecord(JSON.parse(config || "{}")) : asRecord(config);

  return {
    titles: cleanStringArray(record.titles),
    descriptions: cleanStringArray(record.descriptions),
    hashtags: cleanStringArray(record.hashtags),
    topTaglines: cleanStringArray(record.top_taglines),
    bottomTaglines: cleanStringArray(record.bottom_taglines),
    accountIds: cleanStringArray(record.postforme_account_ids),
    publishMode: cleanString(record.publish_mode) || "immediate",
  };
}

export function inferStoredPostMetadata(input: {
  rawMetadata?: unknown;
  config?: unknown;
  outputData?: unknown;
  savedAccountsRaw?: string | null;
  scheduledAt?: string | null;
  postformeId?: string | null;
  captionOverride?: unknown;
  scheduledAccountsOverride?: Array<Partial<ScheduledAccountMetadata>>;
  platformConfigurations?: unknown;
  accountConfigurations?: unknown;
}): StoredPostMetadata | null {
  const existing = parseStoredPostMetadata(input.rawMetadata);

  let configSummary: AutomationPostConfig;
  try {
    configSummary = extractAutomationPostConfig(input.config);
  } catch {
    configSummary = {
      titles: [],
      descriptions: [],
      hashtags: [],
      topTaglines: [],
      bottomTaglines: [],
      accountIds: [],
      publishMode: "immediate",
    };
  }

  const outputRecord = typeof input.outputData === "string"
    ? asRecord(JSON.parse(input.outputData || "{}"))
    : asRecord(input.outputData);

  const caption = cleanCaptionValue(input.captionOverride) || existing?.caption || cleanCaptionValue(outputRecord.caption);
  const fallbackCaption = inferCaptionStructure(caption);
  const title = existing?.title || pickCaptionMatch(caption, configSummary.titles) || fallbackCaption.title;
  const description = existing?.description || pickCaptionMatch(caption, configSummary.descriptions) || fallbackCaption.description;
  const topTagline = existing?.top_tagline || pickCaptionMatch(caption, configSummary.topTaglines);
  const bottomTagline = existing?.bottom_tagline || pickCaptionMatch(caption, configSummary.bottomTaglines);
  const hashtags = existing?.hashtags?.length
    ? normalizeHashtagArray(existing.hashtags)
    : (() => {
        const matched = pickHashtagMatches(caption, configSummary.hashtags);
        return matched.length > 0 ? matched : extractHashtagsFromCaption(caption);
      })();

  const configAccounts = resolveScheduledAccounts(
    configSummary.accountIds,
    input.savedAccountsRaw,
    configSummary.accountIds.map(() => ({
      scheduled_at: input.scheduledAt || null,
      postforme_id: input.postformeId || null,
    }))
  );
  const overrideAccounts = normalizeScheduledAccounts(input.scheduledAccountsOverride, input.savedAccountsRaw);
  const scheduledAccounts = mergeScheduledAccounts(existing?.scheduled_accounts || [], overrideAccounts, configAccounts);

  const platformConfigurations = mergePlatformConfigurations(
    existing?.platform_configurations || [],
    normalizePlatformConfigurations(input.platformConfigurations)
  );

  const accountConfigurations = mergeAccountConfigurations(
    existing?.account_configurations || [],
    normalizeAccountConfigurations(input.accountConfigurations, input.savedAccountsRaw)
  );

  const metadata = buildStoredPostMetadata({
    title,
    description,
    hashtags,
    caption,
    top_tagline: topTagline,
    bottom_tagline: bottomTagline,
    schedule_mode: existing?.schedule_mode || configSummary.publishMode,
    scheduled_accounts: scheduledAccounts,
    platform_configurations: platformConfigurations,
    account_configurations: accountConfigurations,
  });

  const hasContent = Boolean(
    metadata.title ||
    metadata.description ||
    metadata.caption ||
    metadata.hashtags.length > 0 ||
    metadata.scheduled_accounts.length > 0 ||
    metadata.platform_configurations.length > 0 ||
    metadata.account_configurations.length > 0
  );

  return hasContent ? metadata : null;
}
