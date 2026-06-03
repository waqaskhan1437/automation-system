import type { TabProps } from "@/lib/types";

interface Overlay {
  url: string;
  start_seconds: number;
  duration_seconds: number;
  full_video: boolean;
  position: string;
  scale_percent: number;
  animation: string;
  rotation_period_sec: number;
  move_direction: string;
  fade_seconds: number;
  opacity: number;
}

const POSITIONS = [
  { id: "center", name: "Center" },
  { id: "full_cover", name: "Full Cover (stretch)" },
  { id: "top", name: "Top" },
  { id: "bottom", name: "Bottom" },
  { id: "left", name: "Left" },
  { id: "right", name: "Right" },
  { id: "top-left", name: "Top Left" },
  { id: "top-right", name: "Top Right" },
  { id: "bottom-left", name: "Bottom Left" },
  { id: "bottom-right", name: "Bottom Right" },
];

const ANIMATIONS = [
  { id: "none", name: "None" },
  { id: "rotation", name: "Rotation (spin)" },
  { id: "move", name: "Move (slide)" },
  { id: "fade", name: "Fade in/out" },
];

const MOVE_DIRECTIONS = [
  { id: "left_right", name: "Left → Right" },
  { id: "right_left", name: "Right → Left" },
  { id: "top_bottom", name: "Top → Bottom" },
  { id: "bottom_top", name: "Bottom → Top" },
];

const MAX_OVERLAYS = 10;

function createOverlay(): Overlay {
  return {
    url: "",
    start_seconds: 0,
    duration_seconds: 5,
    full_video: true,
    position: "bottom-right",
    scale_percent: 20,
    animation: "none",
    rotation_period_sec: 4,
    move_direction: "left_right",
    fade_seconds: 1,
    opacity: 100,
  };
}

function normalizeOverlay(raw: unknown): Overlay {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Overlay>;
  const base = createOverlay();
  return {
    url: typeof o.url === "string" ? o.url : base.url,
    start_seconds: Number.isFinite(Number(o.start_seconds)) ? Number(o.start_seconds) : base.start_seconds,
    duration_seconds: Number.isFinite(Number(o.duration_seconds)) ? Number(o.duration_seconds) : base.duration_seconds,
    full_video: o.full_video === true,
    position: typeof o.position === "string" ? o.position : base.position,
    scale_percent: Number.isFinite(Number(o.scale_percent)) ? Number(o.scale_percent) : base.scale_percent,
    animation: typeof o.animation === "string" ? o.animation : base.animation,
    rotation_period_sec: Number.isFinite(Number(o.rotation_period_sec)) ? Number(o.rotation_period_sec) : base.rotation_period_sec,
    move_direction: typeof o.move_direction === "string" ? o.move_direction : base.move_direction,
    fade_seconds: Number.isFinite(Number(o.fade_seconds)) ? Number(o.fade_seconds) : base.fade_seconds,
    opacity: Number.isFinite(Number(o.opacity)) ? Number(o.opacity) : base.opacity,
  };
}

const inputClass =
  "w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white placeholder-[#52525b] focus:outline-none";
const labelClass = "block text-[10px] font-medium text-[#a1a1aa] mb-1";

