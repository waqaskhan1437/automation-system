import { useEffect, useState } from "react";
import type { AIProviderCatalog, TabProps } from "@/lib/types";
import {
  TAGLINE_FONT_COLORS,
  TAGLINE_BG_COLORS,
  TAGLINE_CHAR_LIMITS,
  TAGLINE_FONT_SIZES
} from "@/lib/types";

interface TaglinesTabProps extends TabProps {
  generating?: boolean;
  genResult?: string;
  onAiGenerate?: () => void;
  aiProviders?: AIProviderCatalog[];
  onProviderChange?: (provider: string) => void;
  onModelChange?: (model: string) => void;
}

const FONTS = [
  { id: "ubuntu", name: "Ubuntu" },
  { id: "dejavu", name: "DejaVu" },
  { id: "liberation", name: "Liberation" },
  { id: "noto", name: "Noto Sans" },
  { id: "lato", name: "Lato" }
];

const FONT_STYLES = [
  { id: "normal", name: "Normal" },
  { id: "bold", name: "Bold" },
  { id: "italic", name: "Italic" },
  { id: "bold_italic", name: "Bold Italic" }
];

const FONT_SIZES_OPTIONS = [
  { id: "xs", name: "XS (24px)" },
  { id: "sm", name: "Small (32px)" },
  { id: "md", name: "Medium (42px)" },
  { id: "lg", name: "Large (56px)" },
  { id: "xl", name: "XL (72px)" }
];

const BG_TYPES = [
  { id: "none", name: "None" },
  { id: "box", name: "Box" },
  { id: "rounded_box", name: "Rounded Box" }
];

const colorMap: Record<string, { bg: string; bgLight: string; text: string; border: string }> = {
  green: { bg: "rgba(34,197,94,0.1)", bgLight: "rgba(34,197,94,0.2)", text: "#4ade80", border: "rgba(34,197,94,0.15)" },
  blue: { bg: "rgba(59,130,246,0.1)", bgLight: "rgba(59,130,246,0.2)", text: "#60a5fa", border: "rgba(59,130,246,0.15)" },
  purple: { bg: "rgba(139,92,246,0.1)", bgLight: "rgba(139,92,246,0.2)", text: "#a78bfa", border: "rgba(139,92,246,0.15)" }
};

function TaglineSection({ label, colors, icon, items, placeholder, onChange }: {
  label: string;
  colors: { bg: string; bgLight: string; text: string; border: string };
  icon: string;
  items: string[];
  placeholder: string;
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="p-3 rounded-xl border" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: colors.bgLight }}>
            <svg className="w-3 h-3" style={{ color: colors.text }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          </div>
          <span className="text-[11px] font-bold" style={{ color: colors.text }}>{label}</span>
          <span className="text-[9px] text-[#71717a] bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 rounded">{items.length}</span>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-[9px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>
      <textarea
        className="w-full h-28 px-2 py-2 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-lg text-[11px] text-white placeholder-[#3f3f46] focus:outline-none resize-none"
        placeholder={placeholder}
        value={items.join("\n")}
        onChange={e => onChange(e.target.value.split("\n").filter(t => t.trim()))}
      />
    </div>
  );
}

function ColorPicker({ colors, selected, onChange }: {
  colors: { name: string; value: string }[];
  selected: string;
  onChange: (v: string) => void;
}) {
  const hasPresetMatch = colors.some((color) => color.value === selected);
  const usesCustomColor = selected === "custom" || (/^#[0-9A-Fa-f]{6}$/.test(selected) && !hasPresetMatch);
  const [customColor, setCustomColor] = useState(usesCustomColor && selected !== "custom" ? selected : "#FFFFFF");

  useEffect(() => {
    if (usesCustomColor && selected !== "custom") {
      setCustomColor(selected);
    }
  }, [selected, usesCustomColor]);
  
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c) => (
          <button
            key={c.value}
            onClick={() => onChange(c.value)}
            className={`w-6 h-6 rounded-md border-2 transition-all ${
              (usesCustomColor ? c.value === "custom" : selected === c.value)
                ? "border-white scale-110"
                : "border-transparent hover:border-white/30"
            }`}
            style={{ backgroundColor: c.value === "random" ? "conic-gradient(red, yellow, green, blue, purple, red)" : c.value }}
            title={c.name}
          />
        ))}
      </div>
      {usesCustomColor && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={customColor || "#FFFFFF"}
            onChange={(e) => {
              setCustomColor(e.target.value);
              onChange(e.target.value);
            }}
            className="w-8 h-8 rounded cursor-pointer"
          />
          <input
            type="text"
            value={customColor || "#FFFFFF"}
            onChange={(e) => {
              setCustomColor(e.target.value);
              if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                onChange(e.target.value);
              }
            }}
            placeholder="#FFFFFF"
            className="flex-1 px-2 py-1 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded text-xs text-white"
          />
        </div>
      )}
    </div>
  );
}

