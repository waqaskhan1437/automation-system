import { useState, useEffect, useCallback } from "react";

interface Props {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

interface SpeedSegment {
  id: string;
  start: number;
  end: number;
  speed: number;
}

const SPEED_OPTIONS = [
  { value: 0.25, label: "0.25x Very Slow" },
  { value: 0.5,  label: "0.5x Slow" },
  { value: 0.75, label: "0.75x" },
  { value: 1.0,  label: "1.0x Normal" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5,  label: "1.5x Fast" },
  { value: 2.0,  label: "2.0x" },
  { value: 2.5,  label: "2.5x" },
  { value: 3.0,  label: "3.0x" },
  { value: 4.0,  label: "4.0x" },
  { value: 5.0,  label: "5.0x Ultra" },
];

function parseSegments(saved: unknown): SpeedSegment[] {
  try {
    const raw = typeof saved === "string" ? JSON.parse(saved) : saved;
    if (Array.isArray(raw) && raw.length > 0) return raw;
  } catch {}
  return [{ id: "1", start: 0, end: 60, speed: 2.0 }];
}

export default function SpeedControl({ data, onChange }: Props) {
  const enabled = data.speed_mode !== undefined && data.speed_mode !== "none";
  const speedMode = (data.speed_mode as string) || "none";

  // whole mode speed value
  const [wholeSpeed, setWholeSpeed] = useState<number>(
    parseFloat((data.speed_whole_value as string) || "2.0")
  );

  // segments mode
  const [segments, setSegments] = useState<SpeedSegment[]>(() =>
    parseSegments(data.speed_segments)
  );

  // first_last mode values
  const [firstSeconds, setFirstSeconds] = useState<number>(
    parseFloat((data.speed_first_seconds as string) || "5")
  );
  const [firstSpeed, setFirstSpeed] = useState<number>(
    parseFloat((data.speed_first_value as string) || "2.0")
  );
  const [lastSeconds, setLastSeconds] = useState<number>(
    parseFloat((data.speed_last_seconds as string) || "5")
  );
  const [lastSpeed, setLastSpeed] = useState<number>(
    parseFloat((data.speed_last_value as string) || "2.0")
  );

  // Sync ONLY on first load when editing existing automation
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized && data.speed_mode && data.speed_mode !== "none") {
      if (data.speed_whole_value) {
        setWholeSpeed(parseFloat(data.speed_whole_value as string));
      }
      if (data.speed_segments) {
        setSegments(parseSegments(data.speed_segments));
      }
      if (data.speed_first_seconds) {
        setFirstSeconds(parseFloat(data.speed_first_seconds as string));
      }
      if (data.speed_first_value) {
        setFirstSpeed(parseFloat(data.speed_first_value as string));
      }
      if (data.speed_last_seconds) {
        setLastSeconds(parseFloat(data.speed_last_seconds as string));
      }
      if (data.speed_last_value) {
        setLastSpeed(parseFloat(data.speed_last_value as string));
      }
      setInitialized(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.speed_mode]);

  const setMode = useCallback((mode: string) => {
    onChange("speed_mode", mode);
    if (mode === "whole") {
      onChange("speed_whole_value", wholeSpeed.toString());
      onChange("speed_segments", "[]");
      onChange("speed_first_seconds", "5");
      onChange("speed_first_value", "2.0");
      onChange("speed_last_seconds", "5");
      onChange("speed_last_value", "2.0");
    } else if (mode === "segments") {
      onChange("speed_segments", JSON.stringify(segments));
      onChange("speed_whole_value", "1.0");
      onChange("speed_first_seconds", "5");
      onChange("speed_first_value", "2.0");
      onChange("speed_last_seconds", "5");
      onChange("speed_last_value", "2.0");
    } else if (mode === "first_last") {
      onChange("speed_whole_value", "1.0");
      onChange("speed_segments", "[]");
      onChange("speed_first_seconds", firstSeconds.toString());
      onChange("speed_first_value", firstSpeed.toString());
      onChange("speed_last_seconds", lastSeconds.toString());
      onChange("speed_last_value", lastSpeed.toString());
    } else {
      // none
      onChange("speed_segments", "[]");
      onChange("speed_whole_value", "1.0");
      onChange("speed_first_seconds", "5");
      onChange("speed_first_value", "2.0");
      onChange("speed_last_seconds", "5");
      onChange("speed_last_value", "2.0");
    }
  }, [wholeSpeed, segments, onChange, firstSeconds, firstSpeed, lastSeconds, lastSpeed]);

  const handleWholeSpeedChange = useCallback((val: number) => {
    setWholeSpeed(val);
    onChange("speed_whole_value", val.toString());
    // Also push as a single full-video segment so FFmpeg picks it up
    const seg = [{ id: "1", start: 0, end: 99999, speed: val }];
    onChange("speed_segments", JSON.stringify(seg));
  }, [onChange]);

