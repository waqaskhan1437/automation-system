"use client";
import { useState, useEffect } from "react";

export default function GithubSettings() {
  const [patToken, setPatToken] = useState("");
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [runnerLabels, setRunnerLabels] = useState("self-hosted");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/github")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setPatToken(data.data.pat_token || "");
          setRepoOwner(data.data.repo_owner || "");
          setRepoName(data.data.repo_name || "");
          setRunnerLabels(data.data.runner_labels || "self-hosted");
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pat_token: patToken, repo_owner: repoOwner, repo_name: repoName, runner_labels: runnerLabels }),
      });
      alert("Settings saved!");
    } catch { alert("Failed to save settings"); }
    setSaving(false);
  };

  return (
    <div>
      <h3 className="text-xl font-semibold mb-6">GitHub Runner Configuration</h3>
      <div className="space-y-6">
        <div>
          <label className="block text-sm text-[#a1a1aa] mb-2">Personal Access Token (PAT)</label>
          <input type="password" className="glass-input" placeholder="ghp_xxxxxxxxxxxx" value={patToken} onChange={(e) => setPatToken(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[#a1a1aa] mb-2">Repository Owner</label>
            <input type="text" className="glass-input" placeholder="username or org" value={repoOwner} onChange={(e) => setRepoOwner(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-[#a1a1aa] mb-2">Repository Name</label>
            <input type="text" className="glass-input" placeholder="repo-name" value={repoName} onChange={(e) => setRepoName(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-sm text-[#a1a1aa] mb-2">Runner Labels</label>
          <input type="text" className="glass-input" placeholder="self-hosted, linux, x64" value={runnerLabels} onChange={(e) => setRunnerLabels(e.target.value)} />
          <p className="text-xs text-[#a1a1aa] mt-1">Comma-separated labels for runner selection</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="glass-button-primary mt-4">
          {saving ? "Saving..." : "Save GitHub Settings"}
        </button>
      </div>
    </div>
  );
}