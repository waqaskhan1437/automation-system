import Toggle from "./Toggle";

interface ToggleCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  color?: string;
  children?: React.ReactNode;
  className?: string;
}

const colorStyles: Record<string, { border: string; bg: string; iconBg: string; iconColor: string }> = {
  green: { border: "rgba(34,197,94,0.3)", bg: "rgba(34,197,94,0.05)", iconBg: "rgba(34,197,94,0.2)", iconColor: "#4ade80" },
  blue: { border: "rgba(59,130,246,0.3)", bg: "rgba(59,130,246,0.05)", iconBg: "rgba(59,130,246,0.2)", iconColor: "#60a5fa" },
  amber: { border: "rgba(245,158,11,0.3)", bg: "rgba(245,158,11,0.05)", iconBg: "rgba(245,158,11,0.2)", iconColor: "#fbbf24" },
  pink: { border: "rgba(236,72,153,0.3)", bg: "rgba(236,72,153,0.05)", iconBg: "rgba(236,72,153,0.2)", iconColor: "#f472b6" },
  purple: { border: "rgba(139,92,246,0.3)", bg: "rgba(139,92,246,0.05)", iconBg: "rgba(139,92,246,0.2)", iconColor: "#a78bfa" },
};

export default function ToggleCard({
  icon,
  title,
  subtitle,
  checked,
  onChange,
  color = "green",
  children,
  className = "",
}: ToggleCardProps) {
  const style = colorStyles[color] || colorStyles.green;

  return (
    <div
      className={`p-2.5 rounded-xl border transition-all ${className}`}
      style={{
        borderColor: checked ? style.border : "rgba(255,255,255,0.06)",
        backgroundColor: checked ? style.bg : "rgba(255,255,255,0.02)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: checked ? style.iconBg : "rgba(255,255,255,0.06)",
              color: checked ? style.iconColor : "#71717a",
            }}
          >
            {icon}
          </div>
          <div>
            <span className="text-[11px] font-semibold text-white">{title}</span>
            <p className="text-[9px] text-[#71717a]">{subtitle}</p>
          </div>
        </div>
        <Toggle checked={checked} onChange={onChange} color={color} />
      </div>
      {checked && children && (
        <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
          {children}
        </div>
      )}
    </div>
  );
}
