import type { TabProps } from "@/lib/types";

interface TaglinesTabProps extends TabProps {
  generating?: boolean;
  genResult?: string;
  onAiGenerate?: () => void;
}

const colorMap: Record<string, { bg: string; bgLight: string; text: string; border: string; focusBorder: string }> = {
  green: { bg: "rgba(34,197,94,0.1)", bgLight: "rgba(34,197,94,0.2)", text: "#4ade80", border: "rgba(34,197,94,0.15)", focusBorder: "rgba(34,197,94,0.5)" },
  blue: { bg: "rgba(59,130,246,0.1)", bgLight: "rgba(59,130,246,0.2)", text: "#60a5fa", border: "rgba(59,130,246,0.15)", focusBorder: "rgba(59,130,246,0.5)" },
};

function TaglineSection({ label, colors, icon, items, placeholder, onChange }: {
  label: string;
  colors: { bg: string; bgLight: string; text: string; border: string; focusBorder: string };
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
        </div>
        <span className="text-[9px] text-[#71717a] bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 rounded">{items.length}</span>
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

export default function TaglinesTab({ data, onChange, generating, genResult, onAiGenerate }: TaglinesTabProps) {
  const topTaglines = (data.top_taglines as string[]) || [];
  const bottomTaglines = (data.bottom_taglines as string[]) || [];

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

          <div className="grid grid-cols-3 gap-2">
            <select
              className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              value={data.ai_gen_provider as string || "gemini"}
              onChange={e => onChange("ai_gen_provider", e.target.value)}
            >
              <option value="gemini">Gemini</option>
              <option value="groq">Groq</option>
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter</option>
              <option value="cohere">Cohere</option>
            </select>
            <button
              onClick={onAiGenerate}
              disabled={generating}
              className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white disabled:opacity-50"
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
                  Generate 5 Taglines
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

      <div className="p-3 rounded-xl border" style={{ backgroundColor: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.15)" }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: "rgba(139,92,246,0.2)" }}>
            <svg className="w-3 h-3" style={{ color: "#a78bfa" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
          </div>
          <span className="text-[11px] font-bold" style={{ color: "#a78bfa" }}>Branding</span>
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
