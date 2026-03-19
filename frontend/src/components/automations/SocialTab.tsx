import { TabProps } from "./types";

export default function SocialTab({ data, onChange }: TabProps) {
  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <p className="text-sm font-medium mb-2">Post Titles (one per line)</p>
        <p className="text-xs text-[#a1a1aa] mb-3">Each title used randomly for social media posts.</p>
        <textarea
          className="glass-input min-h-[80px]"
          value={(data.titles as string[] || []).join("\n")}
          onChange={e => onChange("titles", e.target.value.split("\n").filter(t => t.trim()))}
          placeholder={"Amazing Video You Must See!\nYou Won't Believe What Happens!\nThis Will Blow Your Mind!"}
        />
      </div>

      <div className="glass-card p-5">
        <p className="text-sm font-medium mb-2">Descriptions (one per line)</p>
        <textarea
          className="glass-input min-h-[80px]"
          value={(data.descriptions as string[] || []).join("\n")}
          onChange={e => onChange("descriptions", e.target.value.split("\n").filter(t => t.trim()))}
          placeholder={"Check out this incredible video!\nAn amazing journey you need to see!\nDiscover something new today!"}
        />
      </div>

      <div className="glass-card p-5">
        <p className="text-sm font-medium mb-2">Hashtags (comma or line separated)</p>
        <textarea
          className="glass-input min-h-[80px]"
          value={(data.hashtags as string[] || []).join("\n")}
          onChange={e => onChange("hashtags", e.target.value.split(/[,\n]+/).map(h => h.trim()).filter(h => h))}
          placeholder={"#viral #trending #fyp #shorts #amazing"}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Content Rotation</label>
        <select className="glass-select" value={data.content_rotation as string || "random"} onChange={e => onChange("content_rotation", e.target.value)}>
          <option value="random">Random</option>
          <option value="sequential">Sequential</option>
        </select>
      </div>
    </div>
  );
}
