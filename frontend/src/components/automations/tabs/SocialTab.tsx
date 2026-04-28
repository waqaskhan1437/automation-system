import type { AIProviderCatalog, TabProps } from "@/lib/types";

interface SocialTabProps extends TabProps {
  generating?: boolean;
  genResult?: string;
  onAiGenerate?: () => void;
  aiProviders?: AIProviderCatalog[];
  onProviderChange?: (provider: string) => void;
  onModelChange?: (model: string) => void;
  promptModeActive?: boolean;
  promptPlanAvailable?: boolean;
  promptSegmentCount?: number;
  onUsePromptContent?: () => void;
}

const badgeColors: Record<string, { bg: string; text: string }> = {
  blue: { bg: "rgba(59,130,246,0.1)", text: "#60a5fa" },
  green: { bg: "rgba(34,197,94,0.1)", text: "#4ade80" },
  pink: { bg: "rgba(236,72,153,0.1)", text: "#f472b6" },
};

function ContentList({ label, colors, items, placeholder, onChange, isHashtags }: {
  label: string;
  colors: { bg: string; text: string };
  items: string[];
  placeholder: string;
  onChange: (v: string[]) => void;
  isHashtags?: boolean;
}) {
  return (
    <div className="p-2.5 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-[#a1a1aa] uppercase tracking-wide">{label}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.bg, color: colors.text }}>{items.length}</span>
      </div>
      <textarea
        className="w-full h-36 px-2 py-1.5 bg-transparent border-0 text-[11px] text-white placeholder-[#3f3f46] focus:outline-none resize-none"
        placeholder={placeholder}
        value={items.join("\n")}
        onChange={e => {
          if (isHashtags) {
            onChange(e.target.value.split(/[\s,\n]+/).map(h => h.trim()).filter(h => h));
          } else {
            onChange(e.target.value.split("\n").filter(t => t.trim()));
          }
        }}
      />
    </div>
  );
}

