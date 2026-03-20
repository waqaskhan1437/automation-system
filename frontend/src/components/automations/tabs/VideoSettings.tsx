interface Props {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export default function VideoSettings({ data, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Per Run */}
      <div>
        <label className="flex items-center gap-1.5 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
          <span className="text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider">Per Run</span>
        </label>
        <select
          value={(data.videos_per_run as string) || "1"}
          onChange={e => onChange("videos_per_run", e.target.value)}
          className="w-full px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-green-500 focus:outline-none transition-all"
        >
          <option value="1">1 Video</option>
          <option value="3">3 Videos</option>
          <option value="5">5 Videos</option>
          <option value="10">10 Videos</option>
        </select>
      </div>

      {/* Duration */}
      <div>
        <label className="flex items-center gap-1.5 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          <span className="text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider">Duration</span>
        </label>
        <select
          value={(data.short_duration as string) || "60"}
          onChange={e => onChange("short_duration", e.target.value)}
          className="w-full px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-amber-500 focus:outline-none transition-all"
        >
          <option value="15">15 Seconds</option>
          <option value="30">30 Seconds</option>
          <option value="45">45 Seconds</option>
          <option value="60">60 Seconds</option>
          <option value="90">90 Seconds</option>
        </select>
      </div>

      {/* Speed */}
      <div>
        <label className="flex items-center gap-1.5 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
          <span className="text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider">Speed</span>
        </label>
        <select
          value={(data.playback_speed as string) || "1.0"}
          onChange={e => onChange("playback_speed", e.target.value)}
          className="w-full px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-cyan-500 focus:outline-none transition-all"
        >
          <option value="0.5">0.5x Slow</option>
          <option value="0.75">0.75x</option>
          <option value="1.0">1.0x Normal</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x Fast</option>
        </select>
      </div>

      {/* Aspect Ratio */}
      <div>
        <label className="flex items-center gap-1.5 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
          <span className="text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider">Aspect Ratio</span>
        </label>
        <select
          value={(data.aspect_ratio as string) || "9:16"}
          onChange={e => onChange("aspect_ratio", e.target.value)}
          className="w-full px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-purple-500 focus:outline-none transition-all"
        >
          <option value="9:16">9:16 Vertical</option>
          <option value="1:1">1:1 Square</option>
          <option value="16:9">16:9 Horizontal</option>
          <option value="4:5">4:5 Portrait</option>
          <option value="21:9">21:9 Ultra Wide</option>
        </select>
      </div>
    </div>
  );
}