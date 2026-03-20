interface BadgeProps {
  children: React.ReactNode;
  variant?: "active" | "paused" | "failed" | "queued" | "running" | "success" | "video" | "image" | "default";
  className?: string;
}

export default function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  const variants: Record<string, string> = {
    active: "bg-[rgba(16,185,129,0.15)] text-[#10b981]",
    paused: "bg-[rgba(245,158,11,0.15)] text-[#f59e0b]",
    failed: "bg-[rgba(239,68,68,0.15)] text-[#ef4444]",
    queued: "bg-[rgba(99,102,241,0.15)] text-[#6366f1]",
    running: "bg-[rgba(59,130,246,0.15)] text-[#3b82f6]",
    success: "bg-[rgba(16,185,129,0.15)] text-[#10b981]",
    video: "bg-[rgba(139,92,246,0.15)] text-[#8b5cf6]",
    image: "bg-[rgba(236,72,153,0.15)] text-[#ec4899]",
    default: "bg-[rgba(255,255,255,0.08)] text-[#a1a1aa]",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}