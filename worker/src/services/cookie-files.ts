const COOKIE_HEADER_LINES = [
  "# Netscape HTTP Cookie File",
  "# https://curl.haxx.se/rfc/cookie_spec.html",
  "# This is a generated file! Do not edit.",
];

const YOUTUBE_RECOMMENDED_COOKIE_NAMES = [
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "LOGIN_INFO",
];

export interface CookieEntry {
  domain: string;
  includeSubdomains: boolean;
  path: string;
  secure: boolean;
  expires: number;
  name: string;
  value: string;
}

export interface CookieSummary {
  present: boolean;
  cookie_count: number;
  session_cookie_count: number;
  domains: string[];
  sample_cookie_names: string[];
  updated_at: string | null;
  earliest_expiry: string | null;
  latest_expiry: string | null;
  youtube_auth_likely: boolean;
  missing_recommended_youtube_cookies: string[];
  warnings: string[];
}

export interface NormalizedCookieBundle {
  normalized: string;
  entries: CookieEntry[];
  warnings: string[];
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeBooleanToken(value: string): boolean | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "TRUE") return true;
  if (normalized === "FALSE") return false;
  return null;
}

function parseCookieEntry(fields: string[]): CookieEntry | null {
  if (fields.length < 7) {
    return null;
  }

  const [domainRaw, includeSubdomainsRaw, pathRaw, secureRaw, expiresRaw, nameRaw, ...valueParts] = fields;
  const domain = domainRaw.trim();
  const includeSubdomains = normalizeBooleanToken(includeSubdomainsRaw);
  const path = pathRaw.trim();
  const secure = normalizeBooleanToken(secureRaw);
  const expires = Number.parseInt(expiresRaw.trim(), 10);
  const name = nameRaw.trim();
  const value = valueParts.join("\t").trim();

  if (!domain || includeSubdomains === null || secure === null || !path.startsWith("/") || !name || !Number.isFinite(expires)) {
    return null;
  }

  return {
    domain,
    includeSubdomains,
    path,
    secure,
    expires,
    name,
    value,
  };
}

function parseTabOrWhitespaceLine(line: string): CookieEntry | null {
  if (!line.trim() || line.trim().startsWith("#")) {
    return null;
  }

  const tabFields = line.split("\t");
  const fromTabs = parseCookieEntry(tabFields);
  if (fromTabs) {
    return fromTabs;
  }

  const compactFields = line.trim().split(/\s+/);
  return parseCookieEntry(compactFields);
}

function renderCookieEntry(entry: CookieEntry): string {
  return [
    entry.domain,
    entry.includeSubdomains ? "TRUE" : "FALSE",
    entry.path,
    entry.secure ? "TRUE" : "FALSE",
    String(entry.expires),
    entry.name,
    entry.value,
  ].join("\t");
}

export function normalizeCookieFile(rawValue: string): NormalizedCookieBundle {
  const normalizedInput = normalizeNewlines(rawValue).trim();
  if (!normalizedInput) {
    return { normalized: "", entries: [], warnings: ["Cookies input is empty"] };
  }

  const lines = normalizedInput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const dataLines = lines.filter((line) => !line.startsWith("#"));
  const parsedEntries: CookieEntry[] = [];
  const warnings: string[] = [];

  for (const line of dataLines) {
    const parsed = parseTabOrWhitespaceLine(line);
    if (parsed) {
      parsedEntries.push(parsed);
    }
  }

  if (parsedEntries.length === 0 && dataLines.length >= 7) {
    for (let index = 0; index < dataLines.length; index += 7) {
      const slice = dataLines.slice(index, index + 7);
      if (slice.length < 7) {
        warnings.push("Ignored trailing cookie fields that did not complete a 7-line Netscape record.");
        break;
      }

      const parsed = parseCookieEntry(slice);
      if (parsed) {
        parsedEntries.push(parsed);
      } else {
        warnings.push(`Ignored invalid 7-line cookie record starting with "${slice[0]}".`);
      }
    }
  } else if (parsedEntries.length < dataLines.length) {
    warnings.push("Some cookie lines could not be parsed and were ignored.");
  }

  const deduped = new Map<string, CookieEntry>();
  for (const entry of parsedEntries) {
    const key = `${entry.domain}\t${entry.path}\t${entry.name}`;
    deduped.set(key, entry);
  }

  const entries = Array.from(deduped.values());
  const normalized = entries.length > 0
    ? `${COOKIE_HEADER_LINES.join("\n")}\n\n${entries.map(renderCookieEntry).join("\n")}`
    : "";

  if (entries.length === 0) {
    warnings.push("No valid Netscape cookie records were found.");
  }

  return {
    normalized,
    entries,
    warnings,
  };
}

