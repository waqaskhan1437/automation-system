"use client";
import { useState, useEffect, useCallback, memo } from "react";
import { Automation } from "./types";
import type { AIModelCatalogResponse } from "@/lib/types";
import { getAvailableProviders, resolveModelSelection, resolveProviderSelection } from "@/lib/ai";
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
  { id: "basic", label: "Basic", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { id: "video", label: "Video", icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
  { id: "taglines", label: "Taglines", icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" },
  { id: "social", label: "Social", icon: "M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" },
  { id: "publish", label: "Publish", icon: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" },
];

const TabButton = memo(function TabButton({ 
  tab, 
  active, 
  onClick 
}: { 
  tab: { id: string; label: string; icon: string }; 
  active: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        active
          ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-lg"
          : "text-[#a1a1aa] hover:text-white hover:bg-[rgba(255,255,255,0.05)]"
      }`}
    >
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
      </svg>
      <span>{tab.label}</span>
    </button>
  );
});

export default memo(function AutomationModal({ type, editData, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState("basic");
  const [name, setName] = useState(editData?.name || "");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [aiCatalog, setAiCatalog] = useState<AIModelCatalogResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [taglineGenerating, setTaglineGenerating] = useState(false);
  const [socialGenerating, setSocialGenerating] = useState(false);
  const [taglineGenResult, setTaglineGenResult] = useState("");
  const [socialGenResult, setSocialGenResult] = useState("");

  useEffect(() => {
    if (!editData) return;
    
    setInitializing(true);
    const timer = setTimeout(() => {
      if (editData?.config) {
        try {
          const cfg = JSON.parse(editData.config);
          setData(cfg);
          setName(editData.name);
        } catch (e) {
          console.error("Failed to parse config:", e);
        }
      }
      setInitializing(false);
    }, 50);
    
    return () => clearTimeout(timer);
  }, [editData?.id]);

  const loadAiCatalog = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/settings/ai/models");
      const result = await res.json();
      if (result.success) {
        setAiCatalog(result.data || { default_provider: null, providers: [] });
      } else {
        setAiCatalog({ default_provider: null, providers: [] });
      }
    } catch {
      setAiCatalog({ default_provider: null, providers: [] });
    }
    setAiLoading(false);
  }, []);

  useEffect(() => {
    loadAiCatalog();
  }, [loadAiCatalog]);

  const onChange = useCallback((key: string, value: unknown) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    const providers = getAvailableProviders(aiCatalog);
    if (providers.length === 0) return;

    setData((prev) => {
      const next = { ...prev };

      const taglineProvider = resolveProviderSelection(aiCatalog, prev.ai_gen_provider as string | undefined);
      const socialProvider = resolveProviderSelection(aiCatalog, prev.social_ai_provider as string | undefined);
      const taglineModel = resolveModelSelection(aiCatalog, taglineProvider, prev.ai_gen_model as string | undefined);
      const socialModel = resolveModelSelection(aiCatalog, socialProvider, prev.social_ai_model as string | undefined);

      let changed = false;

      if (taglineProvider && prev.ai_gen_provider !== taglineProvider) {
        next.ai_gen_provider = taglineProvider;
        changed = true;
      }
      if (taglineModel && prev.ai_gen_model !== taglineModel) {
        next.ai_gen_model = taglineModel;
        changed = true;
      }
      if (socialProvider && prev.social_ai_provider !== socialProvider) {
        next.social_ai_provider = socialProvider;
        changed = true;
      }
      if (socialModel && prev.social_ai_model !== socialModel) {
        next.social_ai_model = socialModel;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [aiCatalog]);

  const handleTaglineProviderChange = useCallback((provider: string) => {
    const nextModel = resolveModelSelection(aiCatalog, provider, undefined);
    setData((prev) => ({
      ...prev,
      ai_gen_provider: provider,
      ai_gen_model: nextModel,
    }));
  }, [aiCatalog]);

  const handleSocialProviderChange = useCallback((provider: string) => {
    const nextModel = resolveModelSelection(aiCatalog, provider, undefined);
    setData((prev) => ({
      ...prev,
      social_ai_provider: provider,
      social_ai_model: nextModel,
    }));
  }, [aiCatalog]);

  const handleTaglineModelChange = useCallback((model: string) => {
    onChange("ai_gen_model", model);
  }, [onChange]);

  const handleSocialModelChange = useCallback((model: string) => {
    onChange("social_ai_model", model);
  }, [onChange]);

  const handleGenerateTaglines = useCallback(async () => {
    const prompt = String(data.ai_top_prompt || "").trim();
    const provider = String(data.ai_gen_provider || "");
    const model = String(data.ai_gen_model || "");

    if (!prompt) {
      setTaglineGenResult("Topic enter karein, phir taglines generate karein.");
      return;
    }
    if (!provider || !model) {
      setTaglineGenResult("AI provider/model available nahi hai. Settings me API key save karein.");
      return;
    }

    setTaglineGenerating(true);
    setTaglineGenResult("");

    try {
      const res = await fetch("/api/settings/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "taglines",
          provider,
          model,
          prompt,
          count: 5,
        }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        onChange("top_taglines", result.data.top || []);
        onChange("bottom_taglines", result.data.bottom || []);
        setTaglineGenResult(`Generated taglines with ${result.data.provider} - ${result.data.model}`);
      } else {
        setTaglineGenResult(result.error || "Tagline generation failed");
      }
    } catch {
      setTaglineGenResult("Tagline generation failed");
    }

    setTaglineGenerating(false);
  }, [data, onChange]);

  const handleGenerateSocial = useCallback(async () => {
    const topic = String(data.social_topic || "").trim();
    const platform = String(data.social_platform || "youtube");
    const count = Number.parseInt(String(data.social_count || "10"), 10);
    const provider = String(data.social_ai_provider || "");
    const model = String(data.social_ai_model || "");

    if (!topic) {
      setSocialGenResult("Topic enter karein, phir social content generate karein.");
      return;
    }
    if (!provider || !model) {
      setSocialGenResult("AI provider/model available nahi hai. Settings me API key save karein.");
      return;
    }

    setSocialGenerating(true);
    setSocialGenResult("");

    try {
      const res = await fetch("/api/settings/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "social",
          provider,
          model,
          topic,
          platform,
          count: Number.isFinite(count) ? count : 10,
        }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        onChange("titles", result.data.titles || []);
        onChange("descriptions", result.data.descriptions || []);
        onChange("hashtags", result.data.hashtags || []);
        setSocialGenResult(`Generated social content with ${result.data.provider} - ${result.data.model}`);
      } else {
        setSocialGenResult(result.error || "Social content generation failed");
      }
    } catch {
      setSocialGenResult("Social content generation failed");
    }

    setSocialGenerating(false);
  }, [data, onChange]);

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

  const renderTabContent = () => {
    if (initializing) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
          <span className="ml-3 text-[#a1a1aa]">Loading...</span>
        </div>
      );
    }

    switch (activeTab) {
      case "basic": return <BasicTab data={data} onChange={onChange} />;
      case "video": return <VideoTab data={data} onChange={onChange} />;
      case "taglines":
        return (
          <TaglinesTab
            data={data}
            onChange={onChange}
            aiProviders={getAvailableProviders(aiCatalog)}
            generating={taglineGenerating || aiLoading}
            genResult={taglineGenResult}
            onAiGenerate={handleGenerateTaglines}
            onProviderChange={handleTaglineProviderChange}
            onModelChange={handleTaglineModelChange}
          />
        );
      case "social":
        return (
          <SocialTab
            data={data}
            onChange={onChange}
            aiProviders={getAvailableProviders(aiCatalog)}
            generating={socialGenerating || aiLoading}
            genResult={socialGenResult}
            onAiGenerate={handleGenerateSocial}
            onProviderChange={handleSocialProviderChange}
            onModelChange={handleSocialModelChange}
          />
        );
      case "publish": return <PublishTab data={data} onChange={onChange} />;
      default: return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" 
      onClick={onClose}
    >
      <div 
        className="glass-card w-full max-w-[1400px] h-[85vh] flex flex-col overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.08)] flex-shrink-0">
          <h3 className="text-xl font-bold">{editData ? "Edit" : "Create"} {type === "video" ? "Video" : "Image"} Automation</h3>
          <button onClick={onClose} className="glass-button py-1.5 px-4 text-sm">Close</button>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT Side - Vertical Tabs */}
          <div className="w-56 flex-shrink-0 border-r border-[rgba(255,255,255,0.08)] p-4 flex flex-col gap-2">
            <div className="text-[10px] font-semibold text-[#71717a] uppercase tracking-wider mb-2 px-2">
              Steps
            </div>
            {tabs.map(tab => (
              <TabButton
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>

          {/* RIGHT Side - Content */}
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            {/* Name Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Automation Name *</label>
              <input 
                className="glass-input w-full" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="e.g., Daily YouTube Shorts" 
              />
            </div>

            {/* Tab Content */}
            {renderTabContent()}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between px-6 py-4 border-t border-[rgba(255,255,255,0.08)] flex-shrink-0">
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
});
