interface Props {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export default function ShortsPerSource({ data, onChange }: Props) {
  const mode = (data.source_shorts_mode as string) || "single";
  const maxCount = (data.source_shorts_max_count as string) || "3";
  const targetDuration = (data.short_duration as string) || "60";
  const autoShortsCount = Math.max(1, Math.ceil(parseInt(targetDuration || "60", 10) / 10));

  const getModeDescription = () => {
    switch (mode) {
      case "single":
        return "1 short per video";
      case "fixed_count":
        return `${maxCount} shorts per video`;
      case "duration_based":
        return `Auto ~${autoShortsCount} shorts`;
      default:
        return "1 short per video";
    }
  };

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
      <label className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs font-semibold text-white">Shorts Per Video</span>
        <span className="px-1.5 py-0.5 text-[9px] bg-pink-500/20 text-pink-400 rounded-full">
          {getModeDescription()}
        </span>
      </label>
      
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <select
            value={mode}
            onChange={e => onChange("source_shorts_mode", e.target.value)}
            className="col-span-2 px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-pink-500 focus:outline-none"
          >
            <option value="single">Single</option>
            <option value="fixed_count">Split Video</option>
            <option value="duration_based">Auto by Duration</option>
          </select>
          {mode === "fixed_count" && (
            <select
              value={maxCount}
              onChange={e => onChange("source_shorts_max_count", e.target.value)}
              className="px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-pink-500 focus:outline-none"
            >
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="8">8</option>
              <option value="10">10</option>
            </select>
          )}
        </div>
        
        {mode === "fixed_count" && (
          <div className="p-2 rounded-lg bg-pink-500/5 border border-pink-500/10">
            <p className="text-[9px] text-pink-300">
              <span className="font-semibold">How it works:</span> Video ({targetDuration}s) will be split into {maxCount} equal parts. 
              Each part is processed and uploaded separately as a short.
            </p>
            <p className="text-[9px] text-pink-300 mt-1">
              Example: 60s video with "3 shorts" = 3 x 20s shorts
            </p>
          </div>
        )}
        
        {mode === "duration_based" && (
          <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
            <p className="text-[9px] text-blue-300">
              <span className="font-semibold">How it works:</span> Auto-calculate how many shorts to make based on target duration.
            </p>
            <p className="text-[9px] text-blue-300 mt-1">
              ~{autoShortsCount} shorts for {targetDuration}s target (assuming ~10s per short)
            </p>
          </div>
        )}
        
        {mode === "single" && (
          <div className="p-2 rounded-lg bg-green-500/5 border border-green-500/10">
            <p className="text-[9px] text-green-300">
              Full video will be trimmed to {targetDuration}s and uploaded as one short.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
