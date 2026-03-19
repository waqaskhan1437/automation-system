import { TabProps } from "./types";

export default function TaglinesTab({ data, onChange }: TabProps) {
  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <p className="text-sm font-medium mb-2">Top Taglines (appears at top of video)</p>
        <p className="text-xs text-[#a1a1aa] mb-3">One tagline per line. Random one selected for each video.</p>
        <textarea
          className="glass-input min-h-[100px]"
          value={(data.top_taglines as string[] || []).join("\n")}
          onChange={e => onChange("top_taglines", e.target.value.split("\n").filter(t => t.trim()))}
          placeholder={"Watch till the end!\nYou won't believe this!\nThis changed everything!"}
        />
      </div>

      <div className="glass-card p-5">
        <p className="text-sm font-medium mb-2">Bottom Taglines (appears at bottom of video)</p>
        <p className="text-xs text-[#a1a1aa] mb-3">Call-to-action or closing text.</p>
        <textarea
          className="glass-input min-h-[100px]"
          value={(data.bottom_taglines as string[] || []).join("\n")}
          onChange={e => onChange("bottom_taglines", e.target.value.split("\n").filter(t => t.trim()))}
          placeholder={"Follow for more!\nLike & Share!\nSubscribe now!"}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Tagline Rotation</label>
        <select className="glass-select" value={data.tagline_rotation as string || "random"} onChange={e => onChange("tagline_rotation", e.target.value)}>
          <option value="random">Random</option>
          <option value="sequential">Sequential</option>
        </select>
      </div>

      {/* Watermark */}
      <div className="glass-card p-5">
        <p className="text-sm font-medium mb-2">Watermark (optional)</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs text-[#a1a1aa] mb-1">Text</label><input className="glass-input text-sm" value={data.watermark_text as string || ""} onChange={e => onChange("watermark_text", e.target.value)} placeholder="@yourhandle" /></div>
          <div>
            <label className="block text-xs text-[#a1a1aa] mb-1">Position</label>
            <select className="glass-select text-sm" value={data.watermark_position as string || "bottomright"} onChange={e => onChange("watermark_position", e.target.value)}>
              <option value="topleft">Top Left</option><option value="topright">Top Right</option>
              <option value="bottomleft">Bottom Left</option><option value="bottomright">Bottom Right</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
