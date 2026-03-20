interface ContentListProps {
  label: string;
  colors: { bg: string; text: string };
  items: string[];
  placeholder: string;
  onChange: (v: string[]) => void;
  isHashtags?: boolean;
}

export default function ContentList({ label, colors, items, placeholder, onChange, isHashtags }: ContentListProps) {
  return (
    <div className="p-2.5 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-[#a1a1aa] uppercase tracking-wide">{label}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.bg, color: colors.text }}>{items.length}</span>
      </div>
      <textarea
        className="w-full h-36 px-2 py-1.5 bg-transparent border-0 text-[11px] text-white placeholder-[#3f3f46] focus:outline-none resize-none"
        placeholder={placeholder}
        value={items.join("\n")}
        onChange={e => {
          if (isHashtags) {
            onChange(e.target.value.split(/[\s,\n]+/).map(h => h.trim()).filter(h => h));
          } else {
            onChange(e.target.value.split("\n").filter(t => t.trim()));
          }
        }}
      />
    </div>
  );
}
