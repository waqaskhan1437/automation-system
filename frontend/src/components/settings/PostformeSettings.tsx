"use client";
import { useState, useEffect } from "react";

export default function PostformeSettings() {
  const [apiKey, setApiKey] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncedAccounts, setSyncedAccounts] = useState<Array<{ platform: string; username: string; connected: boolean }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/postforme")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setApiKey(data.data.api_key || "");
          try {
            const plats = JSON.parse(data.data.platforms || "[]");
            if (Array.isArray(plats)) setPlatforms(plats);
          } catch {}
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const allPlatforms = [
    { id: "instagram", label: "Instagram", color: "#E1306C" },
    { id: "youtube", label: "YouTube", color: "#FF0000" },
    { id: "tiktok", label: "TikTok", color: "#000000" },
    { id: "facebook", label: "Facebook", color: "#1877F2" },
    { id: "x", label: "X (Twitter)", color: "#1DA1F2" },
  ];

  const togglePlatform = (id: string) => {
    setPlatforms((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const handleTest = async () => {
    if (!apiKey) { setTestResult({ success: false, message: "API key is empty" }); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/postforme/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const data = await res.json();
      setTestResult({ success: data.success, message: data.message || data.error });
    } catch { setTestResult({ success: false, message: "Connection failed" }); }
    setTesting(false);
  };

  const handleSync = async () => {
    if (!apiKey) { setTestResult({ success: false, message: "API key is empty" }); return; }
    setSyncing(true);
    setSyncedAccounts([]);
    try {
      const res = await fetch("/api/settings/postforme/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setSyncedAccounts(data.data);
        const connectedPlatforms = data.data.filter((a: { connected: boolean }) => a.connected).map((a: { platform: string }) => a.platform);
        setPlatforms(connectedPlatforms);
        setTestResult({ success: true, message: `Found ${data.data.length} account(s)` });
        
        // Save accounts to database for persistence
        await fetch("/api/settings/postforme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            api_key: apiKey, 
            platforms: JSON.stringify(connectedPlatforms),
            saved_accounts: JSON.stringify(data.data),
          }),
        });
      } else {
        setTestResult({ success: false, message: data.error || "Sync failed" });
      }
    } catch { setTestResult({ success: false, message: "Sync failed" }); }
    setSyncing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/postforme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, platforms: JSON.stringify(platforms) }),
      });
      setTestResult({ success: true, message: "Settings saved successfully!" });
    } catch { setTestResult({ success: false, message: "Failed to save settings" }); }
    setSaving(false);
  };

  if (loading) return <div className="text-center py-8 text-[#a1a1aa]">Loading...</div>;

  return (
    <div>
      <h3 className="text-xl font-semibold mb-6">Postforme API Settings</h3>
      <div className="space-y-6">
        <div>
          <label className="block text-sm text-[#a1a1aa] mb-2">API Key</label>
          <input type="password" className="glass-input" placeholder="Enter your Postforme API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>

        <div className="flex gap-3">
          <button onClick={handleTest} disabled={testing} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${testResult?.success === true ? "bg-[rgba(16,185,129,0.15)] text-[#10b981]" : testResult?.success === false && testResult?.message ? "bg-[rgba(239,68,68,0.15)] text-[#ef4444]" : "glass-button"}`}>
            {testing ? "Testing..." : "Test API"}
          </button>
          <button onClick={handleSync} disabled={syncing} className="glass-button flex items-center gap-2 text-sm font-medium">
            {syncing ? "Syncing..." : "Sync Accounts"}
          </button>
        </div>

        {testResult && (
          <div className={`glass-card p-3 ${testResult.success ? "border-[rgba(16,185,129,0.3)]" : "border-[rgba(239,68,68,0.3)]"}`}>
            <p className={`text-sm ${testResult.success ? "text-[#10b981]" : "text-[#ef4444]"}`}>{testResult.message}</p>
          </div>
        )}

        {syncedAccounts.length > 0 && (
          <div className="glass-card p-5">
            <p className="text-sm font-medium mb-3">Synced Accounts</p>
            <div className="space-y-2">
              {syncedAccounts.map((account, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[rgba(255,255,255,0.03)]">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${account.platform === "instagram" ? "bg-[#E1306C]" : account.platform === "youtube" ? "bg-[#FF0000]" : account.platform === "tiktok" ? "bg-white" : account.platform === "facebook" ? "bg-[#1877F2]" : "bg-[#1DA1F2]"}`} />
                    <span className="text-sm font-medium capitalize">{account.platform}</span>
                    <span className="text-xs text-[#a1a1aa]">@{account.username}</span>
                  </div>
                  <span className={`badge ${account.connected ? "badge-success" : "badge-failed"}`}>{account.connected ? "Connected" : "Disconnected"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleSave} disabled={saving} className="glass-button-primary mt-4">
          {saving ? "Saving..." : "Save Postforme Settings"}
        </button>
      </div>
    </div>
  );
}