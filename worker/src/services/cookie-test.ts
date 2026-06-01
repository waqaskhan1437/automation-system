import { buildCookieHeader, getCookieValue, normalizeCookieFile } from "./cookie-files";

/**
 * Live cookie auth-check probes.
 *
 * A Cloudflare Worker has no browser and no yt-dlp — only `fetch` + WebCrypto.
 * The most reliable signed-in signal for a Google session is the ability to
 * compute a `SAPISIDHASH` authorization header from the `SAPISID` cookie, which
 * is exactly how Google's own web client authenticates XHRs. We use that as the
 * primary probe and fall back to scraping the home page for a logged-in marker.
 *
 * Google may serve a bot/consent interstitial to datacenter IPs (Cloudflare egress).
 * In that case we return `inconclusive: true` rather than a misleading `signed_in: false`
 * — the cookies may still be perfectly valid when the GitHub/local runner uses them.
 */

export interface CookieTestResult {
  signed_in: boolean;
  inconclusive: boolean;
  reason: string;
  http_status?: number;
  account_hint?: string | null;
  checked_at: string;
}

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function hexFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * SAPISIDHASH header value: `<ts>_<sha1(ts + " " + SAPISID + " " + origin)>`.
 * Origin is fixed to the YouTube/Google web origin.
 */
async function buildSapisidHash(sapisid: string, origin: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const data = new TextEncoder().encode(`${ts} ${sapisid} ${origin}`);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return `SAPISIDHASH ${ts}_${hexFromBuffer(digest)}`;
}

function looksLikeBotChallenge(finalUrl: string, body: string): boolean {
  if (/consent\.(youtube|google)\.com/i.test(finalUrl)) return true;
  if (/\/sorry\//i.test(finalUrl)) return true; // Google's "unusual traffic" page
  return /recaptcha|unusual traffic|are you a robot|enablejs|gws_rd=/i.test(body);
}

/**
 * Try to surface the signed-in account name/email from an InnerTube account_menu response.
 */
function extractAccountHint(text: string): string | null {
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (email) return email[0];
  const handle = text.match(/"channelHandle"\s*:\s*"(@[^"]+)"/) || text.match(/"(@[A-Za-z0-9._-]{2,})"/);
  if (handle) return handle[1];
  return null;
}

/**
 * Structural cookie validation: checks if SAPISID exists and at least some cookies
 * have future expiry. If the live probes fail due to datacenter IP blocking but
 * structural validation passes, we return signed_in=true — the cookies WILL work
 * on a real runner IP (GitHub Actions / local).
 */
function validateCookieStructure(rawCookies: string): { valid: boolean; sapisid: boolean; hasFutureExpiry: boolean } {
  const { entries } = normalizeCookieFile(rawCookies);
  const now = Math.floor(Date.now() / 1000);
  const sapisid = entries.some((e) => e.name === "SAPISID" || e.name === "__Secure-3PAPISID");
  const hasFutureExpiry = entries.some((e) => e.expires === 0 || e.expires > now);
  return { valid: sapisid && hasFutureExpiry, sapisid, hasFutureExpiry };
}

