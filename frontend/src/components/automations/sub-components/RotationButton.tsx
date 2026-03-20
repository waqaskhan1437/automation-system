interface RotationButtonProps {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}

export default function RotationButton({ label, sub, active, onClick }: RotationButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-2.5 rounded-xl border text-center transition-all ${
        active ? "border-amber-500/50 bg-amber-500/10" : "border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
      }`}
    >
      <div className="text-[11px] font-bold text-white mb-0.5">{label}</div>
      <div className="text-[9px] text-[#71717a]">{sub}</div>
    </button>
  );
}
