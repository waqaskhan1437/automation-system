interface Props {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export default function ShortsPerSource({ data, onChange }: Props) {
  const mode = (data.source_shorts_mode as string) || "single";

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
      <label className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <span className="text-xs font-semibold text-white">Shorts Per Source</span>
      </label>
      <div className="grid grid-cols-3 gap-2">
        <select
          value={mode}
          onChange={e => onChange("source_shorts_mode", e.target.value)}
          className="col-span-2 px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-pink-500 focus:outline-none"
        >
          <option value="single">Single per video</option>
          <option value="duration_based">Auto by duration</option>
          <option value="fixed_count">Fixed count</option>
        </select>
        {mode === "fixed_count" && (
          <select
            value={(data.source_shorts_max_count as string) || "3"}
            onChange={e => onChange("source_shorts_max_count", e.target.value)}
            className="px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-pink-500 focus:outline-none"
          >
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="5">5</option>
            <option value="10">10</option>
          </select>
        )}
      </div>
    </div>
  );
}