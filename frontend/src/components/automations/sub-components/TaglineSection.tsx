interface TaglineSectionProps {
  label: string;
  colors: { bg: string; bgLight: string; text: string; border: string; focusBorder: string };
  icon: string;
  items: string[];
  placeholder: string;
  onChange: (v: string[]) => void;
}

export default function TaglineSection({ label, colors, icon, items, placeholder, onChange }: TaglineSectionProps) {
  return (
    <div className="p-3 rounded-xl border" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: colors.bgLight }}>
            <svg className="w-3 h-3" style={{ color: colors.text }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          </div>
          <span className="text-[11px] font-bold" style={{ color: colors.text }}>{label}</span>
        </div>
        <span className="text-[9px] text-[#71717a] bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 rounded">{items.length}</span>
      </div>
      <textarea
        className="w-full h-28 px-2 py-2 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-lg text-[11px] text-white placeholder-[#3f3f46] focus:outline-none resize-none"
        placeholder={placeholder}
        value={items.join("\n")}
        onChange={e => onChange(e.target.value.split("\n").filter(t => t.trim()))}
      />
    </div>
  );
}
