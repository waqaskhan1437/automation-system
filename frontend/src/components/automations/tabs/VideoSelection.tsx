interface Props {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export default function VideoSelection({ data, onChange }: Props) {
  const selection = data.video_selection as string || "days";
  const days = data.video_days as string || "7";

  const handleChange = (value: string) => {
    if (value === "date_range") {
      onChange("video_selection", "date_range");
    } else {
      onChange("video_selection", "days");
      onChange("video_days", value);
    }
  };

  const currentValue = selection === "date_range" ? "date_range" : days;

  return (
    <div>
      <label className="flex items-center gap-1.5 mb-1.5">
        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span className="text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider">Video Selection</span>
      </label>
      <select
        className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none transition-all"
        value={currentValue}
        onChange={e => handleChange(e.target.value)}
      >
        <option value="1">Today</option>
        <option value="2">Yesterday</option>
        <option value="7">Last 7 Days</option>
        <option value="14">Last 14 Days</option>
        <option value="30">Last 30 Days</option>
        <option value="date_range">Custom Range</option>
      </select>

      {selection === "date_range" && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <input
            type="date"
            value={(data.date_from as string) || ""}
            onChange={e => onChange("date_from", e.target.value)}
            className="px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-purple-500 focus:outline-none"
          />
          <input
            type="date"
            value={(data.date_to as string) || ""}
            onChange={e => onChange("date_to", e.target.value)}
            className="px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-purple-500 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