  const addSegment = useCallback(() => {
    const last = segments[segments.length - 1];
    const newStart = last ? Math.max(last.start, last.end) : 0;
    const newSeg: SpeedSegment = {
      id: Date.now().toString(),
      start: newStart,
      end: newStart + 30,
      speed: 2.0,
    };
    
    // Validate new segment
    if (newSeg.end <= newSeg.start || newSeg.speed <= 0) return;
    
    const updated = [...segments, newSeg];
    setSegments(updated);
    onChange("speed_segments", JSON.stringify(updated));
  }, [segments, onChange]);

  const removeSegment = useCallback((id: string) => {
    const updated = segments.filter((s) => s.id !== id);
    setSegments(updated);
    onChange("speed_segments", JSON.stringify(updated));
  }, [segments, onChange]);

  const updateSegment = useCallback((id: string, field: keyof SpeedSegment, value: number) => {
    // Validate
    if (value < 0) return;
    
    let updated = segments.map((s) =>
      s.id === id ? { ...s, [field]: value } : s
    );
    
    // Ensure start < end
    updated = updated.map((s) => ({
      ...s,
      end: Math.max(s.start + 1, s.end),
    }));
    
    // Filter out invalid segments
    updated = updated.filter((s) => s.end > s.start && s.speed > 0);
    
    setSegments(updated);
    onChange("speed_segments", JSON.stringify(updated));
  }, [segments, onChange]);

  const getSpeedColor = (speed: number) => {
    if (speed > 1) return { bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.4)", text: "#f97316" };
    if (speed < 1) return { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.4)", text: "#3b82f6" };
    return { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.4)", text: "#22c55e" };
  };

