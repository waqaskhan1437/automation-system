"use client";
import { useState, useEffect } from "react";

interface Automation {
  id: number;
  name: string;
  type: "video" | "image";
  status: "active" | "paused" | "completed" | "failed";
  schedule: string | null;
  last_run: string | null;
  created_at: string;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "video" | "image">("all");

  useEffect(() => {
    fetchAutomations();
  }, []);

  const fetchAutomations = async () => {
    try {
      const res = await fetch("/api/automations");
      const data = await res.json();
      if (data.success) {
        setAutomations(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch automations");
    }
    setLoading(false);
  };

  const handleAction = async (id: number, action: "run" | "pause" | "resume" | "delete") => {
    try {
      if (action === "delete") {
        await fetch(`/api/automations/${id}`, { method: "DELETE" });
      } else {
        await fetch(`/api/automations/${id}/${action}`, { method: "POST" });
      }
      fetchAutomations();
    } catch (err) {
      console.error("Action failed");
    }
  };

  const filtered = filter === "all" ? automations : automations.filter((a) => a.type === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">Automations</h2>
          <p className="text-[#a1a1aa] mt-1">Manage your automation pipelines</p>
        </div>
        <div className="flex gap-3">
          <a href="/automations/video/new" className="glass-button-primary">
            + Video
          </a>
          <a href="/automations/image/new" className="glass-button-primary">
            + Image
          </a>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(["all", "video", "image"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${
              filter === f ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"
            }`}
          >
            {f === "all" ? "All" : f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#a1a1aa]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <p className="text-lg font-medium">No automations yet</p>
          <p className="text-[#a1a1aa] mt-1">Create your first automation to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((auto) => (
            <div key={auto.id} className="glass-card p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${auto.type === "video" ? "bg-[rgba(139,92,246,0.15)]" : "bg-[rgba(236,72,153,0.15)]"}`}>
                  {auto.type === "video" ? (
                    <svg className="w-5 h-5 text-[#8b5cf6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-[#ec4899]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold">{auto.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`badge ${auto.type === "video" ? "badge-video" : "badge-image"}`}>{auto.type}</span>
                    <span className={`badge badge-${auto.status}`}>{auto.status}</span>
                    {auto.schedule && <span className="text-xs text-[#a1a1aa]">{auto.schedule}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {auto.status === "active" ? (
                  <button onClick={() => handleAction(auto.id, "run")} className="glass-button-primary text-sm py-2 px-4">
                    Run Now
                  </button>
                ) : null}
                {auto.status === "active" ? (
                  <button onClick={() => handleAction(auto.id, "pause")} className="glass-button text-sm py-2 px-4">
                    Pause
                  </button>
                ) : (
                  <button onClick={() => handleAction(auto.id, "resume")} className="glass-button text-sm py-2 px-4">
                    Resume
                  </button>
                )}
                <button onClick={() => handleAction(auto.id, "delete")} className="glass-button text-sm py-2 px-4 text-[#ef4444]">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
