interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: { background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", color: "white", boxShadow: "0 10px 15px -3px rgba(59,130,246,0.2)" },
  secondary: { backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "white" },
  ghost: { color: "#a1a1aa" },
  danger: { color: "#ef4444", border: "1px solid rgba(255,255,255,0.08)" },
};

const sizeClasses: Record<string, string> = {
  sm: "px-3 py-1.5 text-[11px]",
  md: "px-4 py-2 text-xs",
  lg: "px-5 py-2.5 text-sm",
};

export default function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled = false,
  className = "",
  type = "button",
}: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl transition-all cursor-pointer";
  const cls = `${base} ${sizeClasses[size]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`;

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} style={variantStyles[variant]}>
      {children}
    </button>
  );
}