export default function OverlaysTab({ data, onChange }: TabProps) {
  const overlays: Overlay[] = Array.isArray(data.overlays)
    ? (data.overlays as unknown[]).map(normalizeOverlay)
    : [];

  const commit = (next: Overlay[]) => onChange("overlays", next);

  const updateOverlay = (index: number, patch: Partial<Overlay>) => {
    const next = overlays.map((o, i) => (i === index ? { ...o, ...patch } : o));
    commit(next);
  };

  const addOverlay = () => {
    if (overlays.length >= MAX_OVERLAYS) return;
    commit([...overlays, createOverlay()]);
  };

  const removeOverlay = (index: number) => {
    commit(overlays.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl border bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border-indigo-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-500/20">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-bold text-white">Image / Video Overlays</div>
              <div className="text-[10px] text-[#71717a]">Logo, image ya video overlay — har ek ki apni timing, position aur animation</div>
            </div>
          </div>
          <button
            onClick={addOverlay}
            disabled={overlays.length >= MAX_OVERLAYS}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Overlay
          </button>
        </div>
      </div>

      {overlays.length === 0 && (
        <div className="p-6 text-center rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] text-[11px] text-[#71717a]">
          Koi overlay nahi. &quot;Add Overlay&quot; dabayein. Asset ka public image/video URL paste karein (png/jpg/gif/mp4/webm/mov).
        </div>
      )}

      {overlays.map((overlay, index) => (
        <div key={index} className="p-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-300">Overlay #{index + 1}</span>
            <button
              onClick={() => removeOverlay(index)}
              className="text-[10px] text-red-400 hover:text-red-300 px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors"
            >
              Remove
            </button>
          </div>

          <div>
            <label className={labelClass}>Asset URL (image / video / logo)</label>
            <input
              className={inputClass}
              placeholder="https://example.com/logo.png"
              value={overlay.url}
              onChange={(e) => updateOverlay(index, { url: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Position</label>
              <select
                className={inputClass}
                value={overlay.position}
                onChange={(e) => updateOverlay(index, { position: e.target.value })}
              >
                {POSITIONS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Scale: {overlay.scale_percent}% width</label>
              <input
                type="range"
                min={2}
                max={100}
                step={1}
                disabled={overlay.position === "full_cover"}
                value={overlay.scale_percent}
                onChange={(e) => updateOverlay(index, { scale_percent: parseInt(e.target.value, 10) })}
                className="w-full h-1.5 mt-2 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer disabled:opacity-40"
              />
            </div>
            <div>
              <label className={labelClass}>Opacity: {overlay.opacity}%</label>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={overlay.opacity}
                onChange={(e) => updateOverlay(index, { opacity: parseInt(e.target.value, 10) })}
                className="w-full h-1.5 mt-2 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className={labelClass}>Start (seconds)</label>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={overlay.start_seconds}
                onChange={(e) => updateOverlay(index, { start_seconds: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass}>Duration (seconds)</label>
              <input
                type="number"
                min={0.1}
                step={0.5}
                disabled={overlay.full_video}
                className={`${inputClass} disabled:opacity-40`}
                value={overlay.duration_seconds}
                onChange={(e) => updateOverlay(index, { duration_seconds: e.target.value === "" ? 5 : parseFloat(e.target.value) })}
              />
            </div>
            <label className="flex items-center gap-2 text-[10px] text-[#a1a1aa] cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={overlay.full_video}
                onChange={(e) => updateOverlay(index, { full_video: e.target.checked })}
                className="w-3.5 h-3.5"
              />
              Full video
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Animation</label>
              <select
                className={inputClass}
                value={overlay.animation}
                onChange={(e) => updateOverlay(index, { animation: e.target.value })}
              >
                {ANIMATIONS.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {overlay.animation === "rotation" && (
              <div>
                <label className={labelClass}>Rotation period (sec / spin)</label>
                <input
                  type="number"
                  min={0.2}
                  step={0.5}
                  className={inputClass}
                  value={overlay.rotation_period_sec}
                  onChange={(e) => updateOverlay(index, { rotation_period_sec: e.target.value === "" ? 4 : parseFloat(e.target.value) })}
                />
              </div>
            )}

            {overlay.animation === "move" && (
              <div>
                <label className={labelClass}>Move direction</label>
                <select
                  className={inputClass}
                  value={overlay.move_direction}
                  onChange={(e) => updateOverlay(index, { move_direction: e.target.value })}
                >
                  {MOVE_DIRECTIONS.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            {overlay.animation === "fade" && (
              <div>
                <label className={labelClass}>Fade duration (sec)</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className={inputClass}
                  value={overlay.fade_seconds}
                  onChange={(e) => updateOverlay(index, { fade_seconds: e.target.value === "" ? 1 : parseFloat(e.target.value) })}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
