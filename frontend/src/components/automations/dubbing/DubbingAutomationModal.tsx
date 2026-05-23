"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Automation } from "../types";

type SourceMode = "upload" | "local" | "url";
type TargetLanguage =
  | "ur" | "hi" | "ar" | "bn" | "tr"
  | "es" | "fr" | "de" | "pt" | "it"
  | "ru" | "ja" | "ko" | "zh" | "id"
  | "vi" | "th" | "nl" | "pl" | "sv"
  | "el" | "ro" | "hu" | "cs" | "uk"
  | "fi" | "da" | "ms" | "no" | "sw"
  | "tl" | "my" | "km" | "lo" | "he";
type TranslationEngine = "llm" | "nllb";
type VoiceEngine = "voxcpm2" | "xtts" | "edge";
type VoiceMode = "ultimate" | "controllable" | "design";
type MixMode = "replace" | "bed";

type ReferenceAudioSource = "upload" | "builtin" | "none";

const BUILTIN_SAMPLES = [
  { id: "urdu-male", label: "Urdu Male", path: "C:\\dubbing-samples\\urdu-male.wav" },
  { id: "urdu-female", label: "Urdu Female", path: "C:\\dubbing-samples\\urdu-female.wav" },
  { id: "hindi-male", label: "Hindi Male", path: "C:\\dubbing-samples\\hindi-male.wav" },
  { id: "hindi-female", label: "Hindi Female", path: "C:\\dubbing-samples\\hindi-female.wav" },
];

interface DubbingConfig {
  sourceMode: SourceMode;
  sourceValue: string;
  targetLanguage: TargetLanguage;
  translationEngine: TranslationEngine;
  voiceEngine: VoiceEngine;
  voiceMode: VoiceMode;
  voiceStyle: string;
  mixMode: MixMode;
  preserveBackground: boolean;
  diarization: boolean;
  lipSync: boolean;
  speedLimit: number;
  voiceReferenceSeconds: number;
  aiProvider: string;
  referenceAudioSource: ReferenceAudioSource;
  referenceAudioPath: string;
}

interface AISettingsData {
  gemini_key: string | null;
  openai_key: string | null;
  grok_key: string | null;
  cohere_key: string | null;
  openrouter_key: string | null;
  groq_key: string | null;
  default_provider: string | null;
}

const AI_PROVIDERS: Record<string, { label: string; apiKeyField: keyof AISettingsData }> = {
  openai: { label: "OpenAI", apiKeyField: "openai_key" },
  gemini: { label: "Google Gemini", apiKeyField: "gemini_key" },
  grok: { label: "xAI Grok", apiKeyField: "grok_key" },
  cohere: { label: "Cohere", apiKeyField: "cohere_key" },
  openrouter: { label: "OpenRouter", apiKeyField: "openrouter_key" },
  groq: { label: "Groq", apiKeyField: "groq_key" },
};

const stages = [
  { label: "Extract", detail: "FFmpeg audio and frames" },
  { label: "Separate", detail: "Demucs vocal bed" },
  { label: "Transcribe", detail: "WhisperX timestamps" },
  { label: "Speakers", detail: "pyannote diarization" },
  { label: "Translate", detail: "Target language dialogue" },
  { label: "Clone", detail: "Speaker voice match" },
  { label: "Align", detail: "Timing and speed fit" },
  { label: "Mix", detail: "Final dubbed video" },
];

const voiceEngines: Record<VoiceEngine, { label: string; note: string }> = {
  voxcpm2: { label: "VoxCPM2", note: "Primary cloning path." },
  xtts: { label: "XTTS v2 fallback", note: "Useful fallback for Hindi." },
  edge: { label: "Edge TTS fallback", note: "Fast stock Urdu/Hindi voice." },
};

const voiceModes: Record<VoiceMode, { label: string; desc: string }> = {
  ultimate: { label: "Ultimate Cloning", desc: "Reference audio + original transcript — best fidelity" },
  controllable: { label: "Controllable Cloning", desc: "Reference audio + optional style instructions" },
  design: { label: "Voice Design", desc: "Zero-shot — describe voice in text, no reference needed" },
};