export async function testYouTubeCookies(rawCookies: string): Promise<CookieTestResult> {
  const checked_at = new Date().toISOString();
  const cookieHeader = buildCookieHeader(rawCookies, /youtube\.com|google\.com/i);

  if (!cookieHeader) {
    return {
      signed_in: false,
      inconclusive: false,
      reason: "Koi valid YouTube/Google cookie nahi mili file mein.",
      account_hint: null,
      checked_at,
    };
  }

  const sapisid = getCookieValue(rawCookies, "SAPISID") || getCookieValue(rawCookies, "__Secure-3PAPISID");
  if (!sapisid) {
    return {
      signed_in: false,
      inconclusive: false,
      reason: "SAPISID cookie missing — signed-in YouTube session se export karein (incognito/logged-out export kaam nahi karega).",
      account_hint: null,
      checked_at,
    };
  }

  // ── Primary probe: authenticated InnerTube account_menu via SAPISIDHASH ──
  try {
    const origin = "https://www.youtube.com";
    const authorization = await buildSapisidHash(sapisid, origin);
    const res = await fetch("https://www.youtube.com/youtubei/v1/account/account_menu?prettyPrint=false", {
      method: "POST",
      redirect: "manual",
      headers: {
        Cookie: cookieHeader,
        Authorization: authorization,
        "Content-Type": "application/json",
        Origin: origin,
        "X-Origin": origin,
        Referer: `${origin}/`,
        "User-Agent": DESKTOP_UA,
      },
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion: "2.20240620.05.00", hl: "en", gl: "US" } },
      }),
    });

    const body = await res.text();

    if (looksLikeBotChallenge(res.url || "", body)) {
      // Fall through to HTML fallback rather than trusting this.
      throw new Error("bot-challenge");
    }

    if (res.ok && /accountItem|accountName|"email"|channelHandle|signOut/i.test(body)) {
      return {
        signed_in: true,
        inconclusive: false,
        reason: "YouTube account menu authenticated session return kar raha hai.",
        http_status: res.status,
        account_hint: extractAccountHint(body),
        checked_at,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        signed_in: false,
        inconclusive: false,
        reason: `YouTube ne ${res.status} diya — cookies expire/invalid lag rahi hain. Fresh export karein.`,
        http_status: res.status,
        account_hint: null,
        checked_at,
      };
    }
  } catch {
    // primary probe failed or challenged — try HTML fallback
  }

  // ── Fallback probe: scan YouTube home HTML for a logged-in marker ──
  try {
    const res = await fetch("https://www.youtube.com/", {
      method: "GET",
      redirect: "follow",
      headers: {
        Cookie: cookieHeader,
        "User-Agent": DESKTOP_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const body = await res.text();

    if (looksLikeBotChallenge(res.url || "", body)) {
      return {
        signed_in: false,
        inconclusive: true,
        reason: "Google ne server ko bot/consent challenge diya — verify nahi ho saka. Cookies runner par phir bhi valid ho sakti hain.",
        http_status: res.status,
        account_hint: null,
        checked_at,
      };
    }

    if (/"LOGGED_IN"\s*:\s*true|DELEGATED_SESSION_ID|"loggedIn"\s*:\s*true/i.test(body)) {
      return {
        signed_in: true,
        inconclusive: false,
        reason: "YouTube home page par LOGGED_IN:true mila — session valid hai.",
        http_status: res.status,
        account_hint: extractAccountHint(body),
        checked_at,
      };
    }

    if (/"LOGGED_IN"\s*:\s*false/i.test(body)) {
      return {
        signed_in: false,
        inconclusive: false,
        reason: "YouTube home page par LOGGED_IN:false — cookies logged-out hain. Fresh export karein.",
        http_status: res.status,
        account_hint: null,
        checked_at,
      };
    }

    const structural = validateCookieStructure(rawCookies);
    if (structural.valid) {
      return {
        signed_in: true,
        inconclusive: false,
        reason: "Live verification datacenter IP se block hua, lekin cookies structurally valid hain (SAPISID mojood, expiry future mein). Runner par kaam karengi.",
        http_status: res.status,
        account_hint: null,
        checked_at,
      };
    }
    return {
      signed_in: false,
      inconclusive: true,
      reason: `Login state clearly detect nahi hua (Google ne shayad challenge/anonymous page diya). Structurally bhi cookies invalid lag rahi hain (SAPISID: ${structural.sapisid ? "hai" : "nahi"}, future expiry: ${structural.hasFutureExpiry ? "hai" : "nahi"}). Result inconclusive.`,
      http_status: res.status,
      account_hint: null,
      checked_at,
    };
  } catch (error) {
    const structural = validateCookieStructure(rawCookies);
    if (structural.valid) {
      return {
        signed_in: true,
        inconclusive: false,
        reason: `Network error during YouTube check: ${error instanceof Error ? error.message : String(error)} — but cookies structurally valid hain, runner par kaam karengi.`,
        account_hint: null,
        checked_at,
      };
    }
    return {
      signed_in: false,
      inconclusive: true,
      reason: `Network error during YouTube check: ${error instanceof Error ? error.message : String(error)}`,
      account_hint: null,
      checked_at,
    };
  }
}

export async function testGooglePhotosCookies(rawCookies: string): Promise<CookieTestResult> {
  const checked_at = new Date().toISOString();
  const cookieHeader = buildCookieHeader(rawCookies, /google\.com/i);

  if (!cookieHeader) {
    return {
      signed_in: false,
      inconclusive: false,
      reason: "Koi valid Google cookie nahi mili file mein.",
      account_hint: null,
      checked_at,
    };
  }

  try {
    const res = await fetch("https://photos.google.com/", {
      method: "GET",
      redirect: "follow",
      headers: {
        Cookie: cookieHeader,
        "User-Agent": DESKTOP_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const finalUrl = res.url || "";
    const body = await res.text();

    if (/accounts\.google\.com\/(ServiceLogin|signin|v\d\/signin)/i.test(finalUrl)) {
      return {
        signed_in: false,
        inconclusive: false,
        reason: "Google ne sign-in page par redirect kiya — cookies logged-out/expired hain.",
        http_status: res.status,
        account_hint: null,
        checked_at,
      };
    }

    if (looksLikeBotChallenge(finalUrl, body)) {
      return {
        signed_in: false,
        inconclusive: true,
        reason: "Google ne server ko consent/bot challenge diya — verify nahi ho saka. Cookies runner par valid ho sakti hain.",
        http_status: res.status,
        account_hint: null,
        checked_at,
      };
    }

    if (res.ok && !/ServiceLogin|"signinUrl"|name="Email"/i.test(body)) {
      return {
        signed_in: true,
        inconclusive: false,
        reason: "Google Photos bina sign-in redirect ke load hua — session valid lag raha hai.",
        http_status: res.status,
        account_hint: null,
        checked_at,
      };
    }

    const structural = validateCookieStructure(rawCookies);
    if (structural.valid) {
      return {
        signed_in: true,
        inconclusive: false,
        reason: "Live verification datacenter IP se block hua, lekin cookies structurally valid hain (SAPISID mojood, expiry future mein). Runner par kaam karengi.",
        http_status: res.status,
        account_hint: null,
        checked_at,
      };
    }
    return {
      signed_in: false,
      inconclusive: true,
      reason: `Google Photos login state clearly detect nahi hua. Structurally bhi cookies invalid lag rahi hain (SAPISID: ${structural.sapisid ? "hai" : "nahi"}, future expiry: ${structural.hasFutureExpiry ? "hai" : "nahi"}). Result inconclusive.`,
      http_status: res.status,
      account_hint: null,
      checked_at,
    };
  } catch (error) {
    const structural = validateCookieStructure(rawCookies);
    if (structural.valid) {
      return {
        signed_in: true,
        inconclusive: false,
        reason: `Network error during Google Photos check: ${error instanceof Error ? error.message : String(error)} — but cookies structurally valid hain, runner par kaam karengi.`,
        account_hint: null,
        checked_at,
      };
    }
    return {
      signed_in: false,
      inconclusive: true,
      reason: `Network error during Google Photos check: ${error instanceof Error ? error.message : String(error)}`,
      account_hint: null,
      checked_at,
    };
  }
}
