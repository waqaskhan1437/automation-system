import { useCallback, useEffect, useState } from "react";
import { TabProps } from "./types";

interface SocialAccount {
  id: string;
  platform: string;
  username: string;
  connected: boolean;
}

function getEffectiveSourceLabel(data: TabProps["data"]): string {
  if (data.short_generation_mode === "prompt") {
    const promptSource = typeof data.prompt_source_type === "string" && data.prompt_source_type
      ? data.prompt_source_type
      : "youtube";
    return `prompt ${promptSource}`.replaceAll("_", " ");
  }

  return (data.video_source as string) || "-";
}

export default function PublishTab({ data, onChange }: TabProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const autoPublish = data.auto_publish === true;
  const selectedAccounts = Array.isArray(data.postforme_account_ids) ? data.postforme_account_ids : [];

  const fetchAccounts = useCallback(async () => {
    if (!autoPublish) {
      setAccounts([]);
      setAccountsError(null);
      return;
    }

    setLoadingAccounts(true);
    setAccountsError(null);

    try {
      const response = await fetch("/api/settings/postforme/accounts", { cache: "no-store" });
      const result = await response.json();

      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        setAccounts(result.data);
        return;
      }

      setAccounts([]);
      setAccountsError(result.error || "No accounts found. Please sync in Settings -> Postforme API");
    } catch (error) {
      console.error("[PublishTab] Accounts fetch error:", error);
      setAccounts([]);
      setAccountsError("Failed to load Postforme accounts. Open Settings -> Postforme API and resync once.");
    } finally {
      setLoadingAccounts(false);
    }
  }, [autoPublish]);

  useEffect(() => {
    if (autoPublish) {
      void fetchAccounts();
      return;
    }

    setAccounts([]);
    setAccountsError(null);
  }, [autoPublish, fetchAccounts]);

  const toggleAccount = (accountId: string) => {
    const current = selectedAccounts;
    const updated = current.includes(accountId)
      ? current.filter((id) => id !== accountId)
      : [...current, accountId];
    onChange("postforme_account_ids", updated);
  };

  const platformColors: Record<string, string> = {
    instagram: "#E1306C",
    youtube: "#FF0000",
    tiktok: "#000000",
    facebook: "#1877F2",
    x: "#1DA1F2",
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-sm font-medium">Auto-Publish (Postforme)</p>
            <p className="text-xs text-[#a1a1aa]">Post to social media automatically</p>
          </div>
          <button
            onClick={() => onChange("auto_publish", !data.auto_publish)}
            className={`w-11 h-6 rounded-full transition-all ${autoPublish ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" : "bg-[rgba(255,255,255,0.1)]"}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${autoPublish ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
          </button>
        </div>
      </div>

      {autoPublish && (
        <div className="glass-card p-5">
          <p className="text-sm font-medium mb-3">Select Accounts to Post</p>
          {loadingAccounts ? (
            <p className="text-xs text-[#a1a1aa]">Loading accounts...</p>
          ) : accounts.length > 0 ? (
            <div className="space-y-2">
              {accounts.map((account) => (
                <label
                  key={account.id}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    selectedAccounts.includes(account.id)
                      ? "bg-[rgba(99,102,241,0.15)] border border-[rgba(99,102,241,0.3)]"
                      : "bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.1)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedAccounts.includes(account.id)}
                      onChange={() => toggleAccount(account.id)}
                      className="w-4 h-4 accent-[#6366f1]"
                    />
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: platformColors[account.platform] || "#666" }}
                    />
                    <span className="text-sm font-medium capitalize">{account.platform}</span>
                    <span className="text-xs text-[#a1a1aa]">@{account.username}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    account.connected ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                  }`}>
                    {account.connected ? "Connected" : "Disconnected"}
                  </span>
                </label>
              ))}
            </div>
          ) : accountsError ? (
            <div className="space-y-2">
              <p className="text-xs text-red-400">{accountsError}</p>
              <button
                onClick={() => void fetchAccounts()}
                className="text-xs px-3 py-1.5 bg-[rgba(255,255,255,0.05)] text-[#a1a1aa] rounded-lg hover:bg-[rgba(255,255,255,0.1)]"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#a1a1aa]">
              No accounts found. Go to Settings {">"} Postforme API to sync accounts.
            </p>
          )}
          {selectedAccounts.length > 0 && (
            <p className="text-xs text-[#a1a1aa] mt-2">
              {selectedAccounts.length} account(s) selected
            </p>
          )}
        </div>
      )}

      {autoPublish && (
        <div className="glass-card p-5">
          <p className="text-sm font-medium mb-3">Post Scheduling</p>
          <select className="glass-select" value={data.publish_mode as string || "immediate"} onChange={(event) => onChange("publish_mode", event.target.value)}>
            <option value="immediate">Post Immediately</option>
            <option value="delay">Delay After Processing</option>
            <option value="scheduled">Schedule Specific Time</option>
            <option value="stagger">Stagger Multiple Posts</option>
          </select>

          {data.publish_mode === "delay" && (
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-[#a1a1aa] mb-1">Delay After Processing</label>
              <select className="glass-select text-sm" value={data.delay_minutes as string || "60"} onChange={(event) => onChange("delay_minutes", event.target.value)}>
                <option value="1">1 minute</option>
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="240">4 hours</option>
                <option value="360">6 hours</option>
                <option value="720">12 hours</option>
                <option value="1440">24 hours</option>
                <option value="custom">Custom...</option>
              </select>
              {data.delay_minutes === "custom" && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="glass-input text-sm w-24"
                    placeholder="Minutes"
                    min="1"
                    max="1440"
                    value={data.delay_minutes_custom as string || ""}
                    onChange={(event) => onChange("delay_minutes_custom", event.target.value)}
                  />
                  <span className="text-xs text-[#71717a]">minutes (max 1440)</span>
                </div>
              )}
            </div>
          )}

          {data.publish_mode === "scheduled" && (
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Date</label>
                <input className="glass-input text-sm" type="date" value={data.schedule_date as string || ""} onChange={(event) => onChange("schedule_date", event.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Time</label>
                <input className="glass-input text-sm" type="time" value={data.schedule_time as string || ""} onChange={(event) => onChange("schedule_time", event.target.value)} />
              </div>
            </div>
          )}

          {data.publish_mode === "stagger" && selectedAccounts.length > 1 && (
            <div className="mt-3 space-y-3">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-xs text-blue-300">
                  <span className="font-medium">Stagger Mode:</span> {selectedAccounts.length} posts will be scheduled with time gap between each post.
                </p>
                <div className="mt-2">
                  <label className="block text-xs text-[#a1a1aa] mb-1">Time Between Posts</label>
                  <select className="glass-select text-sm" value={data.post_stagger_minutes as string || "15"} onChange={(event) => onChange("post_stagger_minutes", event.target.value)}>
                    <option value="5">5 minutes</option>
                    <option value="10">10 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>
                <p className="text-xs text-[#71717a] mt-2">Example: {selectedAccounts.length} accounts, 15 min stagger = Post 1 now, Post 2 in 15 min, Post 3 in 30 min...</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-[#a1a1aa] cursor-pointer">
                <input type="checkbox" checked={data.postforme_account_stagger_enabled as boolean || false} onChange={(event) => onChange("postforme_account_stagger_enabled", event.target.checked)} className="w-4 h-4 accent-[#6366f1]" />
                Enable staggered posting to different accounts
              </label>
            </div>
          )}

          {data.publish_mode === "stagger" && selectedAccounts.length <= 1 && (
            <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-xs text-yellow-300">Stagger mode requires at least 2 accounts. Currently {selectedAccounts.length} selected.</p>
            </div>
          )}
        </div>
      )}

      <div className="glass-card p-5">
        <p className="text-sm font-medium mb-3">Output Settings</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-[#a1a1aa] mb-1">Format</label>
            <select className="glass-select text-sm" value={data.output_format as string || "mp4"} onChange={(event) => onChange("output_format", event.target.value)}>
              <option value="mp4">MP4</option>
              <option value="mov">MOV</option>
              <option value="webm">WebM</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#a1a1aa] mb-1">Quality</label>
            <select className="glass-select text-sm" value={data.output_quality as string || "high"} onChange={(event) => onChange("output_quality", event.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#a1a1aa] mb-1">Resolution</label>
            <select className="glass-select text-sm" value={data.output_resolution as string || "1080x1920"} onChange={(event) => onChange("output_resolution", event.target.value)}>
              <option value="1080x1920">1080x1920</option>
              <option value="1920x1080">1920x1080</option>
              <option value="1080x1080">1080x1080</option>
            </select>
          </div>
        </div>
      </div>

      <div className="glass-card p-4">
        <p className="text-sm font-medium mb-2">Summary</p>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <span className="text-[#a1a1aa]">Source:</span><span className="capitalize">{getEffectiveSourceLabel(data)}</span>
          <span className="text-[#a1a1aa]">Duration:</span><span>{data.short_duration as string || "60"} sec</span>
          <span className="text-[#a1a1aa]">Ratio:</span><span>{data.aspect_ratio as string || "9:16"}</span>
          <span className="text-[#a1a1aa]">Publish:</span><span>{data.auto_publish === true ? "Yes" : "No"}</span>
        </div>
      </div>
    </div>
  );
}