const voiceStylePresets = [
  { value: "", label: "No style hint" },
  { value: "neutral, conversational tone", label: "Neutral conversation" },
  { value: "slightly faster, cheerful tone", label: "Cheerful & faster" },
  { value: "slow, calm, soothing voice", label: "Calm & soothing" },
  { value: "authoritative, deep voice", label: "Authoritative" },
  { value: "soft, gentle, warm voice", label: "Gentle & warm" },
];

const LANGUAGES: Record<string, { label: string; script: string; category: string; edgeVoice: string }> = {
  ur: { label: "Urdu", script: "Nastaliq", category: "South Asian", edgeVoice: "ur-PK-AsadNeural" },
  hi: { label: "Hindi", script: "Devanagari", category: "South Asian", edgeVoice: "hi-IN-MadhurNeural" },
  bn: { label: "Bengali", script: "Bangla", category: "South Asian", edgeVoice: "bn-BD-PradeepNeural" },
  ar: { label: "Arabic", script: "Arabic", category: "Middle Eastern", edgeVoice: "ar-SA-HamedNeural" },
  tr: { label: "Turkish", script: "Latin", category: "European", edgeVoice: "tr-TR-AhmetNeural" },
  he: { label: "Hebrew", script: "Hebrew", category: "Middle Eastern", edgeVoice: "he-IL-AvriNeural" },
  es: { label: "Spanish", script: "Latin", category: "European", edgeVoice: "es-ES-AlvaroNeural" },
  fr: { label: "French", script: "Latin", category: "European", edgeVoice: "fr-FR-DeniseNeural" },
  de: { label: "German", script: "Latin", category: "European", edgeVoice: "de-DE-KatjaNeural" },
  pt: { label: "Portuguese", script: "Latin", category: "European", edgeVoice: "pt-BR-AntonioNeural" },
  it: { label: "Italian", script: "Latin", category: "European", edgeVoice: "it-IT-DiegoNeural" },
  ru: { label: "Russian", script: "Cyrillic", category: "European", edgeVoice: "ru-RU-SvetlanaNeural" },
  nl: { label: "Dutch", script: "Latin", category: "European", edgeVoice: "nl-NL-MaartenNeural" },
  pl: { label: "Polish", script: "Latin", category: "European", edgeVoice: "pl-PL-MarekNeural" },
  sv: { label: "Swedish", script: "Latin", category: "European", edgeVoice: "sv-SE-MattiasNeural" },
  el: { label: "Greek", script: "Greek", category: "European", edgeVoice: "el-GR-NestorasNeural" },
  ro: { label: "Romanian", script: "Latin", category: "European", edgeVoice: "ro-RO-EmilNeural" },
  hu: { label: "Hungarian", script: "Latin", category: "European", edgeVoice: "hu-HU-TamasNeural" },
  cs: { label: "Czech", script: "Latin", category: "European", edgeVoice: "cs-CZ-AntoninNeural" },
  uk: { label: "Ukrainian", script: "Cyrillic", category: "European", edgeVoice: "uk-UA-OstapNeural" },
  fi: { label: "Finnish", script: "Latin", category: "European", edgeVoice: "fi-FI-HarriNeural" },
  da: { label: "Danish", script: "Latin", category: "European", edgeVoice: "da-DK-JeppeNeural" },
  no: { label: "Norwegian", script: "Latin", category: "European", edgeVoice: "nb-NO-FinnNeural" },
  ms: { label: "Malay", script: "Latin", category: "Southeast Asian", edgeVoice: "ms-MY-OsmanNeural" },
  id: { label: "Indonesian", script: "Latin", category: "Southeast Asian", edgeVoice: "id-ID-ArdiNeural" },
  vi: { label: "Vietnamese", script: "Latin", category: "Southeast Asian", edgeVoice: "vi-VN-NamMinhNeural" },
  th: { label: "Thai", script: "Thai", category: "Southeast Asian", edgeVoice: "th-TH-NiwatNeural" },
  tl: { label: "Tagalog", script: "Latin", category: "Southeast Asian", edgeVoice: "fil-PH-AngeloNeural" },
  my: { label: "Burmese", script: "Burmese", category: "Southeast Asian", edgeVoice: "my-MM-NilarNeural" },
  km: { label: "Khmer", script: "Khmer", category: "Southeast Asian", edgeVoice: "km-KH-PisethNeural" },
  lo: { label: "Lao", script: "Lao", category: "Southeast Asian", edgeVoice: "lo-LA-KeomanyNeural" },
  sw: { label: "Swahili", script: "Latin", category: "African", edgeVoice: "sw-KE-RafikiNeural" },
  ja: { label: "Japanese", script: "Kana", category: "East Asian", edgeVoice: "ja-JP-KeitaNeural" },
  ko: { label: "Korean", script: "Hangul", category: "East Asian", edgeVoice: "ko-KR-SunHiNeural" },
  zh: { label: "Chinese", script: "Han", category: "East Asian", edgeVoice: "zh-CN-XiaoxiaoNeural" },
};

