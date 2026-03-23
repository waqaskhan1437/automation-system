"use client";
import { useState, useEffect } from "react";

export default function VideoSourceSettings() {
  const [bunnyApiKey, setBunnyApiKey] = useState("");
  const [bunnyLibraryId, setBunnyLibraryId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/video-sources")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setBunnyApiKey(data.data.bunny_api_key || "");
          setBunnyLibraryId(data.data.bunny_library_id || "");
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/video-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bunny_api_key: bunnyApiKey, bunny_library_id: bunnyLibraryId }),
      });
      alert("Settings saved!");
    } catch { alert("Failed to save settings"); }
    setSaving(false);
  };

  return (
    <div>
      <h3 className="text-xl font-semibold mb-6">Video Source Settings</h3>
      <div className="space-y-6">
        <div className="glass-card p-4 mb-4">
          <p className="text-sm text-[#a1a1aa]">Direct URL and YouTube sources work out of the box. For Bunny CDN, configure below.</p>
        </div>
        <div>
          <label className="block text-sm text-[#a1a1aa] mb-2">Bunny CDN API Key</label>
          <input type="password" className="glass-input" placeholder="Enter Bunny CDN API key" value={bunnyApiKey} onChange={(e) => setBunnyApiKey(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm text-[#a1a1aa] mb-2">Bunny CDN Library ID</label>
          <input type="text" className="glass-input" placeholder="Library ID from Bunny dashboard" value={bunnyLibraryId} onChange={(e) => setBunnyLibraryId(e.target.value)} />
        </div>
        <button onClick={handleSave} disabled={saving} className="glass-button-primary mt-4">
          {saving ? "Saving..." : "Save Video Source Settings"}
        </button>
      </div>
    </div>
  );
}