function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeDomain(url) {
  if (!url) {
    return "";
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function formatSteps(steps) {
  return (Array.isArray(steps) ? steps : [])
    .slice(0, 3)
    .map((step, index) => `
      <div class="step-badge">
        <span class="step-num">${index + 1}</span>
        <span class="step-label">${escapeHtml(step)}</span>
      </div>
    `)
    .join("");
}

// --- Theme palettes ---

const THEME_PALETTES = {
  love:        { bg: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)", accent: "#e11d48", accentLight: "#ffe4e6", secondary: "#fb7185", text: "#9f1239" },
  couple:      { bg: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)", accent: "#ec4899", accentLight: "#fce7f3", secondary: "#f472b6", text: "#9d174d" },
  mom:         { bg: "linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)", accent: "#a855f7", accentLight: "#f3e8ff", secondary: "#c084fc", text: "#7e22ce" },
  family:      { bg: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)", accent: "#f97316", accentLight: "#ffedd5", secondary: "#fb923c", text: "#c2410c" },
  birthday:    { bg: "linear-gradient(135deg, #fefce8 0%, #fef08a44 100%)", accent: "#eab308", accentLight: "#fef9c3", secondary: "#facc15", text: "#a16207" },
  celebration: { bg: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)", accent: "#ec4899", accentLight: "#fce7f3", secondary: "#f472b6", text: "#9d174d" },
  friendship:  { bg: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)", accent: "#10b981", accentLight: "#d1fae5", secondary: "#34d399", text: "#065f46" },
  nature:      { bg: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)", accent: "#22c55e", accentLight: "#dcfce7", secondary: "#4ade80", text: "#166534" },
  music:       { bg: "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)", accent: "#8b5cf6", accentLight: "#ede9fe", secondary: "#a78bfa", text: "#5b21b6" },
  food:        { bg: "linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)", accent: "#f59e0b", accentLight: "#fef3c7", secondary: "#fbbf24", text: "#92400e" },
  travel:      { bg: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", accent: "#3b82f6", accentLight: "#dbeafe", secondary: "#60a5fa", text: "#1e40af" },
  fitness:     { bg: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)", accent: "#ef4444", accentLight: "#fee2e2", secondary: "#f87171", text: "#991b1b" },
  product:     { bg: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)", accent: "#7c3aed", accentLight: "#ede9fe", secondary: "#a78bfa", text: "#5b21b6" },
  steps:       { bg: "linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)", accent: "#0d9488", accentLight: "#ccfbf1", secondary: "#2dd4bf", text: "#134e4a" },
  generic:     { bg: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)", accent: "#0d9488", accentLight: "#ccfbf1", secondary: "#2dd4bf", text: "#134e4a" },
};

// --- Contextual illustration detection ---

function resolveIllustration(spec) {
  const hint = String(spec.illustration_hint || "").toLowerCase();
  if (THEME_PALETTES[hint]) return hint;

  const format = String(spec.format || "").toLowerCase();
  if (format === "personalized_video") return "travel";
  if (format === "product_info") return "product";
  if (format === "three_step_offer") return "steps";

  const haystack = [
    spec.headline, spec.accent_label, spec.cta,
    spec.supporting_text, spec.brand_name
  ].join(" ").toLowerCase();

  if (/love|romance|valentine|heart|darling|soulmate/.test(haystack)) return "love";
  if (/couple|partner|together|duo|pair|husband|wife|boyfriend|girlfriend/.test(haystack)) return "couple";
  if (/mom|mother|mommy|mama|maternal|motherhood|mom's|mothers/.test(haystack)) return "mom";
  if (/family|dad|father|parent|child|kid|son|daughter|sibling|brother|sister/.test(haystack)) return "family";
  if (/birthday|bday|cake|candle|wish|anniversary|milestone/.test(haystack)) return "birthday";
  if (/celebrat|party|fest|festival|diwali|eid|christmas|holi|new year|congrat/.test(haystack)) return "celebration";
  if (/friend|friendship|buddy|bestie|pal|mate|galentine/.test(haystack)) return "friendship";
  if (/nature|garden|flower|spring|bloom|tree|leaf|outdoor|park|mountain|river/.test(haystack)) return "nature";
  if (/music|song|melody|beat|rhythm|dance|dj|playlist|tune|concert/.test(haystack)) return "music";
  if (/food|recipe|cook|kitchen|meal|dish|chef|eat|dinner|lunch|breakfast|snack|bake/.test(haystack)) return "food";
  if (/travel|trip|journey|adventure|explore|vacation|holiday|flight|destination|wanderlust/.test(haystack)) return "travel";
  if (/fitness|gym|workout|exercise|health|yoga|run|sport|train|strength|muscle/.test(haystack)) return "fitness";
  if (/gift|present|surprise|reward|bonus|deal|offer|discount|sale/.test(haystack)) return "food";

  return "generic";
}

// --- 2D CSS Illustrations ---

function buildIllustration(type, isLandscape) {
  const s = isLandscape ? 0.85 : 1;
  const scale = (v) => Math.round(v * s);
  const palette = THEME_PALETTES[type] || THEME_PALETTES.generic;

  switch (type) {

    // ===== LOVE — Heart with sparkles =====
    case "love":
      return `
        <!-- Heart body -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-55%);width:${scale(160)}px;height:${scale(150)}px;">
          <div style="position:absolute;left:0;top:0;width:${scale(80)}px;height:${scale(120)}px;background:${palette.accent};border-radius:${scale(80)}px ${scale(80)}px 0 0;transform:rotate(-45deg);transform-origin:bottom right;box-shadow:0 ${scale(8)}px ${scale(30)}px rgba(225,29,72,0.3);"></div>
          <div style="position:absolute;right:0;top:0;width:${scale(80)}px;height:${scale(120)}px;background:${palette.accent};border-radius:${scale(80)}px ${scale(80)}px 0 0;transform:rotate(45deg);transform-origin:bottom left;box-shadow:0 ${scale(8)}px ${scale(30)}px rgba(225,29,72,0.3);"></div>
        </div>
        <!-- Small heart top-left -->
        <div style="position:absolute;top:${scale(30)}px;left:${scale(30)}px;width:${scale(30)}px;height:${scale(28)}px;opacity:0.35;">
          <div style="position:absolute;left:0;width:${scale(15)}px;height:${scale(22)}px;background:${palette.secondary};border-radius:${scale(15)}px ${scale(15)}px 0 0;transform:rotate(-45deg);transform-origin:bottom right;"></div>
          <div style="position:absolute;right:0;width:${scale(15)}px;height:${scale(22)}px;background:${palette.secondary};border-radius:${scale(15)}px ${scale(15)}px 0 0;transform:rotate(45deg);transform-origin:bottom left;"></div>
        </div>
        <!-- Small heart top-right -->
        <div style="position:absolute;top:${scale(50)}px;right:${scale(25)}px;width:${scale(22)}px;height:${scale(20)}px;opacity:0.25;">
          <div style="position:absolute;left:0;width:${scale(11)}px;height:${scale(16)}px;background:${palette.accent};border-radius:${scale(11)}px ${scale(11)}px 0 0;transform:rotate(-45deg);transform-origin:bottom right;"></div>
          <div style="position:absolute;right:0;width:${scale(11)}px;height:${scale(16)}px;background:${palette.accent};border-radius:${scale(11)}px ${scale(11)}px 0 0;transform:rotate(45deg);transform-origin:bottom left;"></div>
        </div>
        <!-- Sparkle dots -->
        <div style="position:absolute;top:${scale(20)}px;left:50%;transform:translateX(-50%);width:${scale(8)}px;height:${scale(8)}px;background:${palette.accent};border-radius:50%;opacity:0.5;"></div>
        <div style="position:absolute;bottom:${scale(40)}px;left:${scale(40)}px;width:${scale(6)}px;height:${scale(6)}px;background:${palette.secondary};border-radius:50%;opacity:0.4;"></div>
        <div style="position:absolute;bottom:${scale(50)}px;right:${scale(35)}px;width:${scale(5)}px;height:${scale(5)}px;background:${palette.accent};border-radius:50%;opacity:0.3;"></div>
      `;

    // ===== COUPLE — Two 2D people standing together =====
    case "couple":
      return `
        <!-- Person 1 (left) — head -->
        <div style="position:absolute;top:${scale(50)}px;left:calc(50% - ${scale(70)}px);width:${scale(44)}px;height:${scale(44)}px;background:${palette.accent};border-radius:50%;box-shadow:0 ${scale(4)}px ${scale(12)}px rgba(236,72,153,0.2);"></div>
        <!-- Person 1 — body -->
        <div style="position:absolute;top:${scale(100)}px;left:calc(50% - ${scale(66)}px);width:${scale(36)}px;height:${scale(80)}px;background:${palette.accent};border-radius:${scale(18)}px ${scale(18)}px ${scale(10)}px ${scale(10)}px;"></div>
        <!-- Person 1 — arm reaching right -->
        <div style="position:absolute;top:${scale(120)}px;left:calc(50% - ${scale(32)}px);width:${scale(36)}px;height:${scale(12)}px;background:${palette.accent};border-radius:${scale(6)}px;"></div>
        <!-- Person 2 (right) — head -->
        <div style="position:absolute;top:${scale(55)}px;left:calc(50% + ${scale(26)}px);width:${scale(40)}px;height:${scale(40)}px;background:${palette.secondary};border-radius:50%;box-shadow:0 ${scale(4)}px ${scale(12)}px rgba(244,114,182,0.2);"></div>
        <!-- Person 2 — body -->
        <div style="position:absolute;top:${scale(102)}px;left:calc(50% + ${scale(30)}px);width:${scale(32)}px;height:${scale(72)}px;background:${palette.secondary};border-radius:${scale(16)}px ${scale(16)}px ${scale(8)}px ${scale(8)}px;"></div>
        <!-- Person 2 — arm reaching left -->
        <div style="position:absolute;top:${scale(118)}px;left:calc(50% - ${scale(4)}px);width:${scale(36)}px;height:${scale(12)}px;background:${palette.secondary};border-radius:${scale(6)}px;"></div>
        <!-- Heart between them -->
        <div style="position:absolute;top:${scale(80)}px;left:50%;transform:translateX(-50%);width:${scale(24)}px;height:${scale(22)}px;">
          <div style="position:absolute;left:0;width:${scale(12)}px;height:${scale(18)}px;background:#e11d48;border-radius:${scale(12)}px ${scale(12)}px 0 0;transform:rotate(-45deg);transform-origin:bottom right;"></div>
          <div style="position:absolute;right:0;width:${scale(12)}px;height:${scale(18)}px;background:#e11d48;border-radius:${scale(12)}px ${scale(12)}px 0 0;transform:rotate(45deg);transform-origin:bottom left;"></div>
        </div>
        <!-- Decorative dots -->
        <div style="position:absolute;top:${scale(25)}px;left:${scale(20)}px;width:${scale(8)}px;height:${scale(8)}px;background:${palette.accent};border-radius:50%;opacity:0.3;"></div>
        <div style="position:absolute;top:${scale(35)}px;right:${scale(15)}px;width:${scale(6)}px;height:${scale(6)}px;background:${palette.secondary};border-radius:50%;opacity:0.25;"></div>
        <div style="position:absolute;bottom:${scale(30)}px;left:50%;transform:translateX(-50%);width:${scale(10)}px;height:${scale(10)}px;background:${palette.accent};border-radius:50%;opacity:0.15;"></div>
      `;

    // ===== MOM — Mother with child 2D =====
    case "mom":
      return `
        <!-- Mom — head -->
        <div style="position:absolute;top:${scale(40)}px;left:calc(50% - ${scale(50)}px);width:${scale(52)}px;height:${scale(52)}px;background:${palette.accent};border-radius:50%;box-shadow:0 ${scale(4)}px ${scale(16)}px rgba(168,85,247,0.25);"></div>
        <!-- Mom — hair -->
        <div style="position:absolute;top:${scale(32)}px;left:calc(50% - ${scale(48)}px);width:${scale(48)}px;height:${scale(28)}px;background:${palette.text};border-radius:${scale(24)}px ${scale(24)}px 0 0;opacity:0.7;"></div>
        <!-- Mom — body (dress) -->
        <div style="position:absolute;top:${scale(98)}px;left:calc(50% - ${scale(62)}px);width:${scale(68)}px;height:${scale(100)}px;background:${palette.accent};border-radius:${scale(34)}px ${scale(34)}px ${scale(10)}px ${scale(10)}px;"></div>
        <!-- Mom — arm hugging -->
        <div style="position:absolute;top:${scale(120)}px;left:calc(50% + ${scale(8)}px);width:${scale(40)}px;height:${scale(14)}px;background:${palette.accent};border-radius:${scale(7)}px;transform:rotate(15deg);"></div>
        <!-- Child — head -->
        <div style="position:absolute;top:${scale(90)}px;left:calc(50% + ${scale(20)}px);width:${scale(36)}px;height:${scale(36)}px;background:${palette.secondary};border-radius:50%;box-shadow:0 ${scale(3)}px ${scale(10)}px rgba(192,132,252,0.2);"></div>
        <!-- Child — body -->
        <div style="position:absolute;top:${scale(132)}px;left:calc(50% + ${scale(24)}px);width:${scale(28)}px;height:${scale(56)}px;background:${palette.secondary};border-radius:${scale(14)}px ${scale(14)}px ${scale(6)}px ${scale(6)}px;"></div>
        <!-- Heart above -->
        <div style="position:absolute;top:${scale(15)}px;left:50%;transform:translateX(-50%);width:${scale(28)}px;height:${scale(26)}px;">
          <div style="position:absolute;left:0;width:${scale(14)}px;height:${scale(20)}px;background:#e11d48;border-radius:${scale(14)}px ${scale(14)}px 0 0;transform:rotate(-45deg);transform-origin:bottom right;"></div>
          <div style="position:absolute;right:0;width:${scale(14)}px;height:${scale(20)}px;background:#e11d48;border-radius:${scale(14)}px ${scale(14)}px 0 0;transform:rotate(45deg);transform-origin:bottom left;"></div>
        </div>
        <!-- Flower -->
        <div style="position:absolute;bottom:${scale(30)}px;left:${scale(25)}px;width:${scale(16)}px;height:${scale(16)}px;background:${palette.secondary};border-radius:50%;opacity:0.4;"></div>
        <div style="position:absolute;bottom:${scale(25)}px;left:calc(${scale(25)}px + ${scale(6)}px);width:${scale(4)}px;height:${scale(20)}px;background:${palette.text};opacity:0.2;border-radius:${scale(2)}px;"></div>
      `;

    // ===== FAMILY — 3-4 people 2D =====
    case "family":
      return `
        <!-- Dad — head -->
        <div style="position:absolute;top:${scale(45)}px;left:calc(50% - ${scale(80)}px);width:${scale(40)}px;height:${scale(40)}px;background:${palette.accent};border-radius:50%;"></div>
        <!-- Dad — body -->
        <div style="position:absolute;top:${scale(90)}px;left:calc(50% - ${scale(76)}px);width:${scale(32)}px;height:${scale(70)}px;background:${palette.accent};border-radius:${scale(16)}px ${scale(16)}px ${scale(8)}px ${scale(8)}px;"></div>
        <!-- Mom — head -->
        <div style="position:absolute;top:${scale(50)}px;left:calc(50% - ${scale(20)}px);width:${scale(38)}px;height:${scale(38)}px;background:${palette.secondary};border-radius:50%;"></div>
        <!-- Mom — body -->
        <div style="position:absolute;top:${scale(94)}px;left:calc(50% - ${scale(16)}px);width:${scale(30)}px;height:${scale(66)}px;background:${palette.secondary};border-radius:${scale(15)}px ${scale(15)}px ${scale(6)}px ${scale(6)}px;"></div>
        <!-- Child 1 — head -->
        <div style="position:absolute;top:${scale(80)}px;left:calc(50% + ${scale(25)}px);width:${scale(28)}px;height:${scale(28)}px;background:${palette.accent};border-radius:50%;opacity:0.8;"></div>
        <!-- Child 1 — body -->
        <div style="position:absolute;top:${scale(112)}px;left:calc(50% + ${scale(28)}px);width:${scale(22)}px;height:${scale(44)}px;background:${palette.accent};border-radius:${scale(11)}px ${scale(11)}px ${scale(4)}px ${scale(4)}px;opacity:0.8;"></div>
        <!-- Child 2 — head -->
        <div style="position:absolute;top:${scale(90)}px;left:calc(50% + ${scale(58)}px);width:${scale(24)}px;height:${scale(24)}px;background:${palette.secondary};border-radius:50%;opacity:0.7;"></div>
        <!-- Child 2 — body -->
        <div style="position:absolute;top:${scale(118)}px;left:calc(50% + ${scale(60)}px);width:${scale(20)}px;height:${scale(36)}px;background:${palette.secondary};border-radius:${scale(10)}px ${scale(10)}px ${scale(4)}px ${scale(4)}px;opacity:0.7;"></div>
        <!-- House roof -->
        <div style="position:absolute;top:${scale(10)}px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:${scale(60)}px solid transparent;border-right:${scale(60)}px solid transparent;border-bottom:${scale(30)}px solid ${palette.accent};opacity:0.15;"></div>
        <!-- Ground line -->
        <div style="position:absolute;bottom:${scale(25)}px;left:50%;transform:translateX(-50%);width:${scale(180)}px;height:${scale(3)}px;background:${palette.accent};border-radius:${scale(2)}px;opacity:0.15;"></div>
      `;

    // ===== BIRTHDAY — Cake with candles =====
    case "birthday":
      return `
        <!-- Cake base -->
        <div style="position:absolute;bottom:${scale(60)}px;left:50%;transform:translateX(-50%);width:${scale(180)}px;height:${scale(80)}px;background:${palette.accent};border-radius:${scale(12)}px;box-shadow:0 ${scale(6)}px ${scale(24)}px rgba(234,179,8,0.25);"></div>
        <!-- Cake middle layer -->
        <div style="position:absolute;bottom:${scale(120)}px;left:50%;transform:translateX(-50%);width:${scale(150)}px;height:${scale(60)}px;background:${palette.secondary};border-radius:${scale(10)}px;"></div>
        <!-- Cake top -->
        <div style="position:absolute;bottom:${scale(160)}px;left:50%;transform:translateX(-50%);width:${scale(120)}px;height:${scale(40)}px;background:${palette.accent};border-radius:${scale(8)}px;"></div>
        <!-- Frosting drips -->
        <div style="position:absolute;bottom:${scale(155)}px;left:calc(50% - ${scale(50)}px);width:${scale(16)}px;height:${scale(24)}px;background:white;border-radius:0 0 ${scale(8)}px ${scale(8)}px;opacity:0.7;"></div>
        <div style="position:absolute;bottom:${scale(155)}px;left:calc(50% + ${scale(20)}px);width:${scale(14)}px;height:${scale(20)}px;background:white;border-radius:0 0 ${scale(7)}px ${scale(7)}px;opacity:0.7;"></div>
        <div style="position:absolute;bottom:${scale(155)}px;left:calc(50% + ${scale(40)}px);width:${scale(12)}px;height:${scale(18)}px;background:white;border-radius:0 0 ${scale(6)}px ${scale(6)}px;opacity:0.7;"></div>
        <!-- Candle 1 -->
        <div style="position:absolute;bottom:${scale(196)}px;left:calc(50% - ${scale(20)}px);width:${scale(8)}px;height:${scale(36)}px;background:${palette.accent};border-radius:${scale(4)}px;"></div>
        <!-- Candle 2 -->
        <div style="position:absolute;bottom:${scale(196)}px;left:50%;transform:translateX(-50%);width:${scale(8)}px;height:${scale(36)}px;background:${palette.secondary};border-radius:${scale(4)}px;"></div>
        <!-- Candle 3 -->
        <div style="position:absolute;bottom:${scale(196)}px;left:calc(50% + ${scale(12)}px);width:${scale(8)}px;height:${scale(36)}px;background:${palette.accent};border-radius:${scale(4)}px;"></div>
        <!-- Flames -->
        <div style="position:absolute;bottom:${scale(228)}px;left:calc(50% - ${scale(22)}px);width:${scale(12)}px;height:${scale(16)}px;background:#f97316;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;"></div>
        <div style="position:absolute;bottom:${scale(228)}px;left:calc(50% - ${scale(6)}px);width:${scale(12)}px;height:${scale(16)}px;background:#f97316;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;"></div>
        <div style="position:absolute;bottom:${scale(228)}px;left:calc(50% + ${scale(10)}px);width:${scale(12)}px;height:${scale(16)}px;background:#f97316;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;"></div>
        <!-- Confetti -->
        <div style="position:absolute;top:${scale(20)}px;left:${scale(15)}px;width:${scale(10)}px;height:${scale(10)}px;background:${palette.accent};border-radius:50%;opacity:0.5;"></div>
        <div style="position:absolute;top:${scale(40)}px;right:${scale(20)}px;width:${scale(8)}px;height:${scale(14)}px;background:${palette.secondary};border-radius:${scale(4)}px;transform:rotate(30deg);opacity:0.4;"></div>
        <div style="position:absolute;top:${scale(15)}px;right:${scale(40)}px;width:${scale(12)}px;height:${scale(12)}px;background:#f97316;border-radius:50%;opacity:0.3;"></div>
      `;

    // ===== CELEBRATION — Party popper + confetti =====
    case "celebration":
      return `
        <!-- Party popper body -->
        <div style="position:absolute;bottom:${scale(80)}px;left:calc(50% - ${scale(30)}px);width:${scale(60)}px;height:${scale(120)}px;background:${palette.accent};border-radius:${scale(10)}px ${scale(10)}px ${scale(20)}px ${scale(20)}px;transform:rotate(-15deg);box-shadow:0 ${scale(6)}px ${scale(20)}px rgba(236,72,153,0.25);"></div>
        <!-- Popper top opening -->
        <div style="position:absolute;bottom:${scale(190)}px;left:calc(50% - ${scale(40)}px);width:${scale(80)}px;height:${scale(30)}px;background:${palette.secondary};border-radius:${scale(15)}px ${scale(15)}px 0 0;transform:rotate(-15deg);"></div>
        <!-- Confetti burst 1 -->
        <div style="position:absolute;top:${scale(20)}px;left:${scale(40)}px;width:${scale(14)}px;height:${scale(14)}px;background:${palette.accent};border-radius:50%;opacity:0.6;"></div>
        <!-- Confetti burst 2 -->
        <div style="position:absolute;top:${scale(35)}px;left:calc(50% + ${scale(10)}px);width:${scale(10)}px;height:${scale(16)}px;background:${palette.secondary};border-radius:${scale(5)}px;transform:rotate(45deg);opacity:0.5;"></div>
        <!-- Confetti burst 3 -->
        <div style="position:absolute;top:${scale(15)}px;right:${scale(30)}px;width:${scale(12)}px;height:${scale(12)}px;background:#fbbf24;border-radius:50%;opacity:0.5;"></div>
        <!-- Confetti burst 4 -->
        <div style="position:absolute;top:${scale(50)}px;left:${scale(20)}px;width:${scale(8)}px;height:${scale(20)}px;background:${palette.accent};border-radius:${scale(4)}px;transform:rotate(-30deg);opacity:0.4;"></div>
        <!-- Confetti burst 5 -->
        <div style="position:absolute;top:${scale(45)}px;right:${scale(15)}px;width:${scale(10)}px;height:${scale(10)}px;background:${palette.secondary};border-radius:50%;opacity:0.35;"></div>
        <!-- Star -->
        <div style="position:absolute;top:${scale(60)}px;left:50%;transform:translateX(-50%);width:${scale(20)}px;height:${scale(20)}px;background:#fbbf24;border-radius:50%;opacity:0.3;"></div>
        <!-- Streamer left -->
        <div style="position:absolute;top:${scale(70)}px;left:${scale(10)}px;width:${scale(6)}px;height:${scale(40)}px;background:${palette.accent};border-radius:${scale(3)}px;transform:rotate(20deg);opacity:0.3;"></div>
        <!-- Streamer right -->
        <div style="position:absolute;top:${scale(65)}px;right:${scale(10)}px;width:${scale(6)}px;height:${scale(35)}px;background:${palette.secondary};border-radius:${scale(3)}px;transform:rotate(-15deg);opacity:0.3;"></div>
      `;

    // ===== FRIENDSHIP — Two people high-five =====
    case "friendship":
      return `
        <!-- Person 1 — head -->
        <div style="position:absolute;top:${scale(50)}px;left:calc(50% - ${scale(70)}px);width:${scale(42)}px;height:${scale(42)}px;background:${palette.accent};border-radius:50%;"></div>
        <!-- Person 1 — body -->
        <div style="position:absolute;top:${scale(98)}px;left:calc(50% - ${scale(66)}px);width:${scale(34)}px;height:${scale(76)}px;background:${palette.accent};border-radius:${scale(17)}px ${scale(17)}px ${scale(8)}px ${scale(8)}px;"></div>
        <!-- Person 1 — arm up -->
        <div style="position:absolute;top:${scale(80)}px;left:calc(50% - ${scale(34)}px);width:${scale(12)}px;height:${scale(40)}px;background:${palette.accent};border-radius:${scale(6)}px;transform:rotate(-20deg);transform-origin:bottom center;"></div>
        <!-- Person 2 — head -->
        <div style="position:absolute;top:${scale(55)}px;left:calc(50% + ${scale(28)}px);width:${scale(38)}px;height:${scale(38)}px;background:${palette.secondary};border-radius:50%;"></div>
        <!-- Person 2 — body -->
        <div style="position:absolute;top:${scale(100)}px;left:calc(50% + ${scale(32)}px);width:${scale(30)}px;height:${scale(68)}px;background:${palette.secondary};border-radius:${scale(15)}px ${scale(15)}px ${scale(6)}px ${scale(6)}px;"></div>
        <!-- Person 2 — arm up -->
        <div style="position:absolute;top:${scale(85)}px;left:calc(50% + ${scale(24)}px);width:${scale(12)}px;height:${scale(36)}px;background:${palette.secondary};border-radius:${scale(6)}px;transform:rotate(20deg);transform-origin:bottom center;"></div>
        <!-- High-five star -->
        <div style="position:absolute;top:${scale(60)}px;left:50%;transform:translateX(-50%);width:${scale(20)}px;height:${scale(20)}px;background:#fbbf24;border-radius:50%;opacity:0.6;"></div>
        <!-- Sparkle dots -->
        <div style="position:absolute;top:${scale(25)}px;left:${scale(20)}px;width:${scale(8)}px;height:${scale(8)}px;background:${palette.accent};border-radius:50%;opacity:0.3;"></div>
        <div style="position:absolute;top:${scale(30)}px;right:${scale(15)}px;width:${scale(6)}px;height:${scale(6)}px;background:${palette.secondary};border-radius:50%;opacity:0.25;"></div>
      `;

    // ===== NATURE — Flower + leaves =====
    case "nature":
      return `
        <!-- Flower center -->
        <div style="position:absolute;top:${scale(60)}px;left:50%;transform:translateX(-50%);width:${scale(40)}px;height:${scale(40)}px;background:#fbbf24;border-radius:50%;box-shadow:0 ${scale(4)}px ${scale(16)}px rgba(251,191,36,0.3);"></div>
        <!-- Petals -->
        <div style="position:absolute;top:${scale(30)}px;left:calc(50% - ${scale(18)}px);width:${scale(36)}px;height:${scale(36)}px;background:${palette.accent};border-radius:50%;opacity:0.6;"></div>
        <div style="position:absolute;top:${scale(70)}px;left:calc(50% - ${scale(18)}px);width:${scale(36)}px;height:${scale(36)}px;background:${palette.accent};border-radius:50%;opacity:0.6;"></div>
        <div style="position:absolute;top:${scale(48)}px;left:calc(50% - ${scale(48)}px);width:${scale(36)}px;height:${scale(36)}px;background:${palette.accent};border-radius:50%;opacity:0.6;"></div>
        <div style="position:absolute;top:${scale(48)}px;left:calc(50% + ${scale(12)}px);width:${scale(36)}px;height:${scale(36)}px;background:${palette.accent};border-radius:50%;opacity:0.6;"></div>
        <!-- Stem -->
        <div style="position:absolute;top:${scale(100)}px;left:50%;transform:translateX(-50%);width:${scale(6)}px;height:${scale(100)}px;background:${palette.text};border-radius:${scale(3)}px;opacity:0.3;"></div>
        <!-- Leaf left -->
        <div style="position:absolute;top:${scale(140)}px;left:calc(50% - ${scale(35)}px);width:${scale(30)}px;height:${scale(16)}px;background:${palette.secondary};border-radius:50% 0 50% 0;transform:rotate(-30deg);opacity:0.5;"></div>
        <!-- Leaf right -->
        <div style="position:absolute;top:${scale(170)}px;left:calc(50% + ${scale(5)}px);width:${scale(28)}px;height:${scale(14)}px;background:${palette.secondary};border-radius:0 50% 0 50%;transform:rotate(25deg);opacity:0.5;"></div>
        <!-- Butterfly -->
        <div style="position:absolute;top:${scale(20)}px;right:${scale(30)}px;width:${scale(20)}px;height:${scale(14)}px;background:${palette.accent};border-radius:50%;opacity:0.4;"></div>
        <div style="position:absolute;top:${scale(18)}px;right:calc(${scale(30)}px + ${scale(12)}px);width:${scale(16)}px;height:${scale(12)}px;background:${palette.secondary};border-radius:50%;opacity:0.35;"></div>
      `;

    // ===== MUSIC — Musical notes =====
    case "music":
      return `
        <!-- Note 1 — large -->
        <div style="position:absolute;top:${scale(80)}px;left:calc(50% - ${scale(40)}px);width:${scale(40)}px;height:${scale(30)}px;background:${palette.accent};border-radius:50%;box-shadow:0 ${scale(4)}px ${scale(12)}px rgba(139,92,246,0.25);"></div>
        <div style="position:absolute;top:${scale(20)}px;left:calc(50% - ${scale(28)}px);width:${scale(8)}px;height:${scale(70)}px;background:${palette.accent};border-radius:${scale(4)}px;"></div>
        <div style="position:absolute;top:${scale(16)}px;left:calc(50% - ${scale(28)}px);width:${scale(40)}px;height:${scale(10)}px;background:${palette.accent};border-radius:${scale(5)}px;"></div>
        <!-- Note 2 — medium -->
        <div style="position:absolute;top:${scale(130)}px;left:calc(50% + ${scale(10)}px);width:${scale(30)}px;height:${scale(22)}px;background:${palette.secondary};border-radius:50%;"></div>
        <div style="position:absolute;top:${scale(70)}px;left:calc(50% + ${scale(20)}px);width:${scale(6)}px;height:${scale(66)}px;background:${palette.secondary};border-radius:${scale(3)}px;"></div>
        <div style="position:absolute;top:${scale(66)}px;left:calc(50% + ${scale(20)}px);width:${scale(30)}px;height:${scale(8)}px;background:${palette.secondary};border-radius:${scale(4)}px;"></div>
        <!-- Note 3 — small -->
        <div style="position:absolute;top:${scale(170)}px;left:calc(50% - ${scale(50)}px);width:${scale(22)}px;height:${scale(16)}px;background:${palette.accent};border-radius:50%;opacity:0.6;"></div>
        <div style="position:absolute;top:${scale(120)}px;left:calc(50% - ${scale(42)}px);width:${scale(5)}px;height:${scale(56)}px;background:${palette.accent};border-radius:${scale(2)}px;opacity:0.6;"></div>
        <!-- Sound waves -->
        <div style="position:absolute;top:${scale(40)}px;right:${scale(20)}px;width:${scale(30)}px;height:${scale(30)}px;border:${scale(3)}px solid ${palette.accent};border-radius:50%;opacity:0.15;"></div>
        <div style="position:absolute;top:${scale(30)}px;right:${scale(10)}px;width:${scale(50)}px;height:${scale(50)}px;border:${scale(3)}px solid ${palette.secondary};border-radius:50%;opacity:0.1;"></div>
        <div style="position:absolute;top:${scale(20)}px;right:0;width:${scale(70)}px;height:${scale(70)}px;border:${scale(3)}px solid ${palette.accent};border-radius:50%;opacity:0.06;"></div>
      `;

    // ===== FOOD — Plate with food =====
    case "food":
      return `
        <!-- Plate -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${scale(180)}px;height:${scale(180)}px;background:white;border-radius:50%;box-shadow:0 ${scale(6)}px ${scale(24)}px rgba(245,158,11,0.15),inset 0 0 0 ${scale(4)}px ${palette.accentLight};"></div>
        <!-- Plate inner ring -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${scale(140)}px;height:${scale(140)}px;border:${scale(2)}px solid ${palette.accentLight};border-radius:50%;"></div>
        <!-- Food item 1 — circle (meatball/cookie) -->
        <div style="position:absolute;top:calc(50% - ${scale(20)}px);left:calc(50% - ${scale(20)}px);width:${scale(40)}px;height:${scale(40)}px;background:${palette.accent};border-radius:50%;"></div>
        <!-- Food item 2 -->
        <div style="position:absolute;top:calc(50% + ${scale(10)}px);left:calc(50% - ${scale(30)}px);width:${scale(30)}px;height:${scale(24)}px;background:${palette.secondary};border-radius:${scale(12)}px;"></div>
        <!-- Food item 3 -->
        <div style="position:absolute;top:calc(50% - ${scale(5)}px);left:calc(50% + ${scale(10)}px);width:${scale(35)}px;height:${scale(28)}px;background:${palette.accent};border-radius:${scale(14)}px;opacity:0.8;"></div>
        <!-- Garnish leaf -->
        <div style="position:absolute;top:calc(50% - ${scale(40)}px);left:calc(50% + ${scale(20)}px);width:${scale(20)}px;height:${scale(12)}px;background:${palette.text};border-radius:50% 0 50% 0;opacity:0.3;transform:rotate(30deg);"></div>
        <!-- Steam lines -->
        <div style="position:absolute;top:${scale(30)}px;left:calc(50% - ${scale(20)}px);width:${scale(3)}px;height:${scale(24)}px;background:${palette.accent};border-radius:${scale(2)}px;opacity:0.2;"></div>
        <div style="position:absolute;top:${scale(25)}px;left:50%;transform:translateX(-50%);width:${scale(3)}px;height:${scale(30)}px;background:${palette.accent};border-radius:${scale(2)}px;opacity:0.15;"></div>
        <div style="position:absolute;top:${scale(30)}px;left:calc(50% + ${scale(18)}px);width:${scale(3)}px;height:${scale(24)}px;background:${palette.accent};border-radius:${scale(2)}px;opacity:0.2;"></div>
      `;

    // ===== TRAVEL — Airplane + globe =====
    case "travel":
      return `
        <!-- Globe -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${scale(140)}px;height:${scale(140)}px;background:${palette.accent};border-radius:50%;opacity:0.15;"></div>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${scale(140)}px;height:${scale(140)}px;border:${scale(3)}px solid ${palette.accent};border-radius:50%;opacity:0.3;"></div>
        <!-- Globe lines -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${scale(140)}px;height:${scale(3)}px;background:${palette.accent};opacity:0.15;"></div>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${scale(3)}px;height:${scale(140)}px;background:${palette.accent};opacity:0.15;"></div>
        <!-- Airplane body -->
        <div style="position:absolute;top:${scale(50)}px;left:calc(50% - ${scale(50)}px);width:${scale(100)}px;height:${scale(20)}px;background:${palette.accent};border-radius:${scale(10)}px;box-shadow:0 ${scale(4)}px ${scale(16)}px rgba(59,130,246,0.25);"></div>
        <!-- Airplane nose -->
        <div style="position:absolute;top:${scale(52)}px;left:calc(50% + ${scale(42)}px);width:${scale(20)}px;height:${scale(16)}px;background:${palette.accent};border-radius:0 ${scale(8)}px ${scale(8)}px 0;"></div>
        <!-- Airplane tail -->
        <div style="position:absolute;top:${scale(30)}px;left:calc(50% - ${scale(55)}px);width:${scale(16)}px;height:${scale(28)}px;background:${palette.secondary};border-radius:${scale(8)}px ${scale(8)}px 0 0;"></div>
        <!-- Airplane wings -->
        <div style="position:absolute;top:${scale(40)}px;left:calc(50% - ${scale(10)}px);width:${scale(30)}px;height:${scale(40)}px;background:${palette.secondary};border-radius:${scale(6)}px;opacity:0.7;"></div>
        <!-- Trail dots -->
        <div style="position:absolute;top:${scale(60)}px;left:calc(50% - ${scale(80)}px);width:${scale(8)}px;height:${scale(8)}px;background:${palette.accent};border-radius:50%;opacity:0.3;"></div>
        <div style="position:absolute;top:${scale(58)}px;left:calc(50% - ${scale(95)}px);width:${scale(6)}px;height:${scale(6)}px;background:${palette.accent};border-radius:50%;opacity:0.2;"></div>
        <div style="position:absolute;top:${scale(56)}px;left:calc(50% - ${scale(108)}px);width:${scale(4)}px;height:${scale(4)}px;background:${palette.accent};border-radius:50%;opacity:0.15;"></div>
      `;

    // ===== FITNESS — Dumbbell =====
    case "fitness":
      return `
        <!-- Bar -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${scale(160)}px;height:${scale(12)}px;background:${palette.text};border-radius:${scale(6)}px;opacity:0.4;"></div>
        <!-- Left weight 1 -->
        <div style="position:absolute;top:calc(50% - ${scale(40)}px);left:calc(50% - ${scale(90)}px);width:${scale(20)}px;height:${scale(80)}px;background:${palette.accent};border-radius:${scale(10)}px;box-shadow:0 ${scale(4)}px ${scale(16)}px rgba(239,68,68,0.25);"></div>
        <!-- Left weight 2 -->
        <div style="position:absolute;top:calc(50% - ${scale(30)}px);left:calc(50% - ${scale(110)}px);width:${scale(16)}px;height:${scale(60)}px;background:${palette.accent};border-radius:${scale(8)}px;opacity:0.7;"></div>
        <!-- Right weight 1 -->
        <div style="position:absolute;top:calc(50% - ${scale(40)}px);left:calc(50% + ${scale(70)}px);width:${scale(20)}px;height:${scale(80)}px;background:${palette.accent};border-radius:${scale(10)}px;box-shadow:0 ${scale(4)}px ${scale(16)}px rgba(239,68,68,0.25);"></div>
        <!-- Right weight 2 -->
        <div style="position:absolute;top:calc(50% - ${scale(30)}px);left:calc(50% + ${scale(94)}px);width:${scale(16)}px;height:${scale(60)}px;background:${palette.accent};border-radius:${scale(8)}px;opacity:0.7;"></div>
        <!-- Lightning bolt -->
        <div style="position:absolute;top:${scale(20)}px;left:50%;transform:translateX(-50%);width:${scale(20)}px;height:${scale(30)}px;background:${palette.accent};clip-path:polygon(50% 0%,0% 50%,40% 50%,20% 100%,100% 45%,55% 45%);opacity:0.4;"></div>
      `;

    // ===== PRODUCT — Phone/device =====
    case "product":
      return `
        <!-- Device body -->
        <div style="position:absolute;bottom:${scale(60)}px;left:50%;transform:translateX(-50%);width:${scale(140)}px;height:${scale(220)}px;background:#1e293b;border-radius:${scale(20)}px;box-shadow:0 ${scale(8)}px ${scale(30)}px rgba(124,58,237,0.2);"></div>
        <!-- Screen -->
        <div style="position:absolute;bottom:${scale(80)}px;left:50%;transform:translateX(-50%);width:${scale(120)}px;height:${scale(180)}px;background:${palette.accentLight};border-radius:${scale(12)}px;"></div>
        <!-- Screen content bar -->
        <div style="position:absolute;bottom:${scale(220)}px;left:50%;transform:translateX(-50%);width:${scale(80)}px;height:${scale(10)}px;background:${palette.accent};border-radius:${scale(5)}px;opacity:0.5;"></div>
        <div style="position:absolute;bottom:${scale(200)}px;left:50%;transform:translateX(-50%);width:${scale(60)}px;height:${scale(8)}px;background:${palette.secondary};border-radius:${scale(4)}px;opacity:0.35;"></div>
        <!-- Screen button -->
        <div style="position:absolute;bottom:${scale(150)}px;left:50%;transform:translateX(-50%);width:${scale(70)}px;height:${scale(26)}px;background:${palette.accent};border-radius:${scale(6)}px;"></div>
        <!-- Screen card -->
        <div style="position:absolute;bottom:${scale(100)}px;left:50%;transform:translateX(-50%);width:${scale(90)}px;height:${scale(44)}px;background:white;border-radius:${scale(8)}px;box-shadow:0 ${scale(2)}px ${scale(8)}px rgba(0,0,0,0.06);"></div>
        <!-- Floating badge -->
        <div style="position:absolute;top:${scale(40)}px;right:${scale(10)}px;width:${scale(30)}px;height:${scale(30)}px;background:${palette.accent};border-radius:50%;opacity:0.25;"></div>
        <div style="position:absolute;bottom:${scale(40)}px;left:${scale(15)}px;width:${scale(16)}px;height:${scale(16)}px;background:${palette.secondary};border-radius:50%;opacity:0.2;"></div>
      `;

    // ===== STEPS — Numbered circles =====
    case "steps":
      return `
        <!-- Step 1 -->
        <div style="position:absolute;top:${scale(40)}px;left:50%;transform:translateX(-50%);width:${scale(70)}px;height:${scale(70)}px;background:${palette.accent};border-radius:50%;box-shadow:0 ${scale(4)}px ${scale(16)}px rgba(13,148,136,0.25);display:flex;align-items:center;justify-content:center;">
          <span style="color:white;font-size:${scale(28)}px;font-weight:800;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">1</span>
        </div>
        <!-- Connector 1 -->
        <div style="position:absolute;top:${scale(110)}px;left:50%;transform:translateX(-50%);width:${scale(3)}px;height:${scale(30)}px;background:${palette.secondary};opacity:0.35;"></div>
        <!-- Step 2 -->
        <div style="position:absolute;top:${scale(140)}px;left:50%;transform:translateX(-50%);width:${scale(70)}px;height:${scale(70)}px;background:${palette.secondary};border-radius:50%;box-shadow:0 ${scale(4)}px ${scale(16)}px rgba(45,212,191,0.2);display:flex;align-items:center;justify-content:center;">
          <span style="color:white;font-size:${scale(28)}px;font-weight:800;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">2</span>
        </div>
        <!-- Connector 2 -->
        <div style="position:absolute;top:${scale(210)}px;left:50%;transform:translateX(-50%);width:${scale(3)}px;height:${scale(30)}px;background:${palette.secondary};opacity:0.35;"></div>
        <!-- Step 3 -->
        <div style="position:absolute;top:${scale(240)}px;left:50%;transform:translateX(-50%);width:${scale(70)}px;height:${scale(70)}px;background:${palette.accent};border-radius:50%;box-shadow:0 ${scale(4)}px ${scale(16)}px rgba(13,148,136,0.25);display:flex;align-items:center;justify-content:center;">
          <span style="color:white;font-size:${scale(28)}px;font-weight:800;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">3</span>
        </div>
        <!-- Decorative dots -->
        <div style="position:absolute;top:${scale(30)}px;left:${scale(15)}px;width:${scale(12)}px;height:${scale(12)}px;background:${palette.accent};border-radius:50%;opacity:0.15;"></div>
        <div style="position:absolute;bottom:${scale(50)}px;right:${scale(20)}px;width:${scale(10)}px;height:${scale(10)}px;background:${palette.secondary};border-radius:50%;opacity:0.2;"></div>
      `;

    // ===== GENERIC — Abstract shapes =====
    case "generic":
    default:
      return `
        <!-- Large circle -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${scale(160)}px;height:${scale(160)}px;background:${palette.accent};border-radius:50%;opacity:0.1;"></div>
        <!-- Medium circle -->
        <div style="position:absolute;top:${scale(50)}px;left:50%;transform:translateX(-50%);width:${scale(90)}px;height:${scale(90)}px;background:${palette.accent};border-radius:50%;box-shadow:0 ${scale(6)}px ${scale(20)}px rgba(13,148,136,0.15);"></div>
        <!-- Checkmark -->
        <div style="position:absolute;top:${scale(85)}px;left:calc(50% - ${scale(10)}px);width:${scale(18)}px;height:${scale(4)}px;background:white;border-radius:${scale(2)}px;transform:rotate(45deg);"></div>
        <div style="position:absolute;top:${scale(82)}px;left:calc(50% + ${scale(2)}px);width:${scale(28)}px;height:${scale(4)}px;background:white;border-radius:${scale(2)}px;transform:rotate(-45deg);"></div>
        <!-- Diamond -->
        <div style="position:absolute;bottom:${scale(100)}px;left:50%;transform:translateX(-50%) rotate(45deg);width:${scale(50)}px;height:${scale(50)}px;background:${palette.secondary};border-radius:${scale(10)}px;opacity:0.15;"></div>
        <!-- Small dots -->
        <div style="position:absolute;top:${scale(30)}px;left:${scale(20)}px;width:${scale(12)}px;height:${scale(12)}px;background:${palette.accent};border-radius:50%;opacity:0.25;"></div>
        <div style="position:absolute;bottom:${scale(50)}px;right:${scale(25)}px;width:${scale(8)}px;height:${scale(8)}px;background:${palette.secondary};border-radius:50%;opacity:0.2;"></div>
        <div style="position:absolute;top:${scale(160)}px;right:${scale(15)}px;width:${scale(14)}px;height:${scale(14)}px;background:${palette.accent};border-radius:50%;opacity:0.12;"></div>
      `;
  }
}

function renderBannerHtml(config) {
  const spec = config.image_render_spec || {};
  const layout = spec.layout || config.image_layout || "portrait";
  const resolution = String(spec.resolution || config.output_resolution || "1080x1350");
  const [width, height] = resolution.split("x").map((value) => Number.parseInt(value, 10) || 1080);
  const brandingUrl = spec.branding_url || config.branding_url || "";
  const brandName = spec.brand_name || config.brand_name || normalizeDomain(brandingUrl) || "Brand";
  const domain = normalizeDomain(brandingUrl) || brandName;
  const steps = formatSteps(spec.steps || ["Choose the option", "Submit the details", "Get the result"]);
  const isLandscape = layout === "landscape" || width > height;

  const illustrationType = resolveIllustration(spec);
  const palette = THEME_PALETTES[illustrationType] || THEME_PALETTES.generic;
  const illustration = buildIllustration(illustrationType, isLandscape);

  const fs = isLandscape
    ? { headline: 52, supporting: 22, accent: 17, stepNum: 18, stepLabel: 16, cta: 22, domain: 17, pad: 48, gap: 28, illuW: "48%", textW: "52%", ctaW: "60%", badgeH: 42 }
    : { headline: 62, supporting: 26, accent: 19, stepNum: 20, stepLabel: 18, cta: 26, domain: 19, pad: 56, gap: 32, illuW: "100%", textW: "100%", ctaW: "80%", badgeH: 48 };

  return `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
          width: ${width}px;
          height: ${height}px;
          overflow: hidden;
          font-family: "Inter", "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
          background: ${palette.bg};
          color: #0f172a;
        }
        .canvas {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: ${isLandscape ? "row" : "column"};
          padding: ${fs.pad}px;
          gap: ${fs.gap}px;
        }

        .illustration-col {
          position: relative;
          ${isLandscape ? `width: ${fs.illuW}; height: 100%;` : `width: 100%; flex: 1 1 auto; min-height: 0;`}
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .illustration-area {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .text-col {
          ${isLandscape ? `width: ${fs.textW}; height: 100%;` : `width: 100%; flex: 0 0 auto;`}
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: ${isLandscape ? 18 : 22}px;
          z-index: 2;
        }
        .accent-pill {
          display: inline-flex;
          align-self: flex-start;
          align-items: center;
          padding: 8px 20px;
          border-radius: 999px;
          background: ${palette.accent};
          color: white;
          font-size: ${fs.accent}px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .headline {
          font-size: ${fs.headline}px;
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.03em;
          color: #0f172a;
        }
        .supporting {
          font-size: ${fs.supporting}px;
          line-height: 1.4;
          color: #475569;
          max-width: ${isLandscape ? "100%" : "90%"};
        }
        .steps-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 4px;
        }
        .step-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 999px;
          background: white;
          border: 1.5px solid #e2e8f0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .step-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: ${fs.stepNum + 8}px;
          height: ${fs.stepNum + 8}px;
          border-radius: 50%;
          background: ${palette.accent};
          color: white;
          font-size: ${fs.stepNum - 2}px;
          font-weight: 800;
        }
        .step-label {
          font-size: ${fs.stepLabel}px;
          font-weight: 600;
          color: #334155;
        }

        .cta-bar {
          ${isLandscape ? `
            position: absolute;
            bottom: ${fs.pad}px;
            left: 50%;
            transform: translateX(-50%);
            width: ${fs.ctaW};
          ` : `
            width: 100%;
            flex: 0 0 auto;
          `}
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 3;
        }
        .cta-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 18px 48px;
          border-radius: 999px;
          background: ${palette.accent};
          color: white;
          font-size: ${fs.cta}px;
          font-weight: 700;
          letter-spacing: 0.01em;
          box-shadow: 0 4px 16px ${palette.accent}44, 0 1px 3px rgba(0,0,0,0.08);
          text-decoration: none;
          white-space: nowrap;
        }
        .cta-domain {
          font-size: ${fs.domain}px;
          font-weight: 500;
          color: rgba(255,255,255,0.8);
          margin-left: 4px;
        }

        .bg-circle-1 {
          position: absolute;
          top: -60px;
          right: -40px;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          background: ${palette.accent};
          opacity: 0.06;
          z-index: 0;
        }
        .bg-circle-2 {
          position: absolute;
          bottom: -80px;
          left: -60px;
          width: 260px;
          height: 260px;
          border-radius: 50%;
          background: ${palette.secondary};
          opacity: 0.05;
          z-index: 0;
        }
      </style>
    </head>
    <body>
      <div class="bg-circle-1"></div>
      <div class="bg-circle-2"></div>

      <div class="canvas">
        ${isLandscape ? `
          <div class="illustration-col">
            <div class="illustration-area">
              ${illustration}
            </div>
          </div>
          <div class="text-col">
            <div class="accent-pill">${escapeHtml(spec.accent_label || brandName)}</div>
            <h1 class="headline">${escapeHtml(spec.headline || "Visit " + brandName)}</h1>
            <p class="supporting">${escapeHtml(spec.supporting_text || "Explore the latest workflow at " + domain)}</p>
            <div class="steps-row">${steps}</div>
          </div>
          <div class="cta-bar">
            <div class="cta-button">
              ${escapeHtml(spec.cta || "Visit " + domain)}
              ${domain ? '<span class="cta-domain">' + escapeHtml(domain) + '</span>' : ''}
            </div>
          </div>
        ` : `
          <div class="illustration-col">
            <div class="illustration-area">
              ${illustration}
            </div>
          </div>
          <div class="text-col">
            <div class="accent-pill">${escapeHtml(spec.accent_label || brandName)}</div>
            <h1 class="headline">${escapeHtml(spec.headline || "Visit " + brandName)}</h1>
            <p class="supporting">${escapeHtml(spec.supporting_text || "Explore the latest workflow at " + domain)}</p>
            <div class="steps-row">${steps}</div>
          </div>
          <div class="cta-bar">
            <div class="cta-button">
              ${escapeHtml(spec.cta || "Visit " + domain)}
              ${domain ? '<span class="cta-domain">' + escapeHtml(domain) + '</span>' : ''}
            </div>
          </div>
        `}
      </div>
    </body>
  </html>
  `;
}

module.exports = {
  renderBannerHtml,
};
