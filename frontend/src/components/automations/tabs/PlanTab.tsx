import type { AIProviderCatalog, TabProps } from "@/lib/types";

interface PromptPlanSegment {
  hook: string;
  title: string;
  caption: string;
  hashtags: string[];
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
}

interface PromptPlanData {
  overview: string;
  recommended_merge: boolean;
  segments: PromptPlanSegment[];
  titles: string[];
  descriptions: string[];
  hashtags: string[];
}

interface PlanTabProps extends TabProps {
  isLocalRunnerUser?: boolean;
  aiProviders?: AIProviderCatalog[];
  generating?: boolean;
  genResult?: string;
  onAiGenerate?: () => void;
  onProviderChange?: (provider: string) => void;
  onModelChange?: (model: string) => void;
  onPromptSourceTypeChange?: (value: string) => void;
  onPromptPickLocalFile?: () => void;
}

function formatSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function PlanTab({
  data,
  onChange,
  isLocalRunnerUser = false,
  aiProviders = [],
  generating,
  genResult,
  onAiGenerate,
  onProviderChange,
  onModelChange,
  onPromptSourceTypeChange,
  onPromptPickLocalFile,
}: PlanTabProps) {
  const selectedMode = (data.short_generation_mode as string) || "normal";
  const selectedProvider = (data.prompt_ai_provider as string) || "";
  const selectedModel = (data.prompt_ai_model as string) || "";
  const selectedPromptSource = (data.prompt_source_type as string) || (isLocalRunnerUser ? "local_file" : "youtube");
  const promptVideoUrl = (data.prompt_video_url as string) || "";
  const promptLocalFilePath = (data.prompt_local_file_path as string) || "";
  const providerModels = aiProviders.find((provider) => provider.id === selectedProvider)?.models || [];
  const hasAiProviders = aiProviders.length > 0;
  const plan = (data.prompt_short_plan as PromptPlanData | undefined) || null;
  const segments = Array.isArray(plan?.segments) ? plan.segments : [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/40 via-slate-950/70 to-emerald-950/30 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-white">Workflow Mode</div>
            <div className="mt-1 text-[11px] text-slate-400">
              `Normal Workflow` purana Basic tab links system use karega. `Short with Prompt` ek single source video ke sath prompt-driven plan chalaye ga.
            </div>
          </div>
          <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
            Phase 1
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange("short_generation_mode", "normal")}
            className={`rounded-2xl border p-4 text-left transition-all ${
              selectedMode === "normal"
                ? "border-emerald-400/40 bg-emerald-400/10"
                : "border-white/8 bg-white/4 hover:border-white/15"
            }`}
          >
            <div className="text-sm font-semibold text-white">Normal Workflow</div>
            <div className="mt-1 text-[11px] text-slate-400">
              Existing Basic tab aur Video tab ka pura current flow bilkul waise hi chalega.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChange("short_generation_mode", "prompt")}
            className={`rounded-2xl border p-4 text-left transition-all ${
              selectedMode === "prompt"
                ? "border-cyan-400/40 bg-cyan-400/10"
                : "border-white/8 bg-white/4 hover:border-white/15"
            }`}
          >
            <div className="text-sm font-semibold text-white">Short with Prompt</div>
            <div className="mt-1 text-[11px] text-slate-400">
              Single video source select karein, phir prompt se hooks, captions, hashtags, timestamps aur durations auto-generate kar dein.
            </div>
          </button>
        </div>
      </div>

      {selectedMode === "prompt" && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-white">Prompt Source Setup</div>
              <div className="mt-1 text-[11px] text-slate-400">
                Short with Prompt mode mein sirf ek hi source video process hoga. Normal workflow ke multi-link inputs yahan use nahi honge.
              </div>
            </div>
            <div className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              Phase 2
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {isLocalRunnerUser && (
              <button
                type="button"
                onClick={() => onPromptSourceTypeChange?.("local_file")}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  selectedPromptSource === "local_file"
                    ? "border-emerald-400/40 bg-emerald-400/10"
                    : "border-white/8 bg-white/4 hover:border-white/15"
                }`}
              >
                <div className="text-sm font-semibold text-white">Choose Local File</div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Local runner PC se ek single video file choose karein.
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => onPromptSourceTypeChange?.("youtube")}
              className={`rounded-2xl border p-4 text-left transition-all ${
                selectedPromptSource === "youtube"
                  ? "border-red-400/40 bg-red-400/10"
                  : "border-white/8 bg-white/4 hover:border-white/15"
              }`}
            >
              <div className="text-sm font-semibold text-white">YouTube URL</div>
              <div className="mt-1 text-[11px] text-slate-400">
                GitHub Actions ya local runner dono ke liye ek single YouTube video URL.
              </div>
            </button>

            <button
              type="button"
              onClick={() => onPromptSourceTypeChange?.("direct")}
              className={`rounded-2xl border p-4 text-left transition-all ${
                selectedPromptSource === "direct"
                  ? "border-blue-400/40 bg-blue-400/10"
                  : "border-white/8 bg-white/4 hover:border-white/15"
              }`}
            >
              <div className="text-sm font-semibold text-white">Direct Video Link</div>
              <div className="mt-1 text-[11px] text-slate-400">
                Single MP4 ya direct video URL ke sath prompt-driven short banayein.
              </div>
            </button>
          </div>

          {selectedPromptSource === "local_file" && isLocalRunnerUser && (
            <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Selected Local Video</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Native picker se file choose karein ya path manually paste karein.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onPromptPickLocalFile}
                  className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-300"
                >
                  Choose File
                </button>
              </div>

              <input
                type="text"
                className="mt-3 w-full rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                value={promptLocalFilePath}
                onChange={(event) => onChange("prompt_local_file_path", event.target.value)}
                placeholder={"C:\\Videos\\single-source.mp4"}
              />
              <p className="mt-2 text-[11px] text-slate-400">
                Yeh path local runner PC par accessible hona chahiye. Prompt mode is file ko direct process karega.
              </p>
            </div>
          )}

          {(selectedPromptSource === "youtube" || selectedPromptSource === "direct") && (
            <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/50 p-4">
              <div className="text-sm font-semibold text-white">
                {selectedPromptSource === "youtube" ? "YouTube Video URL" : "Direct Video URL"}
              </div>
              <input
                type="url"
                className="mt-3 w-full rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                value={promptVideoUrl}
                onChange={(event) => onChange("prompt_video_url", event.target.value)}
                placeholder={selectedPromptSource === "youtube"
                  ? "https://www.youtube.com/watch?v=abc123"
                  : "https://example.com/video.mp4"}
              />
              <p className="mt-2 text-[11px] text-slate-400">
                Short with Prompt mode ek hi URL process karega. Multiple links ke liye normal workflow use karein.
              </p>
            </div>
          )}
        </div>
      )}

      {selectedMode === "prompt" && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-white">AI Prompt Reader</div>
              <div className="text-[10px] text-slate-400">Prompt parse karke generated short plan preview karega.</div>
            </div>
            <div className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
              Phase 3
            </div>
          </div>

          <div className="mb-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-cyan-200">Short Merge Output</div>
                <div className="mt-1 text-[11px] text-cyan-100/75">
                  Agar multiple generated shorts ko aik final merged video me jorna ho to isi toggle ko on karein. Yeh setting isi Plan tab se control hoti hai.
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-cyan-100">
                <input
                  type="checkbox"
                  checked={data.prompt_merge_generated_shorts === true}
                  onChange={(event) => onChange("prompt_merge_generated_shorts", event.target.checked)}
                  className="accent-cyan-400"
                />
                Merge generated shorts
              </label>
            </div>
            <div className="mt-2 text-[10px] text-cyan-100/65">
              Prompt plan titles, descriptions, hashtags aur timestamps runtime me auto-apply honge.
            </div>
          </div>

          <textarea
            className="min-h-[180px] w-full rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3 text-xs text-white placeholder:text-slate-500 focus:outline-none"
            placeholder="YouTube Ask ya manual prompt yahan paste karein..."
            value={(data.prompt_analysis_text as string) || ""}
            onChange={(event) => onChange("prompt_analysis_text", event.target.value)}
          />

          <div className="mt-3 grid grid-cols-4 gap-2">
            <select
              className="rounded-xl border border-white/8 bg-slate-950/60 px-2 py-2 text-[11px] text-white focus:outline-none"
              value={selectedProvider}
              onChange={(event) => onProviderChange?.(event.target.value)}
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
              className="col-span-2 rounded-xl border border-white/8 bg-slate-950/60 px-2 py-2 text-[11px] text-white focus:outline-none"
              value={selectedModel}
              onChange={(event) => onModelChange?.(event.target.value)}
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
              type="button"
              onClick={onAiGenerate}
              disabled={generating || !hasAiProviders || !selectedProvider || !selectedModel}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate Plan"}
            </button>
          </div>

          {genResult && (
            <div
              className={`mt-3 rounded-xl border px-3 py-2 text-[11px] ${
                genResult.toLowerCase().includes("generated")
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                  : "border-red-500/20 bg-red-500/10 text-red-300"
              }`}
            >
              {genResult}
            </div>
          )}

          {!hasAiProviders && (
            <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              Prompt reader chalane ke liye pehle Settings me AI API key save karein.
            </div>
          )}
        </div>
      )}

      {selectedMode === "prompt" && plan && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white">Generated Plan</div>
                <div className="mt-1 text-[11px] text-slate-400">{plan.overview || "Prompt plan ready."}</div>
                {segments.length > 1 && (
                  <div className="mt-2 text-[10px] text-cyan-300">
                    Merge output is {data.prompt_merge_generated_shorts === true ? "enabled" : "disabled"} for these {segments.length} shorts.
                  </div>
                )}
              </div>
              <div className="text-right text-[10px] text-slate-400">
                <div>{segments.length} short idea(s)</div>
                <div>{plan.recommended_merge ? "AI merge: yes" : "AI merge: no"}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {segments.map((segment, index) => (
              <div key={`${segment.start_seconds}-${segment.end_seconds}-${index}`} className="rounded-2xl border border-white/8 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{segment.title || `Short ${index + 1}`}</div>
                  <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-300">
                    {formatSeconds(segment.start_seconds)} - {formatSeconds(segment.end_seconds)}
                  </div>
                </div>
                <div className="mt-2 text-[11px] font-medium text-cyan-300">{segment.hook}</div>
                <div className="mt-2 text-[11px] leading-5 text-slate-300">{segment.caption}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {segment.hashtags.map((hashtag) => (
                    <span key={hashtag} className="rounded-full bg-white/6 px-2 py-1 text-[10px] text-slate-300">
                      {hashtag}
                    </span>
                  ))}
                </div>
                <div className="mt-3 text-[10px] text-slate-500">Duration: {Math.max(1, Math.round(segment.duration_seconds))} sec</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
