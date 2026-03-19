"use client";
import { useState } from "react";

type Tab = "postforme" | "github" | "video-sources";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("postforme");

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "postforme", label: "Postforme API", icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" },
    { id: "github", label: "GitHub Runner", icon: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" },
    { id: "video-sources", label: "Video Sources", icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold">Settings</h2>
        <p className="text-[#a1a1aa] mt-1">Configure your automation system</p>
      </div>

      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all ${
              activeTab === tab.id
                ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                : "glass-button"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="glass-card p-8">
        {activeTab === "postforme" && <PostformeSettings />}
        {activeTab === "github" && <GithubSettings />}
        {activeTab === "video-sources" && <VideoSourceSettings />}
      </div>
    </div>
  );
}

function PostformeSettings() {
  const [apiKey, setApiKey] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const allPlatforms = [
    { id: "instagram", label: "Instagram", color: "#E1306C" },
    { id: "youtube", label: "YouTube", color: "#FF0000" },
    { id: "tiktok", label: "TikTok", color: "#000000" },
    { id: "facebook", label: "Facebook", color: "#1877F2" },
    { id: "x", label: "X (Twitter)", color: "#1DA1F2" },
  ];

  const togglePlatform = (id: string) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/postforme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          platforms: JSON.stringify(platforms),
        }),
      });
      alert("Settings saved!");
    } catch (err) {
      alert("Failed to save settings");
    }
    setSaving(false);
  };

  return (
    <div>
      <h3 className="text-xl font-semibold mb-6">Postforme API Settings</h3>

      <div className="space-y-6">
        <div>
          <label className="block text-sm text-[#a1a1aa] mb-2">API Key</label>
          <input
            type="password"
            className="glass-input"
            placeholder="Enter your Postforme API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-[#a1a1aa] mb-3">Connected Platforms</label>
          <div className="flex flex-wrap gap-3">
            {allPlatforms.map((platform) => (
              <button
                key={platform.id}
                onClick={() => togglePlatform(platform.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  platforms.includes(platform.id)
                    ? "text-white"
                    : "glass-button"
                }`}
                style={
                  platforms.includes(platform.id)
                    ? { backgroundColor: platform.color }
                    : {}
                }
              >
                {platform.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="glass-button-primary mt-4"
        >
          {saving ? "Saving..." : "Save Postforme Settings"}
        </button>
      </div>
    </div>
  );
}

function GithubSettings() {
  const [patToken, setPatToken] = useState("");
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [runnerLabels, setRunnerLabels] = useState("self-hosted");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pat_token: patToken,
          repo_owner: repoOwner,
          repo_name: repoName,
          runner_labels: runnerLabels,
        }),
      });
      alert("Settings saved!");
    } catch (err) {
      alert("Failed to save settings");
    }
    setSaving(false);
  };

  return (
    <div>
      <h3 className="text-xl font-semibold mb-6">GitHub Runner Configuration</h3>

      <div className="space-y-6">
        <div>
          <label className="block text-sm text-[#a1a1aa] mb-2">Personal Access Token (PAT)</label>
          <input
            type="password"
            className="glass-input"
            placeholder="ghp_xxxxxxxxxxxx"
            value={patToken}
            onChange={(e) => setPatToken(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[#a1a1aa] mb-2">Repository Owner</label>
            <input
              type="text"
              className="glass-input"
              placeholder="username or org"
              value={repoOwner}
              onChange={(e) => setRepoOwner(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-[#a1a1aa] mb-2">Repository Name</label>
            <input
              type="text"
              className="glass-input"
              placeholder="repo-name"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-[#a1a1aa] mb-2">Runner Labels</label>
          <input
            type="text"
            className="glass-input"
            placeholder="self-hosted, linux, x64"
            value={runnerLabels}
            onChange={(e) => setRunnerLabels(e.target.value)}
          />
          <p className="text-xs text-[#a1a1aa] mt-1">Comma-separated labels for runner selection</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="glass-button-primary mt-4"
        >
          {saving ? "Saving..." : "Save GitHub Settings"}
        </button>
      </div>
    </div>
  );
}

function VideoSourceSettings() {
  const [bunnyApiKey, setBunnyApiKey] = useState("");
  const [bunnyLibraryId, setBunnyLibraryId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/video-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bunny_api_key: bunnyApiKey,
          bunny_library_id: bunnyLibraryId,
        }),
      });
      alert("Settings saved!");
    } catch (err) {
      alert("Failed to save settings");
    }
    setSaving(false);
  };

  return (
    <div>
      <h3 className="text-xl font-semibold mb-6">Video Source Settings</h3>

      <div className="space-y-6">
        <div className="glass-card p-4 mb-4">
          <p className="text-sm text-[#a1a1aa]">
            Direct URL and YouTube sources work out of the box. For Bunny CDN, configure below.
          </p>
        </div>

        <div>
          <label className="block text-sm text-[#a1a1aa] mb-2">Bunny CDN API Key</label>
          <input
            type="password"
            className="glass-input"
            placeholder="Enter Bunny CDN API key"
            value={bunnyApiKey}
            onChange={(e) => setBunnyApiKey(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-[#a1a1aa] mb-2">Bunny CDN Library ID</label>
          <input
            type="text"
            className="glass-input"
            placeholder="Library ID from Bunny dashboard"
            value={bunnyLibraryId}
            onChange={(e) => setBunnyLibraryId(e.target.value)}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="glass-button-primary mt-4"
        >
          {saving ? "Saving..." : "Save Video Source Settings"}
        </button>
      </div>
    </div>
  );
}
