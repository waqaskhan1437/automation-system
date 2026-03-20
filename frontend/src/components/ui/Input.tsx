interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "number" | "date" | "time";
  className?: string;
  min?: number;
  max?: number;
}

export default function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
  min,
  max,
}: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      className={`w-full px-3 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white placeholder-[#52525b] focus:outline-none transition-all ${className}`}
    />
  );
}