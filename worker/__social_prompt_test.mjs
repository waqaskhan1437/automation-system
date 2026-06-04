// Throwaway harness: extract the pure social-prompt builders from ai.ts and
// verify the generated prompt string (no network/provider, no node types).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let src = fs.readFileSync(path.join(__dirname, "src/services/ai.ts"), "utf8");

// Grab the spec table + helpers + buildSocialPrompt (TS types stripped manually).
function slice(from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert(a !== -1 && b !== -1 && b > a, `cannot locate ${from}`);
  return src.slice(a, b);
}

let block =
  slice("const PLATFORM_CONTENT_SPECS", "interface PromptPlanSegmentResult") +
  "\n" +
  slice("function buildSocialPrompt", "function buildShortPromptPlanMessages");

// Strip TS type annotations that break plain JS eval.
block = block
  .replace(/const PLATFORM_CONTENT_SPECS: Record<string, PlatformContentSpec> =/, "const PLATFORM_CONTENT_SPECS =")
  .replace(/function getPlatformContentSpec\(platform: string\): PlatformContentSpec/, "function getPlatformContentSpec(platform)")
  .replace(/function truncateTitleToChars\(title: string, maxChars: number\): string/, "function truncateTitleToChars(title, maxChars)")
  .replace(/function buildSocialPrompt\(\{ topic, platform, count, focusKeyword, brief \}: GenerateSocialInput\): GenerationMessages/, "function buildSocialPrompt({ topic, platform, count, focusKeyword, brief })")
  .replace(/const lines: string\[\] =/, "const lines =");

const factory = new Function(block + "\nreturn { buildSocialPrompt, getPlatformContentSpec, truncateTitleToChars };");
const { buildSocialPrompt, truncateTitleToChars } = factory();

// --- YouTube with keyword + brief ---
const yt = buildSocialPrompt({ topic: "home workouts", platform: "youtube", count: 3, focusKeyword: "home workout", brief: "for absolute beginners, no equipment" });
const u = yt.user;
console.log("--- YOUTUBE USER PROMPT ---\n" + u + "\n");

const checks = {
  hasPlatform: u.includes("youtube"),
  hasKeyword2x: u.includes("exactly TWICE"),
  hasWordTarget: /Target 150-350 words/.test(u),
  hasTitleCap: /at most 100 characters/.test(u),
  hasBrief: u.includes("for absolute beginners"),
  notShort: !u.includes("should be short"),
  systemBroad: /think broadly|Think broadly/i.test(yt.system),
};

// --- TikTok shorter target ---
const tt = buildSocialPrompt({ topic: "x", platform: "tiktok", count: 2 });
checks.tiktokWords = /Target 30-100 words/.test(tt.user);
checks.tiktokTitleCap = /at most 150 characters/.test(tt.user);
// no keyword => no TWICE instruction
checks.noKeywordNoTwice = !tt.user.includes("exactly TWICE");

// --- title truncation ---
const longTitle = "This is an extremely long title that goes well beyond the youtube hundred character limit for sure yes it does";
const cut = truncateTitleToChars(longTitle, 100);
checks.truncatesTitle = cut.length <= 100 && !cut.endsWith(" ");

let pass = 0, fail = 0;
for (const [k, v] of Object.entries(checks)) {
  if (v) { pass++; console.log("  ✓", k); }
  else { fail++; console.error("  ✗", k); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
