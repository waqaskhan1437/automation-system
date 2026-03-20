"use client";
import { useState, useEffect } from "react";
import { Automation } from "./types";
import BasicTab from "./BasicTab";
import VideoTab from "./tabs/VideoTab";
import TaglinesTab from "./tabs/TaglinesTab";
import SocialTab from "./tabs/SocialTab";
import PublishTab from "./PublishTab";

interface Props {
  type: "video" | "image";
  editData: Automation | null;
  onClose: () => void;
  onSaved: () => void;
}

const tabs = [
  { id: "basic", label: "Basic" },
  { id: "video", label: "Video" },
  { id: "taglines", label: "Taglines" },
  { id: "social", label: "Social Content" },
  { id: "publish", label: "Publish" },
];

export default function AutomationModal({ type, editData, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState("basic");
  const [name, setName] = useState(editData?.name || "");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editData?.config) {
      try {
        const cfg = JSON.parse(editData.config);
        setData(cfg);
        setName(editData.name);
      } catch {}
    }
  }, [editData]);

  const onChange = (key: string, value: unknown) => {
    setData(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!name.trim()) { alert("Name is required"); return; }
    setSaving(true);
    try {
      const url = editData ? `/api/automations/${editData.id}` : "/api/automations";
      const method = editData ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, config: JSON.stringify(data), schedule: null }),
      });
      const result = await res.json();
      if (result.success) onSaved();
      else alert("Failed: " + result.error);
    } catch { alert("Failed to save"); }
    setSaving(false);
  };

  const tabIndex = tabs.findIndex(t => t.id === activeTab);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="glass-card max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <h3 className="text-xl font-bold">{editData ? "Edit" : "Create"} {type === "video" ? "Video" : "Image"} Automation</h3>
          <button onClick={onClose} className="glass-button py-1 px-3 text-sm">Close</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 mt-4 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                  : "text-[#a1a1aa] hover:text-white hover:bg-[rgba(255,255,255,0.05)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 scrollbar-thin">
          {activeTab === "basic" && <BasicTab data={data} onChange={onChange} />}
          {activeTab === "video" && <VideoTab data={data} onChange={onChange} />}
          {activeTab === "taglines" && <TaglinesTab data={data} onChange={onChange} />}
          {activeTab === "social" && <SocialTab data={data} onChange={onChange} />}
          {activeTab === "publish" && <PublishTab data={data} onChange={onChange} />}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-6 pt-4 border-t border-[rgba(255,255,255,0.08)]">
          <button
            onClick={() => tabIndex > 0 && setActiveTab(tabs[tabIndex - 1].id)}
            className={`glass-button text-sm ${tabIndex === 0 ? "opacity-30 pointer-events-none" : ""}`}
          >
            Previous
          </button>
          {tabIndex < tabs.length - 1 ? (
            <button onClick={() => setActiveTab(tabs[tabIndex + 1].id)} className="glass-button-primary text-sm">
              Next
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving || !name.trim()} className="glass-button-primary text-sm">
              {saving ? "Saving..." : editData ? "Update" : "Create"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
