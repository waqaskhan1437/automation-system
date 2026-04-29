"use client";
import { useState, useEffect, useCallback, memo } from "react";
import { Automation } from "./types";
import type { AIModelCatalogResponse } from "@/lib/types";
import { getAvailableProviders, normalizeAiCatalog, resolveModelSelection, resolveProviderSelection } from "@/lib/ai";
import { useSessionUser } from "@/components/layout/ClientWrapper";
import { api } from "@/lib/api";
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

type PromptPlanSegment = {
  title?: string;
  caption?: string;
  hashtags?: string[];
};

type PromptPlanPayload = {
  recommended_merge?: boolean;
  segments?: PromptPlanSegment[];
  titles?: string[];
  descriptions?: string[];
  hashtags?: string[];
};

function getPromptPlanSegmentCount(plan: PromptPlanPayload | null | undefined): number {
  return Array.isArray(plan?.segments) ? plan.segments.length : 0;
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

const DEFAULT_VIDEO_CONFIG = {
  source_shorts_mode: "single",
  source_shorts_max_count: "3",
  short_duration: "60",
  videos_per_run: "1",
  aspect_ratio: "9:16",
  tagline_gen_count: 3,
  tagline_add_more: false,
  short_generation_mode: "normal",
  prompt_merge_generated_shorts: false,
  prompt_source_type: "youtube",
  prompt_video_url: "",
  prompt_local_file_path: "",
};

function extractPromptSocialContent(plan: PromptPlanPayload | null | undefined): {
  titles: string[];
  descriptions: string[];
  hashtags: string[];
} {
  const segments = Array.isArray(plan?.segments) ? plan.segments : [];
  const segmentCount = getPromptPlanSegmentCount(plan);
  const hashtagLimit = Math.min(Math.max(segmentCount * 3, 3), 40);
  const segmentTitles = segments
    .map((segment) => (typeof segment.title === "string" ? segment.title.trim() : ""))
    .filter(Boolean);
  const segmentDescriptions = segments
    .map((segment) => (typeof segment.caption === "string" ? segment.caption.trim() : ""))
    .filter(Boolean);
  const segmentHashtags = Array.from(
    new Set(
      segments.flatMap((segment) => (
        Array.isArray(segment.hashtags)
          ? segment.hashtags.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : []
      ))
    )
  ).slice(0, hashtagLimit);

  const planTitles = Array.isArray(plan?.titles)
    ? plan.titles.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, segmentCount)
    : [];
  const planDescriptions = Array.isArray(plan?.descriptions)
    ? plan.descriptions.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, segmentCount)
    : [];
  const planHashtags = Array.isArray(plan?.hashtags)
    ? plan.hashtags.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, hashtagLimit)
    : [];

  return {
    titles: planTitles.length > 0 ? planTitles : segmentTitles.slice(0, segmentCount),
    descriptions: planDescriptions.length > 0 ? planDescriptions : segmentDescriptions.slice(0, segmentCount),
    hashtags: planHashtags.length > 0 ? planHashtags : segmentHashtags,
  };
}


