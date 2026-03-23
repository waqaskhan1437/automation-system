interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const sizes = {
  sm: "w-4 h-4 border-[2px]",
  md: "w-8 h-8 border-[3px]",
  lg: "w-12 h-12 border-4",
};

export default function LoadingSpinner({ size = "md", className = "", label }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center gap-3">
      <div
        className={`${sizes[size]} border-blue-500/30 border-t-blue-500 rounded-full animate-spin ${className}`}
      />
      {label && <span className="text-sm text-[#71717a]">{label}</span>}
    </div>
  );
}

interface LoadingPageProps {
  message?: string;
}

export function LoadingPage({ message = "Loading..." }: LoadingPageProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <LoadingSpinner size="lg" />
      <p className="text-[#a1a1aa] mt-4">{message}</p>
    </div>
  );
}

interface LoadingOverlayProps {
  message?: string;
}

export function LoadingOverlay({ message }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass-card p-8 flex flex-col items-center">
        <LoadingSpinner size="lg" />
        {message && <p className="text-[#a1a1aa] mt-4">{message}</p>}
      </div>
    </div>
  );
}
