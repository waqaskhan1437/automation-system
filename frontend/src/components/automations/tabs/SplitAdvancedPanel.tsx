import { useCallback } from "react";

export interface SplitRule {
  id: string;
  mode: "interval_cut" | "jump_cut";
  interval: number;
  remove_duration: number;
  region: "full" | "first" | "last" | "custom";
  region_value: number;
  region_start: number;
  region_end: number;
}

function defaultRule(): SplitRule {
  return {
    id: Math.random().toString(36).slice(2, 9),
    mode: "jump_cut",
    interval: 1.0,
    remove_duration: 0.1,
    region: "full",
    region_value: 15,
    region_start: 0,
    region_end: 0,
  };
}

interface Props {
  rules: SplitRule[];
  onChange: (rules: SplitRule[]) => void;
}

function PreviewBar({ rule }: { rule: SplitRule }) {
  const totalSec = rule.region === "full" ? 30 : rule.region === "custom" ? (rule.region_end - rule.region_start) : rule.region_value;
  const segments: { keep: boolean; width: number }[] = [];
  const count = Math.min(Math.floor(totalSec / rule.interval), 60);
  const keepRatio = (rule.interval - rule.remove_duration) / rule.interval;
  for (let i = 0; i < count; i++) {
    segments.push({ keep: true, width: keepRatio });
    segments.push({ keep: false, width: 1 - keepRatio });
  }
  return (
    <div className="flex h-2 rounded overflow-hidden gap-px bg-[rgba(255,255,255,0.04)]">
      {segments.map((s, i) => (
        <div
          key={i}
          className="h-full rounded-sm"
          style={{
            flex: s.width,
            backgroundColor: s.keep ? "rgba(251,191,36,0.5)" : "rgba(239,68,68,0.5)",
          }}
        />
      ))}
    </div>
  );
}

export default function SplitAdvancedPanel({ rules, onChange }: Props) {
  const updateRule = useCallback(
    (id: string, patch: Partial<SplitRule>) => {
      onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [rules, onChange]
  );

  const addRule = () => onChange([...rules, defaultRule()]);
  const removeRule = (id: string) => onChange(rules.filter((r) => r.id !== id));

  const inputClass =
    "w-16 px-1.5 py-1 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded text-[10px] text-white text-center focus:border-amber-500 focus:outline-none";
  const selectClass =
    "px-1.5 py-1 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded text-[10px] text-white focus:border-amber-500 focus:outline-none";

  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="p-2 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] space-y-2"
        >
          {/* Interval + Remove */}
          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-[#a1a1aa]">
            <span>Every</span>
            <input
              type="number"
              step={0.05}
              min={0.1}
              value={rule.interval}
              onChange={(e) => updateRule(rule.id, { interval: parseFloat(e.target.value) || 0.1 })}
              className={inputClass}
            />
            <span>s remove</span>
            <input
              type="number"
              step={0.05}
              min={0.05}
              value={rule.remove_duration}
              onChange={(e) => updateRule(rule.id, { remove_duration: parseFloat(e.target.value) || 0.05 })}
              className={inputClass}
            />
            <span>s</span>
            {rules.length > 1 && (
              <button
                onClick={() => removeRule(rule.id)}
                className="ml-auto text-red-400 hover:text-red-300 text-xs leading-none"
              >
                ✕
              </button>
            )}
          </div>

          {/* Region */}
          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-[#a1a1aa]">
            <span>Region:</span>
            <select
              value={rule.region}
              onChange={(e) => updateRule(rule.id, { region: e.target.value as SplitRule["region"] })}
              className={selectClass}
            >
              <option value="full">Full Video</option>
              <option value="first">First X sec</option>
              <option value="last">Last X sec</option>
              <option value="custom">Custom Range</option>
            </select>
            {(rule.region === "first" || rule.region === "last") && (
              <input
                type="number"
                step={1}
                min={1}
                value={rule.region_value}
                onChange={(e) => updateRule(rule.id, { region_value: parseFloat(e.target.value) || 1 })}
                className={inputClass}
              />
            )}
            {rule.region === "custom" && (
              <>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={rule.region_start}
                  onChange={(e) => updateRule(rule.id, { region_start: parseFloat(e.target.value) || 0 })}
                  className={inputClass}
                  placeholder="start"
                />
                <span>→</span>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={rule.region_end}
                  onChange={(e) => updateRule(rule.id, { region_end: parseFloat(e.target.value) || 0 })}
                  className={inputClass}
                  placeholder="end"
                />
              </>
            )}
          </div>

          {/* Preview bar */}
          <PreviewBar rule={rule} />
        </div>
      ))}

      <button
        onClick={addRule}
        className="w-full py-1.5 rounded-lg border border-dashed border-[rgba(245,158,11,0.3)] text-[10px] text-amber-400 hover:bg-[rgba(245,158,11,0.05)] transition-colors"
      >
        + Add Rule
      </button>
    </div>
  );
}