export default function TaglinesTab({
  data,
  onChange,
  generating,
  genResult,
  onAiGenerate,
  aiProviders = [],
  onProviderChange,
  onModelChange,
}: TaglinesTabProps) {
  const readNumber = (value: unknown, fallback: number) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  };

  const topTaglines = (data.top_taglines as string[]) || [];
  const bottomTaglines = (data.bottom_taglines as string[]) || [];
  const selectedProvider = (data.ai_gen_provider as string) || "";
  const selectedModel = (data.ai_gen_model as string) || "";
  const providerModels = aiProviders.find((provider) => provider.id === selectedProvider)?.models || [];
  const hasAiProviders = aiProviders.length > 0;

  const taglineFontFamily = (data.tagline_font_family as string) || "ubuntu";
  const taglineFontStyle = (data.tagline_font_style as string) || "bold";
  const taglineFontSize = (data.tagline_font_size as string) || "md";
  const taglineFontColor = (data.tagline_font_color as string) || "#FFFFFF";
  const taglineBgType = (data.tagline_background_type as string) || "none";
  const taglineBgColor = (data.tagline_background_color as string) || "#000000";
  const taglineBgOpacity = readNumber(data.tagline_background_opacity, 100);
  const taglineCharLimit = readNumber(data.tagline_char_limit, 0);
  const taglineCharLimitCustom = readNumber(data.tagline_char_limit_custom, 100);
  const taglineWrapEnabled = (data.tagline_wrap_enabled as boolean) !== false;
  const taglineWrapMaxChars = readNumber(data.tagline_wrap_max_chars, 0);
  const taglineRandomFontColor = (data.tagline_random_font_color as boolean) || false;
  const taglineRandomBg = (data.tagline_random_background as boolean) || false;
  const taglineGenCount = readNumber(data.tagline_gen_count, 3);
  const taglineAddMore = (data.tagline_add_more as boolean) || false;
  const taglineTopMargin = readNumber(data.tagline_top_margin, 80);
  const taglineBottomMargin = readNumber(data.tagline_bottom_margin, 80);

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl border bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-blue-500/20">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-500/20">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <div className="text-xs font-bold text-white">AI Tagline Generator</div>
            <div className="text-[10px] text-[#71717a]">Generate taglines with AI</div>
          </div>
        </div>

        <div className="space-y-2">
          <input
            className="w-full px-3 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white placeholder-[#52525b] focus:outline-none"
            placeholder="Topic: e.g., birthday wishes, love quotes, funny moments"
            value={data.ai_top_prompt as string || ""}
            onChange={e => onChange("ai_top_prompt", e.target.value)}
          />

          <div className="grid grid-cols-5 gap-2">
            <select
              className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              value={selectedProvider}
              onChange={e => onProviderChange?.(e.target.value)}
              disabled={!hasAiProviders}
            >
              {hasAiProviders ? (
                aiProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.label}</option>
                ))
              ) : (
                <option value="">No AI</option>
              )}
            </select>
            <select
              className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              value={selectedModel}
              onChange={e => onModelChange?.(e.target.value)}
              disabled={!selectedProvider || providerModels.length === 0}
            >
              {providerModels.length > 0 ? (
                providerModels.map((model) => (
                  <option key={model.id} value={model.id}>{model.label}</option>
                ))
              ) : (
                <option value="">Model</option>
              )}
            </select>
            <select
              className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              value={taglineGenCount}
              onChange={e => onChange("tagline_gen_count", parseInt(e.target.value))}
            >
              <option value={3}>3 taglines</option>
              <option value={5}>5 taglines</option>
              <option value={10}>10 taglines</option>
              <option value={15}>15 taglines</option>
            </select>
            <label className="flex items-center justify-center gap-1.5 px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[10px] text-[#a1a1aa] cursor-pointer">
              <input
                type="checkbox"
                checked={taglineAddMore}
                onChange={e => onChange("tagline_add_more", e.target.checked)}
                className="w-3 h-3"
              />
              Add More
            </label>
            <button
              onClick={onAiGenerate}
              disabled={generating || !hasAiProviders || !selectedProvider || !selectedModel}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white disabled:opacity-50"
            >
              {generating ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate
                </>
              )}
            </button>
          </div>

          {genResult && (
            <div className={`text-[10px] px-2 py-1.5 rounded-lg ${
              genResult.includes("Generated") || genResult.includes("generated")
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}>
              {genResult}
              {taglineAddMore && (genResult.includes("Generated") || genResult.includes("generated")) && (
                <span className="ml-2 text-[#71717a]">(added to existing taglines)</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <TaglineSection
          label="Top"
          colors={colorMap.green}
          icon="M5 15l7-7 7 7"
          items={topTaglines}
          placeholder={"Watch till end!\nYou won't believe this!"}
          onChange={v => onChange("top_taglines", v)}
        />
        <TaglineSection
          label="Bottom"
          colors={colorMap.blue}
          icon="M19 9l-7 7-7-7"
          items={bottomTaglines}
          placeholder={"Follow for more!\nLike & Share!"}
          onChange={v => onChange("bottom_taglines", v)}
        />
      </div>

      <div className="p-3 rounded-xl border" style={{ backgroundColor: colorMap.purple.bg, borderColor: colorMap.purple.border }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: colorMap.purple.bgLight }}>
            <svg className="w-3 h-3" style={{ color: colorMap.purple.text }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </div>
          <span className="text-[11px] font-bold" style={{ color: colorMap.purple.text }}>Tagline Styling</span>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-[#a1a1aa] mb-1">Font Family</label>
              <select
                className="w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
                value={taglineFontFamily}
                onChange={e => onChange("tagline_font_family", e.target.value)}
              >
                {FONTS.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[#a1a1aa] mb-1">Font Style</label>
              <select
                className="w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
                value={taglineFontStyle}
                onChange={e => onChange("tagline_font_style", e.target.value)}
              >
                {FONT_STYLES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-[#a1a1aa] mb-1">Font Size</label>
              <select
                className="w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
                value={taglineFontSize}
                onChange={e => onChange("tagline_font_size", e.target.value)}
              >
                {FONT_SIZES_OPTIONS.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[#a1a1aa] mb-1">Background Type</label>
              <select
                className="w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
                value={taglineBgType}
                onChange={e => onChange("tagline_background_type", e.target.value)}
              >
                {BG_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-medium text-[#a1a1aa]">Font Color</label>
              <label className="flex items-center gap-1 text-[9px] text-[#71717a] cursor-pointer">
                <input
                  type="checkbox"
                  checked={taglineRandomFontColor}
                  onChange={e => onChange("tagline_random_font_color", e.target.checked)}
                  className="w-3 h-3"
                />
                Random
              </label>
            </div>
            <ColorPicker
              colors={TAGLINE_FONT_COLORS}
              selected={taglineFontColor}
              onChange={v => onChange("tagline_font_color", v)}
            />
          </div>

          {taglineBgType !== "none" && (
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-medium text-[#a1a1aa]">Background Color</label>
                  <label className="flex items-center gap-1 text-[9px] text-[#71717a] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={taglineRandomBg}
                      onChange={e => onChange("tagline_random_background", e.target.checked)}
                      className="w-3 h-3"
                    />
                    Random
                  </label>
                </div>
                <ColorPicker
                  colors={TAGLINE_BG_COLORS}
                  selected={taglineBgColor}
                  onChange={v => onChange("tagline_background_color", v)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[#a1a1aa] mb-1">
                  Opacity: {taglineBgOpacity}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={taglineBgOpacity}
                  onChange={e => onChange("tagline_background_opacity", parseInt(e.target.value))}
                  className="w-full h-1.5 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-medium text-[#a1a1aa] mb-1">Character Limit</label>
            <div className="flex flex-wrap gap-1.5">
              {TAGLINE_CHAR_LIMITS.map(l => (
                <button
                  key={l.label}
                  onClick={() => {
                    if (l.value === -1) {
                      onChange("tagline_char_limit", taglineCharLimitCustom);
                    } else {
                      onChange("tagline_char_limit", l.value);
                    }
                  }}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${
                    (l.value === -1 && taglineCharLimit > 200) || taglineCharLimit === l.value
                      ? "bg-purple-500 text-white"
                      : "bg-[rgba(255,255,255,0.05)] text-[#a1a1aa] hover:bg-[rgba(255,255,255,0.1)]"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {taglineCharLimit > 200 && (
              <input
                type="number"
                value={taglineCharLimitCustom}
                onChange={e => {
                  const v = parseInt(e.target.value) || 100;
                  onChange("tagline_char_limit", v);
                  onChange("tagline_char_limit_custom", v);
                }}
                placeholder="Custom limit"
                className="mt-1 w-full px-2 py-1 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded text-[11px] text-white"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-[#a1a1aa] mb-1">Top Margin (px)</label>
              <input
                type="number"
                value={taglineTopMargin}
                onChange={e => onChange("tagline_top_margin", e.target.value === "" ? 80 : parseInt(e.target.value, 10))}
                min="0"
                max="500"
                className="w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[#a1a1aa] mb-1">Bottom Margin (px)</label>
              <input
                type="number"
                value={taglineBottomMargin}
                onChange={e => onChange("tagline_bottom_margin", e.target.value === "" ? 80 : parseInt(e.target.value, 10))}
                min="0"
                max="500"
                className="w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-[10px] font-medium text-[#a1a1aa] cursor-pointer">
              <input
                type="checkbox"
                checked={taglineWrapEnabled}
                onChange={e => onChange("tagline_wrap_enabled", e.target.checked)}
                className="w-3.5 h-3.5"
              />
              Enable Text Wrapping
            </label>
            {taglineWrapEnabled && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[9px] text-[#71717a]">Max chars/line:</span>
                <input
                  type="number"
                  value={taglineWrapMaxChars || ""}
                  onChange={e => onChange("tagline_wrap_max_chars", e.target.value === "" ? 0 : parseInt(e.target.value, 10))}
                  placeholder="Auto"
                  className="w-16 px-2 py-0.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded text-[11px] text-white"
                />
                <span className="text-[9px] text-[#71717a]">(0 = auto)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-[#a1a1aa] mb-1 uppercase tracking-wide">Rotation</label>
          <select className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl text-sm text-white focus:outline-none" value={data.tagline_rotation as string || "random"} onChange={e => onChange("tagline_rotation", e.target.value)}>
            <option value="random">Random</option>
            <option value="sequential">Sequential</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#a1a1aa] mb-1 uppercase tracking-wide">Style</label>
          <select className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl text-sm text-white focus:outline-none" value={data.tagline_style as string || "normal"} onChange={e => onChange("tagline_style", e.target.value)}>
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
            <option value="outline">Outline</option>
          </select>
        </div>
      </div>

      <div className="p-3 rounded-xl border" style={{ backgroundColor: colorMap.purple.bg, borderColor: colorMap.purple.border }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: colorMap.purple.bgLight }}>
            <svg className="w-3 h-3" style={{ color: colorMap.purple.text }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
          </div>
          <span className="text-[11px] font-bold" style={{ color: colorMap.purple.text }}>Branding</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="px-3 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white placeholder-[#52525b] focus:outline-none" placeholder="Top: @handle" value={data.branding_text_top as string || ""} onChange={e => onChange("branding_text_top", e.target.value)} />
          <input className="px-3 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white placeholder-[#52525b] focus:outline-none" placeholder="Bottom: Channel" value={data.branding_text_bottom as string || ""} onChange={e => onChange("branding_text_bottom", e.target.value)} />
        </div>
      </div>

      <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-[#a1a1aa]">Watermark</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white placeholder-[#52525b] focus:outline-none" placeholder="@handle" value={data.watermark_text as string || ""} onChange={e => onChange("watermark_text", e.target.value)} />
          <select className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none" value={data.watermark_position as string || "bottomright"} onChange={e => onChange("watermark_position", e.target.value)}>
            <option value="bottomright">Bottom Right</option>
            <option value="bottomleft">Bottom Left</option>
            <option value="topright">Top Right</option>
            <option value="topleft">Top Left</option>
          </select>
          <select className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none" value={data.watermark_fontsize as string || "24"} onChange={e => onChange("watermark_fontsize", e.target.value)}>
            <option value="16">Small</option>
            <option value="24">Medium</option>
            <option value="32">Large</option>
            <option value="48">XL</option>
          </select>
        </div>
      </div>
    </div>
  );
}
