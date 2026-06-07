/**
 * ============================================================================
 * AUTOMATION SYSTEM - Audio Tab Component
 * ============================================================================
 * Advanced multi-track audio feature:
 * - Upload audio to PostForMe (choose file) or paste a direct URL
 * - Preview player with duration display
 * - Source range selection (audio ke kis hisse se clip leni hai)
 * - Loop option (chhoti clip ko section bharne ke liye repeat karna)
 * - Video placement: whole / first N sec / last N sec / custom range
 * - Mix mode: replace (original hatao) ya mix (madham background)
 * - Dual volume sliders + fade in/out
 * ============================================================================
 */
import { useRef, useState } from "react";
import type { TabProps } from "@/lib/types";
import { api, ApiError } from "@/lib/api";

interface AudioTrack {
  url: string;
  use_full_audio: boolean;
  source_start: number;
  source_end: number;
  loop: boolean;
  placement: string; // whole | first | last | custom
  placement_seconds: number;
  placement_start: number;
  placement_end: number;
  mode: string; // replace | mix
  audio_volume: number; // 0-200 %
  original_volume: number; // 0-100 % (mix mode only)
  fade_in: number;
  fade_out: number;
}

const PLACEMENTS = [
  { id: "whole", name: "Whole video (poori video par)" },
  { id: "first", name: "First N seconds (shuru mein)" },
  { id: "last", name: "Last N seconds (aakhir mein)" },
  { id: "custom", name: "Custom range (beech mein)" },
];

const MODES = [
  { id: "replace", name: "Replace original audio" },
  { id: "mix", name: "Mix — background (madham)" },
];

const MAX_AUDIO_TRACKS = 5;

function createAudioTrack(): AudioTrack {
  return {
    url: "",
    use_full_audio: true,
    source_start: 0,
    source_end: 0,
    loop: false,
    placement: "whole",
    placement_seconds: 10,
    placement_start: 0,
    placement_end: 0,
    mode: "replace",
    audio_volume: 100,
    original_volume: 30,
    fade_in: 0,
    fade_out: 0,
  };
}

