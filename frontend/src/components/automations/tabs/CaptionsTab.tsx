import { TabProps } from "../types";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ur", label: "Urdu" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "ar", label: "Arabic" },
  { value: "auto", label: "Auto Detect" },
];

const FONT_SIZES = [
  { value: "small", label: "Small", px: 14 },
  { value: "medium", label: "Medium", px: 18 },
  { value: "large", label: "Large", px: 24 },
];

const COLOR_PRESETS = [
  { value: "#FFFFFF", label: "White" },
  { value: "#FFD700", label: "Yellow" },
  { value: "#00E5FF", label: "Cyan" },
  { value: "#FF4081", label: "Pink" },
  { value: "#76FF03", label: "Green" },
];

function resolveStyle(
  data: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const v = data[key];
  return typeof v === "string" && v ? v : fallback;
}

export default function CaptionsTab({ data, onChange }: TabProps) {
  const enabled = data.whisper_enabled === true;
  const language = resolveStyle(data, "whisper_language", "en");
  const fontSize = resolveStyle(data, "caption_font_size", "medium");
  const textColor = resolveStyle(data, "caption_text_color", "#FFFFFF");
  const bgOpacity = resolveStyle(data, "caption_bg_opacity", "0.5");
  const position = resolveStyle(data, "caption_position", "bottom");

  const selectedFont = FONT_SIZES.find((f) => f.value === fontSize) || FONT_SIZES[1];

  const labelClass =
    "text-[10px] font-medium text-[#a1a1aa] mb-1.5 block";
  const selectClass =
    "w-full px-3 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-sm text-white focus:border-blue-500 focus:outline-none";
  const sliderClass =
    "w-full accent-blue-500 h-1.5 rounded-full appearance-none bg-[rgba(255,255,255,0.08)] cursor-pointer";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white">Captions</h3>
          <p className="text-[11px] text-[#a1a1aa] mt-0.5">
            Whisper AI subtitle generator
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange("whisper_enabled", e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-[rgba(255,255,255,0.1)] rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
        </label>
      </div>

      {!enabled && (
        <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.06)] p-6 text-center">
          <svg
            className="w-8 h-8 mx-auto text-[#4a4a5a] mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
            />
          </svg>
          <p className="text-xs text-[#71717a]">
            Toggle on to add AI-generated captions to your shorts
          </p>
        </div>
      )}

      {enabled && (
        <div className="grid grid-cols-2 gap-4">
          {/* Language */}
          <div>
            <label className={labelClass}>Language</label>
            <select
              value={language}
              onChange={(e) => onChange("whisper_language", e.target.value)}
              className={selectClass}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="text-[9px] text-[#71717a] mt-1">
              Video ki original language select karein
            </p>
          </div>

          {/* Position */}
          <div>
            <label className={labelClass}>Position</label>
            <div className="flex gap-2">
              {(["top", "bottom"] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => onChange("caption_position", pos)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    position === pos
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                      : "bg-[rgba(255,255,255,0.04)] text-[#71717a] border border-transparent hover:text-[#a1a1aa]"
                  }`}
                >
                  {pos === "top" ? "Top" : "Bottom"}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className={labelClass}>Font Size</label>
            <div className="flex gap-2">
              {FONT_SIZES.map((fs) => (
                <button
                  key={fs.value}
                  onClick={() => onChange("caption_font_size", fs.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    fontSize === fs.value
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                      : "bg-[rgba(255,255,255,0.04)] text-[#71717a] border border-transparent hover:text-[#a1a1aa]"
                  }`}
                >
                  {fs.label} ({fs.px}px)
                </button>
              ))}
            </div>
          </div>

          {/* Text Color */}
          <div>
            <label className={labelClass}>Text Color</label>
            <div className="flex gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => onChange("caption_text_color", c.value)}
                  className="w-8 h-8 rounded-lg border-2 transition-all"
                  style={{
                    backgroundColor: c.value,
                    borderColor:
                      textColor === c.value
                        ? "rgba(59,130,246,0.8)"
                        : "rgba(255,255,255,0.08)",
                    boxShadow:
                      textColor === c.value
                        ? "0 0 8px rgba(59,130,246,0.4)"
                        : "none",
                  }}
                  title={c.label}
                />
              ))}
              <input
                type="color"
                value={textColor}
                onChange={(e) =>
                  onChange("caption_text_color", e.target.value)
                }
                className="w-8 h-8 rounded-lg border border-[rgba(255,255,255,0.08)] bg-transparent cursor-pointer"
                title="Custom color"
              />
            </div>
          </div>

          {/* Background Opacity */}
          <div className="col-span-2">
            <label className={labelClass}>
              Background Opacity
              <span className="text-blue-400 ml-1">{bgOpacity}</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={bgOpacity}
              onChange={(e) =>
                onChange("caption_bg_opacity", e.target.value)
              }
              className={sliderClass}
            />
            <div className="flex justify-between text-[8px] text-[#4a4a5a] mt-0.5">
              <span>Transparent</span>
              <span>Solid</span>
            </div>
          </div>

          {/* Preview */}
          <div className="col-span-2">
            <label className={labelClass}>Preview</label>
            <div className="rounded-xl overflow-hidden border border-[rgba(255,255,255,0.08)] bg-black/40">
              <div className="aspect-[9/16] max-h-[200px] bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center relative">
                {/* Sample video frame */}
                <svg
                  className="w-12 h-12 text-[#4a4a5a]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>

                {/* Caption preview overlay */}
                <div
                  className="absolute px-4 py-2 rounded-lg text-center text-xs max-w-[80%] leading-relaxed"
                  style={{
                    [position]: "16px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    color: textColor,
                    backgroundColor: `rgba(0,0,0,${Math.min(
                      parseFloat(bgOpacity) || 0.5,
                      1
                    )})`,
                    fontSize: `${selectedFont.px * 0.6}px`,
                  }}
                >
                  Yeh caption preview hai
                  <br />
                  jo video par dikhe ga
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
