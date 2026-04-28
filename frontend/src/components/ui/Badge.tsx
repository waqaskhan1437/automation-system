interface BadgeProps {
  children: React.ReactNode;
  variant?: "active" | "paused" | "failed" | "queued" | "running" | "success" | "cancelled" | "video" | "image" | "default";
  className?: string;
}

export default function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span className={`badge badge-${variant} ${className}`}>
      {children}
    </span>
  );
}
