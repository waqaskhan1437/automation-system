import type { AIProviderCatalog, TabProps } from "@/lib/types";

interface ImageSocialTabProps extends TabProps {
  generating?: boolean;
  genResult?: string;
  onAiGenerate?: () => void;
  aiProviders?: AIProviderCatalog[];
  onProviderChange?: (provider: string) => void;
  onModelChange?: (model: string) => void;
}

function ListEditor({
  label,
  items,
  placeholder,
  onChange,
  isHashtags,
}: {
  label: string;
  items: string[];
  placeholder: string;
  onChange: (value: string[]) => void;
  isHashtags?: boolean;
}) {
  return (
    <div className="p-3 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[#a1a1aa]">{label}</span>
        <span className="text-[10px] text-[#71717a]">{items.length}</span>
      </div>
      <textarea
        className="w-full h-40 bg-transparent outline-none resize-none text-sm text-white placeholder-[#52525b]"
        value={items.join("\n")}
        placeholder={placeholder}
        onChange={(event) => {
          if (isHashtags) {
            onChange(event.target.value.split(/[\s,\n]+/).map((value) => value.trim()).filter(Boolean));
            return;
          }
          onChange(event.target.value.split("\n").map((value) => value.trim()).filter(Boolean));
        }}
      />
    </div>
  );
}

export default function ImageSocialContentTab({
  data,
  onChange,
  generating,
  genResult,
  onAiGenerate,
  aiProviders = [],
  onProviderChange,
  onModelChange,
}: ImageSocialTabProps) {
  const titles = Array.isArray(data.titles) ? data.titles as string[] : [];
  const descriptions = Array.isArray(data.descriptions) ? data.descriptions as string[] : [];
  const hashtags = Array.isArray(data.hashtags) ? data.hashtags as string[] : [];
  const selectedProvider = (data.social_ai_provider as string) || "";
  const selectedModel = (data.social_ai_model as string) || "";
  const providerModels = aiProviders.find((provider) => provider.id === selectedProvider)?.models || [];
  const hasAiProviders = aiProviders.length > 0;

  const brandUrlsRaw = (data.brand_urls as string[]) || [];
  const brandUrlsText = Array.isArray(data.brand_urls)
    ? (data.brand_urls as string[]).join("\n")
    : typeof data.brand_urls === "string"
      ? data.brand_urls
      : "";

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl border bg-gradient-to-r from-purple-900/30 to-pink-900/30 border-purple-500/20">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/20">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <div className="text-xs font-bold text-white">AI Content Generation</div>
            <div className="text-[10px] text-[#71717a]">Generate titles, descriptions & hashtags from a prompt</div>
          </div>
        </div>

        <div className="space-y-2">
          <textarea
            className="w-full h-20 px-3 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white placeholder-[#52525b] focus:outline-none resize-none"
            placeholder="AI Prompt: e.g., birthday prank video, product review, cooking tips..."
            value={data.ai_prompt as string || ""}
            onChange={(e) => onChange("ai_prompt", e.target.value)}
          />

          <input
            className="w-full px-3 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white placeholder-[#52525b] focus:outline-none"
            placeholder="Brand / Product Name (e.g., PrankWish)"
            value={data.brand_name as string || ""}
            onChange={(e) => onChange("brand_name", e.target.value)}
          />

          <textarea
            className="w-full h-16 px-3 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white placeholder-[#52525b] focus:outline-none resize-none"
            placeholder={"Brand URLs (one per line, round-robin):\nhttps://prankwish.com\nhttps://prankwish.com/birthday"}
            value={brandUrlsText}
            onChange={(e) => {
              const urls = e.target.value.split("\n").map((u) => u.trim()).filter(Boolean);
              onChange("brand_urls", urls);
            }}
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              value={data.social_platform as string || "instagram"}
              onChange={(e) => onChange("social_platform", e.target.value)}
            >
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
              <option value="tiktok">TikTok</option>
              <option value="facebook">Facebook</option>
              <option value="twitter">Twitter/X</option>
            </select>
            <select
              className="px-2 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white focus:outline-none"
              value={data.social_count as string || "10"}
              onChange={(e) => onChange("social_count", e.target.value)}
            >
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
              onChange={(e) => onProviderChange?.(e.target.value)}
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
              onChange={(e) => onModelChange?.(e.target.value)}
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
            </div>
          )}

          {!hasAiProviders && (
            <div className="text-[10px] px-2 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">
              AI provider key pehle Settings me save karein.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ListEditor
          label="Titles"
          items={titles}
          placeholder={"Instant workflow banner\nSimple branded image post"}
          onChange={(value) => onChange("titles", value)}
        />
        <ListEditor
          label="Descriptions"
          items={descriptions}
          placeholder={"Short branded caption with CTA and link."}
          onChange={(value) => onChange("descriptions", value)}
        />
        <ListEditor
          label="Hashtags"
          items={hashtags}
          placeholder={"#workflow #brandpost #product"}
          onChange={(value) => onChange("hashtags", value)}
          isHashtags
        />
      </div>
    </div>
  );
}
