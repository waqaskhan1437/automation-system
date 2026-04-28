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
      className={`glass-input ${className}`}
    />
  );
}