const LANG_CATEGORIES = [
  { id: "South Asian", label: "South Asia" },
  { id: "Middle Eastern", label: "Middle East" },
  { id: "European", label: "Europe" },
  { id: "Southeast Asian", label: "Southeast Asia" },
  { id: "East Asian", label: "East Asia" },
  { id: "African", label: "Africa" },
];

function parseDubbingConfig(config: string | null): DubbingConfig | null {
  if (!config) return null;
  try {
    const parsed = JSON.parse(config);
    const dubbing = parsed.dubbing || {};
    return {
      sourceMode: (parsed.source_mode as SourceMode) || "upload",
      sourceValue: parsed.source_value || "",
      targetLanguage: (dubbing.target_language as TargetLanguage) || "ur",
      translationEngine: (dubbing.translation_engine as TranslationEngine) || "llm",
      voiceEngine: (dubbing.voice_engine as VoiceEngine) || "voxcpm2",
      voiceMode: (dubbing.voice_mode as VoiceMode) || "ultimate",
      voiceStyle: dubbing.voice_style || "",
      mixMode: (dubbing.mix_mode as MixMode) || "bed",
      preserveBackground: dubbing.preserve_background !== false,
      diarization: dubbing.diarization_enabled !== false,
      lipSync: dubbing.lip_sync_enabled === true,
      speedLimit: Number(dubbing.max_tempo) || 1.2,
      voiceReferenceSeconds: Number(dubbing.voice_reference_seconds) || 18,
      aiProvider: dubbing.ai_provider || "openai",
      referenceAudioSource: (dubbing.reference_audio_source as ReferenceAudioSource) || "none",
      referenceAudioPath: dubbing.reference_audio_path || "",
    };
  } catch {
    return null;
  }
}

function buildManifest(config: DubbingConfig, name: string) {
  return {
    workflow: "dubbing",
    type: "video",
    name,
    video_source: config.sourceMode === "url" ? "direct" : config.sourceMode === "local" ? "local_file" : "uploaded_file",
    source_mode: config.sourceMode,
    source_value: config.sourceValue || null,
    dubbing: {
      source_language: "en",
      target_language: config.targetLanguage,
      translation_engine: config.translationEngine,
      voice_engine: config.voiceEngine,
      voice_mode: config.voiceEngine === "voxcpm2" ? config.voiceMode : undefined,
      voice_style: config.voiceEngine === "voxcpm2" ? config.voiceStyle : undefined,
      voice_reference_seconds: config.voiceReferenceSeconds,
      reference_audio_source: config.referenceAudioSource,
      reference_audio_path: config.referenceAudioPath || undefined,
      ai_provider: config.aiProvider,
      diarization_enabled: config.diarization,
      mix_mode: config.mixMode,
      preserve_background: config.preserveBackground,
      max_tempo: config.speedLimit,
      lip_sync_enabled: config.lipSync,
      stages: stages.map((s) => s.label.toLowerCase()),
    },
  };
}

