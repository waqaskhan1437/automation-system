interface Props {
  data: Record<string, unknown>;
}

const featureColors: Record<string, { bg: string; text: string }> = {
  Rotation: { bg: "rgba(34,197,94,0.2)", text: "#4ade80" },
  Captions: { bg: "rgba(59,130,246,0.2)", text: "#60a5fa" },
  Split: { bg: "rgba(245,158,11,0.2)", text: "#fbbf24" },
  Combine: { bg: "rgba(236,72,153,0.2)", text: "#f472b6" },
};

export default function VideoSummary({ data }: Props) {
  const features: string[] = [];
  if (data.rotation_enabled !== false) features.push("Rotation");
  if (data.whisper_enabled === true) features.push("Captions");
  if (data.split_enabled === true) features.push("Split");
  if (data.combine_enabled === true) features.push("Combine");

  return (
    <div
      className="rounded-xl p-3 border"
      style={{
        background: "linear-gradient(to right, rgba(99,102,241,0.08), rgba(139,92,246,0.08))",
        borderColor: "rgba(99,102,241,0.15)",
      }}
    >
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#a1a1aa]">Output:</span>
        <span className="text-white font-medium">
          {String(data.videos_per_run || "1")}x {String(data.aspect_ratio || "9:16")} @ {String(data.short_duration || "60")}s
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] mt-1">
        <span className="text-[#a1a1aa]">Features:</span>
        <div className="flex gap-1.5">
          {features.length > 0 ? features.map(f => {
            const c = featureColors[f] || { bg: "rgba(255,255,255,0.1)", text: "#a1a1aa" };
            return (
              <span key={f} className="px-1.5 py-0.5 rounded text-[9px]" style={{ backgroundColor: c.bg, color: c.text }}>{f}</span>
            );
          }) : <span className="text-[#71717a]">None</span>}
        </div>
      </div>
    </div>
  );
}
