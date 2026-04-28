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
    <div className={`glass-card ${hover ? "" : "no-hover"} ${paddings[padding]} ${className}`}>
      {children}
    </div>
  );
}
