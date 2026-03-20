import { ToggleCard } from "@/components/ui";

interface Props {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export default function VideoToggles({ data, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* Rotation */}
      <ToggleCard
        icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
        title="Rotation"
        subtitle="Smart shuffle"
        checked={data.rotation_enabled !== false}
        onChange={v => onChange("rotation_enabled", v)}
        color="green"
      >
        <div className="flex gap-3">
          <label className="flex items-center gap-1.5 text-[10px] text-[#a1a1aa] cursor-pointer">
            <input type="checkbox" checked={data.rotation_shuffle === true} onChange={e => onChange("rotation_shuffle", e.target.checked)} className="accent-green-500 w-3 h-3" />
            Shuffle
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-[#a1a1aa] cursor-pointer">
            <input type="checkbox" checked={data.rotation_auto_reset === true} onChange={e => onChange("rotation_auto_reset", e.target.checked)} className="accent-green-500 w-3 h-3" />
            Auto Reset
          </label>
        </div>
      </ToggleCard>

      {/* Captions */}
      <ToggleCard
        icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>}
        title="Captions"
        subtitle="Whisper AI"
        checked={data.whisper_enabled === true}
        onChange={v => onChange("whisper_enabled", v)}
        color="blue"
      >
        <select
          value={(data.whisper_language as string) || "en"}
          onChange={e => onChange("whisper_language", e.target.value)}
          className="w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[10px] text-white focus:border-blue-500 focus:outline-none"
        >
          <option value="en">English</option>
          <option value="ur">Urdu</option>
          <option value="hi">Hindi</option>
          <option value="es">Spanish</option>
          <option value="ar">Arabic</option>
          <option value="auto">Auto Detect</option>
        </select>
      </ToggleCard>

      {/* Split */}
      <ToggleCard
        icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
        title="Split"
        subtitle="Long video"
        checked={data.split_enabled === true}
        onChange={v => onChange("split_enabled", v)}
        color="amber"
      >
        <select
          value={(data.split_duration as string) || "30"}
          onChange={e => onChange("split_duration", e.target.value)}
          className="w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[10px] text-white focus:border-amber-500 focus:outline-none"
        >
          <option value="15">15 sec chunks</option>
          <option value="30">30 sec chunks</option>
          <option value="60">60 sec chunks</option>
        </select>
      </ToggleCard>

      {/* Combine */}
      <ToggleCard
        icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
        title="Combine"
        subtitle="Merge videos"
        checked={data.combine_enabled === true}
        onChange={v => onChange("combine_enabled", v)}
        color="pink"
      >
        <select
          value={(data.combine_count as string) || "3"}
          onChange={e => onChange("combine_count", e.target.value)}
          className="w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[10px] text-white focus:border-pink-500 focus:outline-none"
        >
          <option value="2">2 videos</option>
          <option value="3">3 videos</option>
          <option value="5">5 videos</option>
        </select>
      </ToggleCard>

      {/* Mute Audio */}
      <ToggleCard
        icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>}
        title="Mute Audio"
        subtitle="Remove sound"
        checked={data.mute_audio === true}
        onChange={v => onChange("mute_audio", v)}
        color="red"
      >
        <select
          value={(data.audio_fade_duration as string) || "3"}
          onChange={e => onChange("audio_fade_duration", e.target.value)}
          className="w-full px-2 py-1.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-[10px] text-white focus:border-red-500 focus:outline-none"
        >
          <option value="0">Instant mute</option>
          <option value="1">Fade 1 sec</option>
          <option value="2">Fade 2 sec</option>
          <option value="3">Fade 3 sec</option>
          <option value="5">Fade 5 sec</option>
        </select>
      </ToggleCard>
    </div>
  );
}