function normalizeAudioTrack(raw: unknown): AudioTrack {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<AudioTrack>;
  const base = createAudioTrack();
  return {
    url: typeof t.url === "string" ? t.url : base.url,
    use_full_audio: t.use_full_audio !== false,
    source_start: Number.isFinite(Number(t.source_start)) ? Number(t.source_start) : base.source_start,
    source_end: Number.isFinite(Number(t.source_end)) ? Number(t.source_end) : base.source_end,
    loop: t.loop === true,
    placement: typeof t.placement === "string" ? t.placement : base.placement,
    placement_seconds: Number.isFinite(Number(t.placement_seconds)) ? Number(t.placement_seconds) : base.placement_seconds,
    placement_start: Number.isFinite(Number(t.placement_start)) ? Number(t.placement_start) : base.placement_start,
    placement_end: Number.isFinite(Number(t.placement_end)) ? Number(t.placement_end) : base.placement_end,
    mode: typeof t.mode === "string" ? t.mode : base.mode,
    audio_volume: Number.isFinite(Number(t.audio_volume)) ? Number(t.audio_volume) : base.audio_volume,
    original_volume: Number.isFinite(Number(t.original_volume)) ? Number(t.original_volume) : base.original_volume,
    fade_in: Number.isFinite(Number(t.fade_in)) ? Number(t.fade_in) : base.fade_in,
    fade_out: Number.isFinite(Number(t.fade_out)) ? Number(t.fade_out) : base.fade_out,
  };
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const inputClass =
  "w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[11px] text-white placeholder-[#52525b] focus:outline-none";
const labelClass = "block text-[10px] font-medium text-[#a1a1aa] mb-1";

function AudioTrackCard({
  track,
  index,
  onUpdate,
  onRemove,
}: {
  track: AudioTrack;
  index: number;
  onUpdate: (patch: Partial<AudioTrack>) => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [duration, setDuration] = useState<number | null>(null);

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const contentType = file.type && file.type.startsWith("audio/") ? file.type : "audio/mpeg";
      const res = await api.post<{ upload_url: string; media_url: string }>(
        "/api/uploads/audio-upload-url",
        { filename: file.name, content_type: contentType },
        { timeout: 30000 }
      );
      if (!res.success || !res.data?.upload_url || !res.data?.media_url) {
        throw new Error(res.error || "Upload URL nahi mila");
      }
      const putRes = await fetch(res.data.upload_url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }
      onUpdate({ url: res.data.media_url });
    } catch (error) {
      const msg = error instanceof ApiError || error instanceof Error ? error.message : "Upload failed";
      setUploadError(msg);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sourceRangeInvalid =
    !track.use_full_audio &&
    track.source_end > 0 &&
    (track.source_end <= track.source_start ||
      (duration !== null && track.source_start >= duration));

  const clipLength = !track.use_full_audio && track.source_end > track.source_start
    ? track.source_end - track.source_start
    : duration;

  return (
    <div className="p-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-cyan-300">Audio #{index + 1}</span>
        <button
          onClick={onRemove}
          className="text-[10px] text-red-400 hover:text-red-300 px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors"
        >
          Remove
        </button>
      </div>

      {/* Source: upload or URL */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white disabled:opacity-40"
          >
            {uploading ? "Uploading..." : "Choose Audio File"}
          </button>
          <span className="text-[9px] text-[#71717a]">mp3 / wav / m4a — PostForMe par upload hogi</span>
        </div>
        {uploadError && <p className="text-[9px] text-red-400">{uploadError}</p>}
        <div>
          <label className={labelClass}>Audio URL (ya direct link paste karein)</label>
          <input
            className={inputClass}
            placeholder="https://example.com/music.mp3"
            value={track.url}
            onChange={(e) => onUpdate({ url: e.target.value })}
          />
        </div>
      </div>

      {/* Preview + duration */}
      {track.url && (
        <div className="space-y-1">
          <audio
            controls
            preload="metadata"
            src={track.url}
            className="w-full h-8"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          />
          <p className="text-[9px] text-[#a1a1aa]">
            {duration !== null
              ? `Audio duration: ${formatTime(duration)} (${Math.round(duration)} sec)`
              : "Duration load ho rahi hai... (agar load na ho to validation skip hogi)"}
          </p>
        </div>
      )}

      {/* Source range + loop */}
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[10px] text-[#a1a1aa] cursor-pointer">
            <input
              type="checkbox"
              checked={track.use_full_audio}
              onChange={(e) => onUpdate({ use_full_audio: e.target.checked })}
              className="w-3.5 h-3.5"
            />
            Use full audio
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-[#a1a1aa] cursor-pointer">
            <input
              type="checkbox"
              checked={track.loop}
              onChange={(e) => onUpdate({ loop: e.target.checked })}
              className="w-3.5 h-3.5"
            />
            Loop (clip chhoti ho to repeat)
          </label>
        </div>
        {!track.use_full_audio && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Clip start (sec) — audio mein se</label>
              <input
                type="number"
                min={0}
                step={1}
                className={inputClass}
                value={track.source_start}
                onChange={(e) => onUpdate({ source_start: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass}>Clip end (sec) — 0 = end tak</label>
              <input
                type="number"
                min={0}
                step={1}
                className={inputClass}
                value={track.source_end}
                onChange={(e) => onUpdate({ source_end: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              />
            </div>
            {sourceRangeInvalid && (
              <p className="col-span-2 text-[9px] text-red-400">
                Range ghalat hai — end, start se bara hona chahiye aur start audio duration ke andar.
              </p>
            )}
            {!sourceRangeInvalid && clipLength !== null && clipLength > 0 && (
              <p className="col-span-2 text-[9px] text-[#71717a]">
                Selected clip: {formatTime(clipLength)} ({Math.round(clipLength)} sec)
              </p>
            )}
          </div>
        )}
      </div>

      {/* Placement on video */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Video par kahan lagani hai</label>
          <select
            className={inputClass}
            value={track.placement}
            onChange={(e) => onUpdate({ placement: e.target.value })}
          >
            {PLACEMENTS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        {(track.placement === "first" || track.placement === "last") && (
          <div>
            <label className={labelClass}>Seconds</label>
            <input
              type="number"
              min={1}
              step={1}
              className={inputClass}
              value={track.placement_seconds}
              onChange={(e) => onUpdate({ placement_seconds: e.target.value === "" ? 10 : parseFloat(e.target.value) })}
            />
          </div>
        )}
        {track.placement === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Start (sec)</label>
              <input
                type="number"
                min={0}
                step={1}
                className={inputClass}
                value={track.placement_start}
                onChange={(e) => onUpdate({ placement_start: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass}>End (sec)</label>
              <input
                type="number"
                min={0}
                step={1}
                className={inputClass}
                value={track.placement_end}
                onChange={(e) => onUpdate({ placement_end: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mix mode + volumes */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Mode</label>
          <select
            className={inputClass}
            value={track.mode}
            onChange={(e) => onUpdate({ mode: e.target.value })}
          >
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Audio volume: {track.audio_volume}%</label>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={track.audio_volume}
            onChange={(e) => onUpdate({ audio_volume: parseInt(e.target.value, 10) })}
            className="w-full h-1.5 mt-2 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer"
          />
        </div>
        {track.mode === "mix" && (
          <div>
            <label className={labelClass}>Original volume: {track.original_volume}%</label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={track.original_volume}
              onChange={(e) => onUpdate({ original_volume: parseInt(e.target.value, 10) })}
              className="w-full h-1.5 mt-2 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Fades */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Fade in (sec)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            className={inputClass}
            value={track.fade_in}
            onChange={(e) => onUpdate({ fade_in: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Fade out (sec)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            className={inputClass}
            value={track.fade_out}
            onChange={(e) => onUpdate({ fade_out: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}

export default function AudioTab({ data, onChange }: TabProps) {
  const tracks: AudioTrack[] = Array.isArray(data.audio_tracks)
    ? (data.audio_tracks as unknown[]).map(normalizeAudioTrack)
    : [];

  const commit = (next: AudioTrack[]) => onChange("audio_tracks", next);

  const updateTrack = (index: number, patch: Partial<AudioTrack>) => {
    const next = tracks.map((t, i) => (i === index ? { ...t, ...patch } : t));
    commit(next);
  };

  const addTrack = () => {
    if (tracks.length >= MAX_AUDIO_TRACKS) return;
    commit([...tracks, createAudioTrack()]);
  };

  const removeTrack = (index: number) => {
    commit(tracks.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl border bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border-cyan-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-cyan-500/20">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-bold text-white">Audio Tracks</div>
              <div className="text-[10px] text-[#71717a]">Music ya voice-over add karein — replace ya madham background, kisi bhi hisse par</div>
            </div>
          </div>
          <button
            onClick={addTrack}
            disabled={tracks.length >= MAX_AUDIO_TRACKS}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Audio
          </button>
        </div>
      </div>

      {tracks.length === 0 && (
        <div className="p-6 text-center rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] text-[11px] text-[#71717a]">
          Koi audio nahi. &quot;Add Audio&quot; dabayein — file upload karein ya audio URL paste karein (mp3/wav/m4a).
        </div>
      )}

      {tracks.map((track, index) => (
        <AudioTrackCard
          key={index}
          track={track}
          index={index}
          onUpdate={(patch) => updateTrack(index, patch)}
          onRemove={() => removeTrack(index)}
        />
      ))}

      {tracks.length > 0 && (
        <p className="text-[9px] text-[#71717a] px-1">
          Note: Mute settings (Video tab) sirf original audio par lagti hain — yahan add ki gayi audio par nahi.
        </p>
      )}
    </div>
  );
}
