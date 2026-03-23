interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: "sm" | "md" | "lg";
}

export default function Card({ children, className = "", hover = false, padding = "md" }: CardProps) {
  const paddings = {
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  return (
    <div className={`bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl ${paddings[padding]} ${hover ? "hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.1)] transition-all" : ""} ${className}`}>
      {children}
    </div>
  );
}