export function summarizeCookieFile(rawValue: string | null | undefined, updatedAt: string | null | undefined, purpose: "youtube" | "google_photos"): CookieSummary {
  const source = typeof rawValue === "string" ? rawValue : "";
  const normalized = normalizeCookieFile(source);
  const entries = normalized.entries;
  const domains = Array.from(new Set(entries.map((entry) => entry.domain))).sort();
  const sessionCookieCount = entries.filter((entry) => entry.expires === 0).length;
  const nonSessionEntries = entries.filter((entry) => entry.expires > 0);
  const cookieNames = Array.from(new Set(entries.map((entry) => entry.name)));
  const missingYouTubeNames = purpose === "youtube"
    ? YOUTUBE_RECOMMENDED_COOKIE_NAMES.filter((name) => !cookieNames.includes(name))
    : [];
  const hasYouTubeDomain = entries.some((entry) => /(^|\.)youtube\.com$/i.test(entry.domain));
  const hasGoogleAuthDomain = entries.some((entry) => /(^|\.)google\.com$|(^|\.)accounts\.google\.com$/i.test(entry.domain));

  const warnings = [...normalized.warnings];
  if (purpose === "youtube" && entries.length > 0 && missingYouTubeNames.length > 0) {
    warnings.push(`Missing recommended YouTube auth cookies: ${missingYouTubeNames.join(", ")}`);
  }

  if (purpose === "youtube" && entries.length > 0 && !hasYouTubeDomain) {
    warnings.push("Stored cookies do not appear to include youtube.com domains.");
  }

  if (purpose === "youtube" && entries.length > 0 && !hasGoogleAuthDomain) {
    warnings.push("Stored cookies do not include google.com/accounts.google.com auth domains. This often means the export is partial and may fail on GitHub Actions.");
  }

  return {
    present: entries.length > 0,
    cookie_count: entries.length,
    session_cookie_count: sessionCookieCount,
    domains,
    sample_cookie_names: cookieNames.slice(0, 12),
    updated_at: updatedAt || null,
    earliest_expiry: nonSessionEntries.length > 0 ? new Date(Math.min(...nonSessionEntries.map((entry) => entry.expires)) * 1000).toISOString() : null,
    latest_expiry: nonSessionEntries.length > 0 ? new Date(Math.max(...nonSessionEntries.map((entry) => entry.expires)) * 1000).toISOString() : null,
    youtube_auth_likely: purpose === "youtube" ? (missingYouTubeNames.length <= 1 && hasYouTubeDomain && hasGoogleAuthDomain) : entries.length > 0,
    missing_recommended_youtube_cookies: missingYouTubeNames,
    warnings,
  };
}


export function buildCookieUploadDiagnostics(rawValue: string, purpose: "youtube" | "google_photos", fileName: string): CookieSummary & { file_name: string; uploaded_at: string; fingerprint: string; critical_warnings: string[] } {
  const normalized = normalizeCookieFile(rawValue);
  const summary = summarizeCookieFile(normalized.normalized || rawValue, new Date().toISOString(), purpose);
  const criticalWarnings: string[] = [];
  const nowSeconds = Math.floor(Date.now() / 1000);
  const entries = normalized.entries;
  if (entries.length === 0) criticalWarnings.push("No valid cookie records found in uploaded file.");
  const nonSession = entries.filter((entry) => entry.expires > 0);
  const expired = nonSession.filter((entry) => entry.expires <= nowSeconds);
  if (nonSession.length > 0 && expired.length === nonSession.length) criticalWarnings.push("All persistent cookies in this file are expired.");
  if (purpose === "youtube" && !summary.youtube_auth_likely) criticalWarnings.push("YouTube auth cookies look incomplete. Export from a signed-in YouTube browser session, not an incognito/logged-out session.");
  const hashInput = `${fileName}\n${normalized.normalized || rawValue}`;
  let hash = 0;
  for (let index = 0; index < hashInput.length; index += 1) hash = (Math.imul(31, hash) + hashInput.charCodeAt(index)) | 0;
  return { ...summary, file_name: fileName, uploaded_at: new Date().toISOString(), fingerprint: Math.abs(hash).toString(16).padStart(8, "0"), critical_warnings: criticalWarnings };
}
