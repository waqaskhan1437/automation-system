interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export default function Select({
  value,
  onChange,
  options,
  placeholder,
  className = "",
}: SelectProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-white focus:outline-none transition-all ${className}`}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}