function splitHttpText(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value.split(/\r?\n|,/g).map((line) => line.trim()).filter((line) => /^https?:\/\//i.test(line));
}

function normalizeLegacyGooglePhotosConfig(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  if (next.video_source === "google_photos") {
    const links = splitHttpText(next.google_photos_links);
    const albumUrls = splitHttpText(next.google_photos_album_url);
    if (links.length === 0 && albumUrls.some((url) => /photos\.google\.com|photos\.app\.goo\.gl/i.test(url))) {
      next.google_photos_links = albumUrls.join("\n");
      next.google_photos_album_url = "";
      next.google_photos_migrated_from_album_url = true;
    }
  }
  return next;
}

export default memo(function AutomationModal({ type, editData, onClose, onSaved }: Props) {
  const sessionUser = useSessionUser();
  const isLocalRunnerUser = sessionUser?.is_admin === false;
  const [activeTab, setActiveTab] = useState("basic");
  const [name, setName] = useState(editData?.name || "");
  const [data, setData] = useState<Record<string, unknown>>(editData ? {} : DEFAULT_VIDEO_CONFIG);
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [aiCatalog, setAiCatalog] = useState<AIModelCatalogResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [taglineGenerating, setTaglineGenerating] = useState(false);
  const [socialGenerating, setSocialGenerating] = useState(false);
  const [promptPlanGenerating, setPromptPlanGenerating] = useState(false);
  const [taglineGenResult, setTaglineGenResult] = useState("");
  const [socialGenResult, setSocialGenResult] = useState("");
  const [promptPlanResult, setPromptPlanResult] = useState("");

  useEffect(() => {
    if (!editData) {
      setData({ ...DEFAULT_VIDEO_CONFIG });
      return;
    }
    
    setInitializing(true);
    const timer = setTimeout(() => {
      if (editData?.config) {
        try {
          const cfg = JSON.parse(editData.config);
          setData(normalizeLegacyGooglePhotosConfig({ ...DEFAULT_VIDEO_CONFIG, ...cfg }));
          setName(editData.name);
        } catch (e) {
          console.error("Failed to parse config:", e);
          setData({ ...DEFAULT_VIDEO_CONFIG });
        }
      } else {
        setData({ ...DEFAULT_VIDEO_CONFIG });
      }
      setInitializing(false);
    }, 50);
    
    return () => clearTimeout(timer);
  }, [editData?.id]);

  const loadAiCatalog = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await api.get<{ default_provider: string | null; providers: Array<{ id: string; name: string; models: string[] }> }>("/api/settings/ai/models");
      if (res.success && res.data) {
        setAiCatalog(normalizeAiCatalog(res.data as AIModelCatalogResponse));
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
    if (!sessionUser) {
      return;
    }

    setData((prev) => {
      const currentSourceType = typeof prev.prompt_source_type === "string" ? prev.prompt_source_type : "";
      const shouldDefaultLocalFile = !editData
        && isLocalRunnerUser
        && (!currentSourceType || (currentSourceType === "youtube" && !prev.prompt_video_url && !prev.prompt_local_file_path));

      if (currentSourceType && !shouldDefaultLocalFile) {
        return prev;
      }

      return {
        ...prev,
        prompt_source_type: isLocalRunnerUser ? "local_file" : "youtube",
      };
    });
  }, [editData, isLocalRunnerUser, sessionUser]);

  useEffect(() => {
    const providers = getAvailableProviders(aiCatalog);
    if (providers.length === 0) return;

    setData((prev) => {
      const next = { ...prev };

      const taglineProvider = resolveProviderSelection(aiCatalog, prev.ai_gen_provider as string | undefined);
      const socialProvider = resolveProviderSelection(aiCatalog, prev.social_ai_provider as string | undefined);
      const promptProvider = resolveProviderSelection(aiCatalog, prev.prompt_ai_provider as string | undefined);
      const taglineModel = resolveModelSelection(aiCatalog, taglineProvider, prev.ai_gen_model as string | undefined);
      const socialModel = resolveModelSelection(aiCatalog, socialProvider, prev.social_ai_model as string | undefined);
      const promptModel = resolveModelSelection(aiCatalog, promptProvider, prev.prompt_ai_model as string | undefined);

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
      if (promptProvider && prev.prompt_ai_provider !== promptProvider) {
        next.prompt_ai_provider = promptProvider;
        changed = true;
      }
      if (promptModel && prev.prompt_ai_model !== promptModel) {
        next.prompt_ai_model = promptModel;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [aiCatalog]);

  useEffect(() => {
    if (data.short_generation_mode !== "prompt") {
      return;
    }

    const segmentCount = getPromptPlanSegmentCount(data.prompt_short_plan as PromptPlanPayload | undefined);
    if (segmentCount <= 0) {
      return;
    }

    setData((prev) => (
      String(prev.social_count || "") === String(segmentCount)
        ? prev
        : { ...prev, social_count: String(segmentCount) }
    ));
  }, [data.prompt_short_plan, data.short_generation_mode]);

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

  const handlePromptProviderChange = useCallback((provider: string) => {
    const nextModel = resolveModelSelection(aiCatalog, provider, undefined);
    setData((prev) => ({
      ...prev,
      prompt_ai_provider: provider,
      prompt_ai_model: nextModel,
    }));
  }, [aiCatalog]);

  const handleTaglineModelChange = useCallback((model: string) => {
    onChange("ai_gen_model", model);
  }, [onChange]);

  const handleSocialModelChange = useCallback((model: string) => {
    onChange("social_ai_model", model);
  }, [onChange]);

  const handlePromptModelChange = useCallback((model: string) => {
    onChange("prompt_ai_model", model);
  }, [onChange]);

  const handleGenerateTaglines = useCallback(async () => {
    const prompt = String(data.ai_top_prompt || "").trim();
    const provider = String(data.ai_gen_provider || "");
    const model = String(data.ai_gen_model || "");
    const genCount = Number(data.tagline_gen_count) || 3;
    const addMore = Boolean(data.tagline_add_more);
    const existingTop = Array.isArray(data.top_taglines) ? data.top_taglines : [];
    const existingBottom = Array.isArray(data.bottom_taglines) ? data.bottom_taglines : [];

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
      const res = await api.post<{
        top?: string[];
        bottom?: string[];
        provider?: string;
        model?: string;
      }>("/api/settings/ai/generate", {
        task: "taglines",
        provider,
        model,
        prompt,
        count: genCount,
      });
      const result = res;
      if (result.success && result.data) {
        let newTop = result.data.top || [];
        let newBottom = result.data.bottom || [];
        
        if (addMore && existingTop.length > 0) {
          const combined = [...existingTop, ...newTop];
          onChange("top_taglines", combined);
          onChange("bottom_taglines", [...existingBottom, ...newBottom]);
          setTaglineGenResult(`Generated ${newTop.length} taglines (added to ${existingTop.length} existing)`);
        } else {
          onChange("top_taglines", newTop);
          onChange("bottom_taglines", newBottom);
          setTaglineGenResult(`Generated ${newTop.length} taglines with ${result.data.provider}`);
        }
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
    const promptSegmentCount = getPromptPlanSegmentCount(data.prompt_short_plan as PromptPlanPayload | undefined);
    const count = data.short_generation_mode === "prompt" && promptSegmentCount > 0
      ? promptSegmentCount
      : Number.parseInt(String(data.social_count || "10"), 10);
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
      const res = await api.post<{
        titles?: string[];
        descriptions?: string[];
        hashtags?: string[];
        provider?: string;
        model?: string;
      }>("/api/settings/ai/generate", {
        task: "social",
        provider,
        model,
        topic,
        platform,
        count: Number.isFinite(count) ? count : 10,
      });
      const result = res;
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

  const handleGeneratePromptPlan = useCallback(async () => {
    const prompt = String(data.prompt_analysis_text || "").trim();
    const provider = String(data.prompt_ai_provider || "");
    const model = String(data.prompt_ai_model || "");

    if (!prompt) {
      setPromptPlanResult("Prompt paste karein, phir plan generate karein.");
      return;
    }
    if (!provider || !model) {
      setPromptPlanResult("AI provider/model available nahi hai. Settings me API key save karein.");
      return;
    }

    setPromptPlanGenerating(true);
    setPromptPlanResult("");

    try {
      const res = await api.post<{
        plan?: {
          recommended_merge?: boolean;
          segments?: Array<{ duration_seconds?: number }>;
        };
        provider?: string;
        model?: string;
      }>("/api/settings/ai/generate", {
        task: "short_prompt_plan",
        provider,
        model,
        prompt,
      });
      const result = res;
      if (result.success && result.data?.plan) {
        const plan = result.data.plan as PromptPlanPayload & {
          segments?: Array<{ duration_seconds?: number }>;
        };
        const segmentCount = Array.isArray(plan.segments) ? plan.segments.length : 0;
        const firstDuration = Number(plan.segments?.[0]?.duration_seconds || 0);
        const promptSocialContent = extractPromptSocialContent(plan);

        onChange("prompt_short_plan", result.data.plan);
        onChange("titles", promptSocialContent.titles);
        onChange("descriptions", promptSocialContent.descriptions);
        onChange("hashtags", promptSocialContent.hashtags);
        onChange("prompt_merge_generated_shorts", plan.recommended_merge === true || data.prompt_merge_generated_shorts === true);
        onChange("social_count", String(Math.max(segmentCount, 1)));
        if (segmentCount > 0) {
          onChange("source_shorts_mode", segmentCount > 1 ? "fixed_count" : "single");
          onChange("source_shorts_max_count", String(segmentCount));
        }
        if (firstDuration > 0) {
          onChange("short_duration", String(Math.max(1, Math.round(firstDuration))));
        }
        setPromptPlanResult(`Generated ${segmentCount || 0} prompt-driven short plan(s) with ${result.data.provider}.`);
      } else {
        setPromptPlanResult(result.error || "Prompt plan generation failed");
      }
    } catch {
      setPromptPlanResult("Prompt plan generation failed");
    }

    setPromptPlanGenerating(false);
  }, [data, onChange]);

  const handleApplyPromptSocialContent = useCallback(() => {
    const promptSocialContent = extractPromptSocialContent(data.prompt_short_plan as PromptPlanPayload | undefined);
    if (
      promptSocialContent.titles.length === 0 &&
      promptSocialContent.descriptions.length === 0 &&
      promptSocialContent.hashtags.length === 0
    ) {
      setSocialGenResult("Prompt plan me social content mila nahi. Pehle Basic tab mein prompt plan generate karein.");
      return;
    }

    onChange("titles", promptSocialContent.titles);
    onChange("descriptions", promptSocialContent.descriptions);
    onChange("hashtags", promptSocialContent.hashtags);
    onChange("social_count", String(Math.max(getPromptPlanSegmentCount(data.prompt_short_plan as PromptPlanPayload | undefined), 1)));
    setSocialGenResult("Prompt plan ka social content Social tab me apply ho gaya aur save hoga.");
  }, [data.prompt_short_plan, onChange]);

  const handlePromptSourceTypeChange = useCallback((value: string) => {
    setData((prev) => ({
      ...prev,
      prompt_source_type: value,
      video_source: value === "youtube" ? "youtube" : value === "direct" ? "direct" : prev.video_source,
      google_photos_links: value === "youtube" || value === "direct" ? "" : prev.google_photos_links,
      google_photos_album_url: value === "youtube" || value === "direct" ? "" : prev.google_photos_album_url,
      prompt_video_url: value === "local_file" ? "" : String(prev.prompt_video_url || ""),
      prompt_local_file_path: value === "local_file" ? String(prev.prompt_local_file_path || "") : "",
    }));
  }, []);

  const handlePromptPickLocalFile = useCallback(async () => {
    try {
      const res = await fetch("/api/local-file-picker", {
        method: "POST",
      });
      const result = await res.json();
      if (result.success && result.data?.path) {
        onChange("prompt_local_file_path", result.data.path);
        return;
      }

      setPromptPlanResult(result.error || "Local file select nahi hua.");
    } catch {
      setPromptPlanResult("Local file picker open nahi hua.");
    }
  }, [onChange]);

  const handleSave = async () => {
    if (!name.trim()) { alert("Name is required"); return; }
    setSaving(true);
    try {
      const configToSave = normalizeLegacyGooglePhotosConfig({ ...data });
      if (configToSave.short_generation_mode === "prompt") {
        const promptSourceType = typeof configToSave.prompt_source_type === "string" ? configToSave.prompt_source_type : "youtube";
        if (promptSourceType === "youtube" || promptSourceType === "direct") {
          configToSave.video_source = promptSourceType;
          configToSave.google_photos_links = "";
          configToSave.google_photos_album_url = "";
        }
      }
      const body = { name, type, config: JSON.stringify(configToSave), schedule: null };
      const result = editData
        ? await api.put<{ success: boolean; error?: string }>(`/api/automations/${editData.id}`, body)
        : await api.post<{ success: boolean; error?: string }>("/api/automations", body);
      if (result.success) onSaved();
      else alert("Failed: " + (result.error || "Unknown error"));
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
      case "basic":
        return (
          <BasicTab
            data={data}
            onChange={onChange}
            isLocalRunnerUser={isLocalRunnerUser}
            aiProviders={getAvailableProviders(aiCatalog)}
            promptGenerating={promptPlanGenerating || aiLoading}
            promptGenResult={promptPlanResult}
            onPromptAiGenerate={handleGeneratePromptPlan}
            onPromptProviderChange={handlePromptProviderChange}
            onPromptModelChange={handlePromptModelChange}
            onPromptSourceTypeChange={handlePromptSourceTypeChange}
            onPromptPickLocalFile={handlePromptPickLocalFile}
          />
        );
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
      case "social": {
        const promptSegmentCount = getPromptPlanSegmentCount(data.prompt_short_plan as PromptPlanPayload | undefined);
        return (
          <SocialTab
            data={data}
            onChange={onChange}
            promptModeActive={data.short_generation_mode === "prompt"}
            promptPlanAvailable={promptSegmentCount > 0}
            promptSegmentCount={promptSegmentCount}
            aiProviders={getAvailableProviders(aiCatalog)}
            generating={socialGenerating || aiLoading}
            genResult={socialGenResult}
            onAiGenerate={handleGenerateSocial}
            onProviderChange={handleSocialProviderChange}
            onModelChange={handleSocialModelChange}
            onUsePromptContent={handleApplyPromptSocialContent}
          />
        );
      }
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