function RotationButton({ label, sub, active, onClick }: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-2.5 rounded-xl border text-center transition-all ${
        active ? "border-amber-500/50 bg-amber-500/10" : "border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
      }`}
    >
      <div className="text-[11px] font-bold text-white mb-0.5">{label}</div>
      <div className="text-[9px] text-[#71717a]">{sub}</div>
    </button>
  );
}

export default function SocialTab({
  data,
  onChange,
  generating,
  genResult,
  onAiGenerate,
  aiProviders = [],
  onProviderChange,
  onModelChange,
  promptModeActive = false,
  promptPlanAvailable = false,
  promptSegmentCount = 0,
  onUsePromptContent,
}: SocialTabProps) {
  const titles = (data.titles as string[]) || [];
  const descriptions = (data.descriptions as string[]) || [];
  const hashtags = (data.hashtags as string[]) || [];
  const selectedProvider = (data.social_ai_provider as string) || "";
  const selectedModel = (data.social_ai_model as string) || "";
  const providerModels = aiProviders.find((provider) => provider.id === selectedProvider)?.models || [];
  const hasAiProviders = aiProviders.length > 0;

  return (
    <div className="space-y-3">
      {promptModeActive && (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-cyan-200">Prompt Mode Social Content</div>
              <div className="mt-1 text-[11px] text-cyan-100/80">
                `Short with Prompt` mode me Plan tab se niklay hue titles, descriptions aur hashtags yahan save hote hain aur posting me wahi use hote hain.
              </div>
              {promptSegmentCount > 0 && (
                <div className="mt-2 text-[10px] text-cyan-100/70">
                  Is plan me {promptSegmentCount} short(s) hain, is liye social title/description count bhi auto {promptSegmentCount} par lock rahega.
                </div>
              )}
            </div>
            {promptPlanAvailable && (
              <button
                type="button"
                onClick={onUsePromptContent}
                className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-[11px] font-semibold text-cyan-200"
              >
                Use Prompt Content
              </button>
            )}
          </div>
          {!promptPlanAvailable && (
            <div className="mt-2 text-[10px] text-cyan-100/70">
              Pehle Plan tab me prompt generate karein, phir social content yahan auto-fill ya re-apply ho jayega.
            </div>
          )}
        </div>
      )}

      <div className="p-4 rounded-xl border bg-gradient-to-r from-purple-900/30 to-pink-900/30 border-purple-500/20">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/20">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <div className="text-xs font-bold text-white">AI Social Content</div>
            <div className="text-[10px] text-[#71717a]">Generate titles, descriptions, hashtags</div>
          </div>
        </div>

        <div className="space-y-2">
          <input
            className="w-full px-3 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white placeholder-[#52525b] focus:outline-none"
            placeholder="Topic: e.g., amazing facts, cooking tips, fitness"
            value={data.social_topic as string || ""}
            onChange={e => onChange("social_topic", e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              value={data.social_platform as string || "youtube"}
              onChange={e => onChange("social_platform", e.target.value)}
            >
              <option value="youtube">YouTube</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="twitter">Twitter/X</option>
            </select>
            <select
              className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              value={promptModeActive && promptSegmentCount > 0 ? String(promptSegmentCount) : data.social_count as string || "10"}
              onChange={e => onChange("social_count", e.target.value)}
              disabled={promptModeActive && promptSegmentCount > 0}
            >
              {promptModeActive && promptSegmentCount > 0 && (
                <option value={String(promptSegmentCount)}>{promptSegmentCount} Sets</option>
              )}
              <option value="5">5 Sets</option>
              <option value="10">10 Sets</option>
              <option value="20">20 Sets</option>
              <option value="50">50 Sets</option>
            </select>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <select
              className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              value={selectedProvider}
              onChange={e => onProviderChange?.(e.target.value)}
              disabled={!hasAiProviders}
            >
              {hasAiProviders ? (
                aiProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))
              ) : (
                <option value="">No AI provider saved</option>
              )}
            </select>
            <select
              className="col-span-2 px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              value={selectedModel}
              onChange={e => onModelChange?.(e.target.value)}
              disabled={!selectedProvider || providerModels.length === 0}
            >
              {providerModels.length > 0 ? (
                providerModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))
              ) : (
                <option value="">No model available</option>
              )}
            </select>
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
                  Generate Social Content
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

          {!hasAiProviders && (
            <div className="text-[10px] px-2 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">
              AI provider key pehle Settings me save karein. Popup me sirf saved providers hi dikhaye ja rahe hain.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ContentList
          label="Titles"
          colors={badgeColors.blue}
          items={titles}
          placeholder={"Amazing Video!\nYou Won't Believe!"}
          onChange={v => onChange("titles", v)}
        />
        <ContentList
          label="Descriptions"
          colors={badgeColors.green}
          items={descriptions}
          placeholder={"Check this out!\nAmazing content!"}
          onChange={v => onChange("descriptions", v)}
        />
        <ContentList
          label="Hashtags"
          colors={badgeColors.pink}
          items={hashtags}
          placeholder={"#viral #fyp\n#shorts #trending"}
          onChange={v => onChange("hashtags", v)}
          isHashtags
        />
      </div>

      <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
        <label className="block text-[10px] font-bold text-[#a1a1aa] mb-2 uppercase tracking-wide">Content Rotation</label>
        <div className="grid grid-cols-2 gap-2">
          <RotationButton
            label="Random"
            sub="Pick randomly"
            active={data.content_rotation !== "sequential"}
            onClick={() => onChange("content_rotation", "random")}
          />
          <RotationButton
            label="Sequential"
            sub="Go in order"
            active={data.content_rotation === "sequential"}
            onClick={() => onChange("content_rotation", "sequential")}
          />
        </div>
        <label className="flex items-center gap-2 mt-2 cursor-pointer">
          <input type="checkbox" checked={data.content_rotate_once === true} onChange={e => onChange("content_rotate_once", e.target.checked)} className="accent-amber-500" />
          <span className="text-[10px] text-[#71717a]">{"Don't repeat until all used"}</span>
        </label>
      </div>

      {titles.length > 0 && (
        <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]">
          <div className="text-[10px] font-bold text-[#71717a] mb-2 uppercase tracking-wide">Preview</div>
          <div className="text-[11px] text-white line-clamp-2">{titles[0]}</div>
          {descriptions[0] && <div className="text-[10px] text-[#71717a] mt-1 line-clamp-1">{descriptions[0]}</div>}
          {hashtags.length > 0 && <div className="text-[10px] text-blue-400 mt-1">{(hashtags || []).slice(0, 3).join(" ")}</div>}
        </div>
      )}
    </div>
  );
}