interface Props {
  editData: Automation | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function DubbingAutomationModal({ editData, onClose, onSaved }: Props) {
  const [name, setName] = useState(editData?.name || "English to Urdu short");
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [sourceValue, setSourceValue] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>("ur");
  const [translationEngine, setTranslationEngine] = useState<TranslationEngine>("llm");
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngine>("voxcpm2");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ultimate");
  const [voiceStyle, setVoiceStyle] = useState("");
  const [mixMode, setMixMode] = useState<MixMode>("bed");
  const [preserveBackground, setPreserveBackground] = useState(true);
  const [diarization, setDiarization] = useState(true);
  const [lipSync, setLipSync] = useState(false);
  const [speedLimit, setSpeedLimit] = useState(1.2);
  const [voiceReferenceSeconds, setVoiceReferenceSeconds] = useState(18);
  const [aiProvider, setAiProvider] = useState("openai");
  const [availableAiProviders, setAvailableAiProviders] = useState<string[]>([]);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [referenceAudioSource, setReferenceAudioSource] = useState<ReferenceAudioSource>("none");
  const [referenceAudioPath, setReferenceAudioPath] = useState("");

  // Load edit data
  useEffect(() => {
    if (editData?.config) {
      const parsed = parseDubbingConfig(editData.config);
      if (parsed) {
        setName(editData.name);
        setSourceMode(parsed.sourceMode);
        setSourceValue(parsed.sourceValue);
        setTargetLanguage(parsed.targetLanguage);
        setTranslationEngine(parsed.translationEngine);
        setVoiceEngine(parsed.voiceEngine);
        setVoiceMode(parsed.voiceMode);
        setVoiceStyle(parsed.voiceStyle);
        setMixMode(parsed.mixMode);
        setPreserveBackground(parsed.preserveBackground);
        setDiarization(parsed.diarization);
        setLipSync(parsed.lipSync);
        setSpeedLimit(parsed.speedLimit);
        setVoiceReferenceSeconds(parsed.voiceReferenceSeconds);
        setAiProvider(parsed.aiProvider);
        setReferenceAudioSource(parsed.referenceAudioSource);
        setReferenceAudioPath(parsed.referenceAudioPath);
      }
    }
    setInitializing(false);
  }, [editData?.id]);

  // Fetch AI settings
  useEffect(() => {
    async function loadAiSettings() {
      setAiSettingsLoading(true);
      try {
        const response = await api.get<AISettingsData>("/api/settings/ai");
        if (response.success && response.data) {
          const settings = response.data;
          const available: string[] = [];
          for (const [provider, info] of Object.entries(AI_PROVIDERS)) {
            if (settings[info.apiKeyField]) {
              available.push(provider);
            }
          }
          setAvailableAiProviders(available);
          const defaultP = settings.default_provider || available[0] || "openai";
          if (available.includes(defaultP)) {
            setAiProvider(defaultP);
          } else if (available.length > 0) {
            setAiProvider(available[0]);
          }
        }
      } catch {
        // ignore
      } finally {
        setAiSettingsLoading(false);
      }
    }
    void loadAiSettings();
  }, []);

  const sourceReady = sourceMode === "upload" ? Boolean(sourceValue) : sourceValue.trim().length > 5;
  const isReady = sourceReady && Boolean(targetLanguage) && Boolean(voiceEngine) && speedLimit >= 1.05 && speedLimit <= 1.35;

  const config: DubbingConfig = useMemo(() => ({
    sourceMode, sourceValue, targetLanguage, translationEngine, voiceEngine,
    voiceMode, voiceStyle, referenceAudioSource, referenceAudioPath,
    mixMode, preserveBackground, diarization, lipSync, speedLimit, voiceReferenceSeconds, aiProvider,
  }), [sourceMode, sourceValue, targetLanguage, translationEngine, voiceEngine, voiceMode, voiceStyle,
      referenceAudioSource, referenceAudioPath,
      mixMode, preserveBackground, diarization, lipSync, speedLimit, voiceReferenceSeconds, aiProvider]);

  const handleSave = useCallback(async (runNow = false) => {
    if (!isReady || saving) return;
    setSaving(true);
    setSaveError(null);

    try {
      const manifest = buildManifest(config, name);
      const body = {
        name,
        type: "dubbing",
        status: runNow ? "active" : "paused",
        config: JSON.stringify(manifest),
        schedule: null,
      };

      if (editData) {
        const response = await api.put<{ success: boolean; error?: string }>(`/api/automations/${editData.id}`, body);
        if (!response.success) {
          setSaveError(response.error || "Failed to save automation");
          return;
        }
      } else {
        const response = await api.post<{ id: number }>("/api/automations", body);
        if (!response.success) {
          setSaveError(response.error || "Failed to save automation");
          return;
        }
        if (runNow && response.data?.id) {
          try {
            await api.post(`/api/automations/${response.data.id}/run`, {});
          } catch {
            // ignore run errors — automation was created successfully
          }
        }
      }

      onSaved();
    } catch (error) {
      setSaveError(
        error instanceof ApiError ? error.message :
        error instanceof Error ? error.message :
        "Failed to save automation"
      );
    } finally {
      setSaving(false);
    }
  }, [isReady, saving, config, name, editData, onSaved]);

  if (initializing) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="glass-card p-12 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="w-6 h-6 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
          <span className="text-[#a1a1aa]">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="glass-card w-full max-w-[900px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.08)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(20,184,166,0.14)] text-teal-300">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m0 4v2m0 4v2m0 4v2M5 3l14 6-14 6" />
              </svg>
            </div>
            <h3 className="text-xl font-bold">
              {editData ? "Edit" : "Create"} Dubbing Automation
            </h3>
            {isReady && (
              <span className="rounded-full bg-emerald-400/15 px-3 py-0.5 text-xs font-semibold text-emerald-300">
                Ready
              </span>
            )}
          </div>
          <button onClick={onClose} className="glass-button py-1.5 px-4 text-sm">Close</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {/* Automation name */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Automation Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="glass-input w-full"
              placeholder="e.g., English to Urdu short"
            />
          </div>

          {saveError && (
            <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">
              {saveError}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            {/* LEFT COLUMN — Form fields */}
            <div className="space-y-6">
              {/* Source */}
              <section className="glass-card no-hover p-5">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-4 w-4 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <h4 className="text-base font-semibold">Source</h4>
                </div>
                <div className="flex gap-2 mb-3">
                  {(["upload", "local", "url"] as SourceMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => { setSourceMode(mode); setSourceValue(""); }}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium capitalize transition-colors ${
                        sourceMode === mode
                          ? "bg-[rgba(20,184,166,0.16)] text-teal-200 border border-[rgba(20,184,166,0.28)]"
                          : "bg-[rgba(255,255,255,0.03)] text-[#d4d4d8] border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.07)]"
                      }`}
                    >
                      {mode === "upload" ? "File" : mode === "local" ? "Local" : "URL"}
                    </button>
                  ))}
                </div>
                {sourceMode === "upload" ? (
                  <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.06)] p-4 text-center">
                    <span className="text-xs font-medium">{sourceValue || "Choose MP4/MOV file"}</span>
                    <input type="file" accept="video/*" className="hidden"
                      onChange={(e) => setSourceValue(e.target.files?.[0]?.name || "")} />
                  </label>
                ) : (
                  <input
                    value={sourceValue}
                    onChange={(e) => setSourceValue(e.target.value)}
                    className="glass-input w-full text-sm"
                    placeholder={sourceMode === "local" ? "C:\\Videos\\source.mp4" : "https://..."}
                  />
                )}
              </section>

              {/* Language & AI */}
              <section className="glass-card no-hover p-5">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-4 w-4 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m0 4v2m0 4v2m0 4v2M5 3l14 6-14 6" />
                  </svg>
                  <h4 className="text-base font-semibold">Language</h4>
                </div>
                {/* Language category selector */}
                <div className="space-y-3">
                  {LANG_CATEGORIES.map((cat) => {
                    const langsInCat = Object.entries(LANGUAGES)
                      .filter(([, info]) => info.category === cat.id);
                    if (langsInCat.length === 0) return null;
                    return (
                      <div key={cat.id}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#71717a]">
                          {cat.label}
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {langsInCat.map(([code, info]) => (
                            <button
                              key={code}
                              onClick={() => setTargetLanguage(code as TargetLanguage)}
                              className={`rounded-lg border px-2 py-1.5 text-left transition-all ${
                                targetLanguage === code
                                  ? "border-cyan-400/35 bg-cyan-400/12 text-cyan-100 shadow-[0_0_8px_rgba(34,211,238,0.08)]"
                                  : "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] text-[#d4d4d8] hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
                              }`}
                            >
                              <span className="block text-xs font-semibold leading-tight">{info.label}</span>
                              <span className="mt-0.5 block text-[9px] text-[#71717a]">{info.script}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium">Translation</label>
                    <select
                      value={translationEngine}
                      onChange={(e) => setTranslationEngine(e.target.value as TranslationEngine)}
                      className="glass-select text-sm"
                    >
                      <option value="llm">LLM quality mode</option>
                      <option value="nllb">NLLB offline fallback</option>
                    </select>
                  </div>
                  {translationEngine === "llm" && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium">
                        AI Provider
                        {aiSettingsLoading && <span className="ml-1 text-[10px] text-[#a1a1aa]">Loading...</span>}
                      </label>
                      <select
                        value={aiProvider}
                        onChange={(e) => setAiProvider(e.target.value)}
                        className="glass-select text-sm"
                        disabled={aiSettingsLoading}
                      >
                        {availableAiProviders.length === 0 ? (
                          <option value="openai">OpenAI (default)</option>
                        ) : (
                          availableAiProviders.map((provider) => (
                            <option key={provider} value={provider}>
                              {AI_PROVIDERS[provider]?.label || provider}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  )}
                </div>
              </section>

              {/* Voice */}
              <section className="glass-card no-hover p-5">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-4 w-4 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <h4 className="text-base font-semibold">Voice</h4>
                </div>
                <select
                  value={voiceEngine}
                  onChange={(e) => setVoiceEngine(e.target.value as VoiceEngine)}
                  className="glass-select text-sm w-full mb-3"
                >
                  {Object.entries(voiceEngines).map(([value, item]) => (
                    <option key={value} value={value}>{item.label}</option>
                  ))}
                </select>
                <p className="text-xs text-[#a1a1aa] mb-3">{voiceEngines[voiceEngine].note}</p>

                {/* Voice mode selector (only for VoxCPM2) */}
                {voiceEngine === "voxcpm2" && (
                  <div className="mb-4">
                    <label className="mb-1.5 block text-xs font-medium">Clone mode</label>
                    <div className="space-y-1.5">
                      {(["ultimate", "controllable", "design"] as VoiceMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setVoiceMode(mode)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                            voiceMode === mode
                              ? "bg-emerald-400/15 text-emerald-200 border border-emerald-400/25"
                              : "bg-[rgba(255,255,255,0.03)] text-[#a1a1aa] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]"
                          }`}
                        >
                          <span className="font-semibold">{voiceModes[mode].label}</span>
                          <span className="block mt-0.5 opacity-70">{voiceModes[mode].desc}</span>
                        </button>
                      ))}
                    </div>

                    {/* Voice Design: custom textarea for full voice description */}
                    {voiceMode === "design" && (
                      <div className="mt-3 space-y-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium">
                            🎨 Describe the voice you want
                          </label>
                          <textarea
                            value={voiceStyle}
                            onChange={(e) => setVoiceStyle(e.target.value)}
                            placeholder="e.g. A calm middle-aged man with a deep, authoritative tone, speaking slowly and clearly in Urdu with a slight regional accent"
                            className="glass-input w-full resize-none min-h-[70px] text-xs leading-relaxed"
                            rows={3}
                          />
                          {voiceStyle && (
                            <p className="mt-0.5 text-[10px] text-indigo-300/70">
                              ✨ Zero-shot — VoxCPM2 will create a voice matching this description
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-[#a1a1aa]">
                            Or pick a quick preset
                          </label>
                          <div className="flex flex-wrap gap-1">
                            {voiceStylePresets.filter(p => p.value).map((preset) => (
                              <button
                                key={preset.value}
                                onClick={() => setVoiceStyle(preset.value)}
                                className={`rounded-lg px-2 py-1 text-[10px] transition-colors ${
                                  voiceStyle === preset.value
                                    ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/30"
                                    : "bg-[rgba(255,255,255,0.04)] text-[#a1a1aa] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.08)]"
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Controllable mode: dropdown presets */}
                    {voiceMode === "controllable" && (
                      <div className="mt-3">
                        <label className="mb-1.5 block text-xs font-medium">Voice style hint</label>
                        <select
                          value={voiceStyle}
                          onChange={(e) => setVoiceStyle(e.target.value)}
                          className="glass-select text-sm w-full"
                        >
                          {voiceStylePresets.map((preset) => (
                            <option key={preset.value} value={preset.value}>{preset.label}</option>
                          ))}
                        </select>
                        {voiceStyle && (
                          <p className="mt-1 text-[10px] text-emerald-300/60">
                            Style: <span className="italic">"{voiceStyle}"</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Reference audio source selector (for ultimate/controllable) */}
                {voiceEngine === "voxcpm2" && voiceMode !== "design" && (
                  <div className="mt-3 mb-3 p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
                    <label className="mb-2 block text-xs font-medium">Reference Audio Source</label>
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      {([{ v: "none", l: "None" }, { v: "upload", l: "Upload" }, { v: "builtin", l: "Built-in" }] as { v: ReferenceAudioSource; l: string }[]).map((opt) => (
                        <button key={opt.v}
                          onClick={() => { setReferenceAudioSource(opt.v); if (opt.v !== "builtin") setReferenceAudioPath(""); }}
                          className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${
                            referenceAudioSource === opt.v
                              ? "bg-emerald-400/15 text-emerald-200 border border-emerald-400/25"
                              : "bg-[rgba(255,255,255,0.03)] text-[#a1a1aa] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]"
                          }`}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>

                    {referenceAudioSource === "upload" && (
                      <div className="space-y-1.5">
                        <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-[rgba(20,184,166,0.3)] bg-[rgba(20,184,166,0.05)] p-2 text-center">
                          <span className="text-[10px] font-medium">{referenceAudioPath || "Choose .wav/.mp3"}</span>
                          <input type="file" accept="audio/*" className="hidden"
                            onChange={(e) => setReferenceAudioPath(e.target.files?.[0]?.name || "")} />
                        </label>
                        <p className="text-[9px] text-[#71717a]">Upload a clean voice sample (6-45s)</p>
                      </div>
                    )}

                    {referenceAudioSource === "builtin" && (
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          {BUILTIN_SAMPLES.map((sample) => (
                            <button key={sample.id}
                              onClick={() => setReferenceAudioPath(referenceAudioPath === sample.path ? "" : sample.path)}
                              className={`rounded-lg px-2 py-1.5 text-[10px] text-left transition-colors ${
                                referenceAudioPath === sample.path
                                  ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/30"
                                  : "bg-[rgba(255,255,255,0.03)] text-[#a1a1aa] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]"
                              }`}
                            >
                              <span className="block font-semibold">{sample.label}</span>
                              <span className="block mt-0.5 opacity-60">Built-in</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium">Reference (sec)</span>
                    <input type="number" min={6} max={45} value={voiceReferenceSeconds}
                      onChange={(e) => setVoiceReferenceSeconds(Number(e.target.value))}
                      className="glass-input text-sm" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium">Max tempo</span>
                    <input type="number" min={1.05} max={1.35} step={0.05} value={speedLimit}
                      onChange={(e) => setSpeedLimit(Number(e.target.value))}
                      className="glass-input text-sm" />
                  </label>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN — Audio timing + pipeline */}
            <div className="space-y-6">
              {/* Audio & Timing */}
              <section className="glass-card no-hover p-5">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-4 w-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  <h4 className="text-base font-semibold">Audio & Timing</h4>
                </div>
                <div className="space-y-2">
                  {[
                    { checked: preserveBackground, set: setPreserveBackground, title: "Preserve background bed", detail: "Keep music and ambience under the dub" },
                    { checked: diarization, set: setDiarization, title: "Detect speakers", detail: "Clone and route by speaker segment" },
                    { checked: lipSync, set: setLipSync, title: "Lip-sync pass", detail: "Optional MuseTalk/Wav2Lip stage later" },
                  ].map((item) => (
                    <label key={item.title} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-3">
                      <input type="checkbox" checked={item.checked}
                        onChange={(e) => item.set(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[#14b8a6]" />
                      <div>
                        <span className="block text-sm font-semibold">{item.title}</span>
                        <span className="mt-0.5 block text-[11px] text-[#a1a1aa]">{item.detail}</span>
                      </div>
                    </label>
                  ))}
                  <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-3">
                    <span className="mb-2 block text-xs font-semibold">Mix mode</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setMixMode("bed")}
                        className={`rounded-lg px-3 py-1.5 text-xs ${mixMode === "bed" ? "bg-amber-400/15 text-amber-200" : "bg-white/5 text-[#d4d4d8]"}`}>
                        Music bed
                      </button>
                      <button onClick={() => setMixMode("replace")}
                        className={`rounded-lg px-3 py-1.5 text-xs ${mixMode === "replace" ? "bg-amber-400/15 text-amber-200" : "bg-white/5 text-[#d4d4d8]"}`}>
                        Replace
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Pipeline stages (compact) */}
              <section className="glass-card no-hover p-5">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-4 w-4 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <h4 className="text-base font-semibold">Pipeline</h4>
                </div>
                <div className="space-y-1.5">
                  {stages.map((stage, i) => (
                    <div key={stage.label} className="flex items-center gap-2 rounded-lg bg-[rgba(255,255,255,0.02)] px-3 py-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[rgba(99,102,241,0.12)] text-[10px] font-bold text-indigo-300">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-xs font-semibold">{stage.label}</span>
                      <span className="ml-auto text-[10px] text-[#6b7280]">{stage.detail}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Readiness summary */}
              <section className="glass-card no-hover p-5">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-4 w-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <h4 className="text-base font-semibold">Readiness</h4>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: "Video source", ok: sourceReady },
                    { label: "Target language", ok: Boolean(targetLanguage) },
                    { label: "Voice engine", ok: Boolean(voiceEngine) },
                    { label: "Timing limit", ok: speedLimit >= 1.05 && speedLimit <= 1.35 },
                  ].map((check) => (
                    <div key={check.label} className="flex items-center justify-between rounded-lg bg-[rgba(255,255,255,0.03)] px-3 py-1.5">
                      <span className="text-xs text-[#d4d4d8]">{check.label}</span>
                      {check.ok
                        ? <svg className="h-3.5 w-3.5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        : <svg className="h-3.5 w-3.5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" /></svg>
                      }
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[rgba(255,255,255,0.08)] flex-shrink-0">
          <button onClick={onClose} className="glass-button text-sm py-2 px-4">
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {!editData && (
              <button
                onClick={() => void handleSave(false)}
                disabled={!isReady || saving}
                className={`glass-button flex items-center gap-2 text-sm py-2 px-4 ${!isReady || saving ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {saving ? "Saving..." : "Save Only"}
              </button>
            )}
            <button
              onClick={() => void handleSave(!editData)}
              disabled={!isReady || saving}
              className={`glass-button-primary flex items-center gap-2 text-sm py-2 px-4 ${!isReady || saving ? "opacity-50 cursor-not-allowed hover:translate-y-0 hover:shadow-none" : ""}`}
              title={isReady ? (editData ? "Save changes" : "Create active automation and run immediately") : "Complete required fields first"}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {saving ? "Saving..." : editData ? "Update & Save" : "Create & Run Now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
