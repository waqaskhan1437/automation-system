import { useState } from "react";

interface Props {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

const perRunPresets = ["1", "3", "5", "10"];
const durationPresets = ["15", "30", "45", "60", "90"];

export default function VideoSettings({ data, onChange }: Props) {
  const currentPerRun = (data.videos_per_run as string) || "1";
  const currentDuration = (data.short_duration as string) || "60";

  const [perRunCustom, setPerRunCustom] = useState(!perRunPresets.includes(currentPerRun));
  const [durationCustom, setDurationCustom] = useState(!durationPresets.includes(currentDuration));

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Per Run */}
      <div>
        <label className="flex items-center gap-1.5 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
          <span className="text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider">Per Run</span>
        </label>
        {!perRunCustom ? (
          <select
            value={currentPerRun}
            onChange={e => {
              if (e.target.value === "custom") {
                setPerRunCustom(true);
                onChange("videos_per_run", "");
              } else {
                onChange("videos_per_run", e.target.value);
              }
            }}
            className="w-full px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-green-500 focus:outline-none transition-all"
          >
            <option value="1">1 Video</option>
            <option value="3">3 Videos</option>
            <option value="5">5 Videos</option>
            <option value="10">10 Videos</option>
            <option value="custom">Custom...</option>
          </select>
        ) : (
          <div className="flex gap-1.5">
            <input
              type="number"
              min="1"
              max="100"
              value={currentPerRun}
              onChange={e => onChange("videos_per_run", e.target.value)}
              placeholder="e.g. 7"
              className="flex-1 px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-green-500/40 rounded-lg text-xs text-white focus:border-green-500 focus:outline-none transition-all"
            />
            <button
              onClick={() => { setPerRunCustom(false); onChange("videos_per_run", "1"); }}
              className="px-2 py-1 text-[10px] rounded-lg bg-[rgba(255,255,255,0.06)] text-[#a1a1aa] hover:text-white transition-all"
              title="Back to presets"
            >&#10005;</button>
          </div>
        )}
      </div>

      {/* Duration */}
      <div>
        <label className="flex items-center gap-1.5 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          <span className="text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider">Duration</span>
        </label>
        {!durationCustom ? (
          <select
            value={currentDuration}
            onChange={e => {
              if (e.target.value === "custom") {
                setDurationCustom(true);
                onChange("short_duration", "");
              } else {
                onChange("short_duration", e.target.value);
              }
            }}
            className="w-full px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:border-amber-500 focus:outline-none transition-all"
          >
            <option value="15">15 Seconds</option>
            <option value="30">30 Seconds</option>
            <option value="45">45 Seconds</option>
            <option value="60">60 Seconds</option>
            <option value="90">90 Seconds</option>
            <option value="custom">Custom...</option>
          </select>
        ) : (
          <div className="flex gap-1.5">
            <input
              type="number"
              min="1"
              max="3600"
              value={currentDuration}
              onChange={e => onChange("short_duration", e.target.value)}
              placeholder="e.g. 120"
              className="flex-1 px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-amber-500/40 rounded-lg text-xs text-white focus:border-amber-500 focus:outline-none transition-all"
            />
            <span className="flex items-center text-[10px] text-[#a1a1aa]">sec</span>
            <button
              onClick={() => { setDurationCustom(false); onChange("short_duration", "60"); }}
              className="px-2 py-1 text-[10px] rounded-lg bg-[rgba(255,255,255,0.06)] text-[#a1a1aa] hover:text-white transition-all"
              title="Back to presets"
            >&#10005;</button>
          </div>
        )}
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
          <optgroup label="Crop (fill screen, may cut edges)">
            <option value="9:16">9:16 Vertical (Crop)</option>
            <option value="1:1">1:1 Square (Crop)</option>
            <option value="16:9">16:9 Horizontal (Crop)</option>
            <option value="4:5">4:5 Portrait (Crop)</option>
            <option value="21:9">21:9 Ultra Wide (Crop)</option>
          </optgroup>
          <optgroup label="No Crop (black bars, nothing cut)">
            <option value="9:16-fit">9:16 Vertical (No Crop)</option>
            <option value="1:1-fit">1:1 Square (No Crop)</option>
            <option value="16:9-fit">16:9 Horizontal (No Crop)</option>
            <option value="4:5-fit">4:5 Portrait (No Crop)</option>
          </optgroup>
          <optgroup label="Original">
            <option value="original">Keep Original (No Change)</option>
          </optgroup>
        </select>
      </div>
    </div>
  );
}