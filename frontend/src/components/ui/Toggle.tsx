interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  color?: string;
}

const colorStyles: Record<string, { bg: string }> = {
  green: { bg: "rgb(34, 197, 94)" },
  blue: { bg: "rgb(59, 130, 246)" },
  amber: { bg: "rgb(245, 158, 11)" },
  pink: { bg: "rgb(236, 72, 153)" },
  purple: { bg: "rgb(139, 92, 246)" },
  red: { bg: "rgb(239, 68, 68)" },
};

export default function Toggle({ checked, onChange, color = "green" }: ToggleProps) {
  const style = colorStyles[color] || colorStyles.green;

  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-9 h-5 rounded-full transition-all relative"
      style={{ backgroundColor: checked ? style.bg : "rgba(255,255,255,0.15)" }}
    >
      <div
        className="w-4 h-4 rounded-full bg-white absolute top-[2px] transition-all shadow"
        style={{ left: checked ? 16 : 2 }}
      />
    </button>
  );
}