  return (
    <div className="space-y-3">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-400"></span>
          <h3 className="text-xs font-bold text-white uppercase tracking-wide">Speed Control</h3>
          {enabled && speedMode !== "none" && (
            <span className="px-1.5 py-0.5 text-[9px] bg-orange-500/20 text-orange-400 rounded-full uppercase">
              {speedMode === "whole" ? `Whole ${wholeSpeed}x` : speedMode === "first_last" ? `First/Last` : `${segments.length} seg`}
            </span>
          )}
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setMode(e.target.checked ? "whole" : "none")}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-[rgba(255,255,255,0.1)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
        </label>
      </div>

      {enabled && (
        <div className="space-y-3 pl-3 border-l-2 border-orange-500/30">

          {/* Mode Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode("whole")}
              className={`flex-1 py-1.5 text-[10px] font-medium rounded-lg border transition-all ${
                speedMode === "whole"
                  ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                  : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-[#71717a] hover:text-white"
              }`}
            >
              🎬 Whole Video
            </button>
            <button
              onClick={() => setMode("first_last")}
              className={`flex-1 py-1.5 text-[10px] font-medium rounded-lg border transition-all ${
                speedMode === "first_last"
                  ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                  : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-[#71717a] hover:text-white"
              }`}
            >
              ⚡ First/Last
            </button>
            <button
              onClick={() => setMode("segments")}
              className={`flex-1 py-1.5 text-[10px] font-medium rounded-lg border transition-all ${
                speedMode === "segments"
                  ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                  : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-[#71717a] hover:text-white"
              }`}
            >
              ✂️ Segments
            </button>
          </div>

          {/* WHOLE VIDEO MODE */}
          {speedMode === "whole" && (
            <div className="p-3 bg-[rgba(255,255,255,0.03)] rounded-xl border border-[rgba(255,255,255,0.08)]">
              <p className="text-[10px] text-[#a1a1aa] mb-3">Apply one speed to the entire video</p>

              {/* Speed visual selector */}
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0].map((s) => {
                  const c = getSpeedColor(s);
                  const active = wholeSpeed === s;
                  return (
                    <button
                      key={s}
                      onClick={() => handleWholeSpeedChange(s)}
                      style={active ? { background: c.bg, borderColor: c.border, color: c.text } : {}}
                      className={`py-1.5 text-[10px] font-medium rounded-lg border transition-all ${
                        active
                          ? "font-bold"
                          : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-[#71717a] hover:text-white hover:border-[rgba(255,255,255,0.2)]"
                      }`}
                    >
                      {s}x
                    </button>
                  );
                })}
              </div>

              {/* Custom speed dropdown */}
              <div>
                <label className="text-[9px] text-[#71717a] mb-1 block">Custom Speed</label>
                <select
                  value={wholeSpeed}
                  onChange={(e) => handleWholeSpeedChange(parseFloat(e.target.value))}
                  className="w-full px-2 py-1.5 text-[10px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-white focus:border-orange-500 focus:outline-none"
                >
                  {SPEED_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Result preview */}
              <div className="mt-3 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
                <p className="text-[9px] text-[#71717a]">
                  Example: 60s video at <span style={{ color: getSpeedColor(wholeSpeed).text }}>{wholeSpeed}x</span> →{" "}
                  <span className="text-white font-medium">{(60 / wholeSpeed).toFixed(1)}s output</span>
                </p>
              </div>
            </div>
          )}

          {/* FIRST_LAST MODE */}
          {speedMode === "first_last" && (
            <div className="p-3 bg-[rgba(255,255,255,0.03)] rounded-xl border border-[rgba(255,255,255,0.08)]">
              <p className="text-[10px] text-[#a1a1aa] mb-3">Speed up first & last parts, keep middle normal</p>
              
              <div className="grid grid-cols-2 gap-4">
                {/* First part */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                    <span className="text-[9px] text-orange-400 font-medium uppercase">First Part</span>
                  </div>
                  <div>
                    <label className="text-[9px] text-[#71717a] mb-1 block">Duration (sec)</label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={firstSeconds}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 5;
                        setFirstSeconds(val);
                        onChange("speed_first_seconds", val.toString());
                      }}
                      className="w-full px-2 py-1.5 text-[10px] bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-[#71717a] mb-1 block">Speed</label>
                    <select
                      value={firstSpeed}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setFirstSpeed(val);
                        onChange("speed_first_value", val.toString());
                      }}
                      className="w-full px-2 py-1.5 text-[10px] bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:border-orange-500 focus:outline-none"
                    >
                      {SPEED_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* Last part */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-red-400"></span>
                    <span className="text-[9px] text-red-400 font-medium uppercase">Last Part</span>
                  </div>
                  <div>
                    <label className="text-[9px] text-[#71717a] mb-1 block">Duration (sec)</label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={lastSeconds}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 5;
                        setLastSeconds(val);
                        onChange("speed_last_seconds", val.toString());
                      }}
                      className="w-full px-2 py-1.5 text-[10px] bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-[#71717a] mb-1 block">Speed</label>
                    <select
                      value={lastSpeed}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setLastSpeed(val);
                        onChange("speed_last_value", val.toString());
                      }}
                      className="w-full px-2 py-1.5 text-[10px] bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:border-orange-500 focus:outline-none"
                    >
                      {SPEED_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Preview */}
              <div className="mt-3 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
                <p className="text-[9px] text-[#71717a]">
                  <span style={{ color: "#f97316" }}>First {firstSeconds}s @ {firstSpeed}x</span>
                  {" | "}
                  <span style={{ color: "#22c55e" }}>Middle @ 1x</span>
                  {" | "}
                  <span style={{ color: "#ef4444" }}>Last {lastSeconds}s @ {lastSpeed}x</span>
                </p>
              </div>
            </div>
          )}

          {/* SEGMENTS MODE */}
          {speedMode === "segments" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#a1a1aa]">Custom time segments</span>
                <button
                  onClick={addSegment}
                  className="px-2 py-0.5 text-[9px] bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 border border-orange-500/20 transition-colors"
                >
                  + Add Segment
                </button>
              </div>

              {segments.map((seg, index) => {
                const c = getSpeedColor(seg.speed);
                return (
                  <div
                    key={seg.id}
                    className="p-2.5 rounded-xl border"
                    style={{ background: c.bg, borderColor: c.border }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold" style={{ color: c.text }}>
                        Segment {index + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[#71717a]">
                          {seg.start}s – {seg.end}s @ {seg.speed}x
                        </span>
                        {segments.length > 1 && (
                          <button
                            onClick={() => removeSegment(seg.id)}
                            className="w-4 h-4 flex items-center justify-center text-[10px] text-red-400 hover:text-red-300 bg-red-500/10 rounded hover:bg-red-500/20 transition-colors"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-[#71717a] mb-0.5 block">Start (sec)</label>
                        <input
                          type="number"
                          min="0"
                          value={seg.start}
                          onChange={(e) => updateSegment(seg.id, "start", parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-[10px] bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-[#71717a] mb-0.5 block">End (sec)</label>
                        <input
                          type="number"
                          min="0"
                          value={seg.end}
                          onChange={(e) => updateSegment(seg.id, "end", parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-[10px] bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-[#71717a] mb-0.5 block">Speed</label>
                        <select
                          value={seg.speed}
                          onChange={(e) => updateSegment(seg.id, "speed", parseFloat(e.target.value))}
                          className="w-full px-2 py-1 text-[10px] bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:border-orange-500 focus:outline-none"
                        >
                          {SPEED_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Timeline preview bar */}
              {segments.length > 0 && (
                <div className="p-2 bg-[rgba(255,255,255,0.02)] rounded-lg">
                  <p className="text-[9px] text-[#71717a] mb-1.5">Timeline:</p>
                  <div className="flex flex-wrap gap-1">
                    {[...segments]
                      .sort((a, b) => a.start - b.start)
                      .map((seg) => {
                        const c = getSpeedColor(seg.speed);
                        return (
                          <span
                            key={seg.id}
                            className="px-2 py-0.5 rounded-full text-[9px] font-medium"
                            style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                          >
                            {seg.start}s–{seg.end}s {seg.speed}x
                          </span>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
