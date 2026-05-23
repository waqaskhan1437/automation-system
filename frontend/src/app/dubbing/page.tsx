"use client";

import {
  Activity,
  AlertTriangle,
  AudioWaveform,
  CheckCircle2,
  Clock3,
  Cpu,
  FileVideo,
  Languages,
  Library,
  Mic2,
  Music2,
  Play,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  Upload,
  WifiOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

type DubbingDoctorVerdict = "ready" | "degraded" | "blocked";
interface DoctorRow {
  name: string;
  status: boolean;
  detail: string;
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

interface DubbingDoctorReport {
  ok: boolean;
  verdict: DubbingDoctorVerdict;
  missing: string[];
  rows?: DoctorRow[];
  has_ffmpeg?: boolean;
  has_yt_dlp?: boolean;
  has_transcribe?: boolean;
  has_translate?: boolean;
  has_voice?: boolean;
  ok_count?: number;
  total?: number;
  checked_at?: string;
  cached?: boolean;
  error?: string;
}

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
type SourceMode = "upload" | "local" | "url";
type ReferenceAudioSource = "upload" | "builtin" | "none";

interface DubbingDraft {
  id: string;
  name: string;
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
  referenceAudioSource: ReferenceAudioSource;
  referenceAudioPath: string;
  createdAt: string;
}

const BUILTIN_SAMPLES: { id: string; label: string; path: string }[] = [
  { id: "urdu-male", label: "Urdu Male", path: "C:\\dubbing-samples\\urdu-male.wav" },
  { id: "urdu-female", label: "Urdu Female", path: "C:\\dubbing-samples\\urdu-female.wav" },
  { id: "hindi-male", label: "Hindi Male", path: "C:\\dubbing-samples\\hindi-male.wav" },
  { id: "hindi-female", label: "Hindi Female", path: "C:\\dubbing-samples\\hindi-female.wav" },
];

const STORAGE_KEY = "automation.dubbing.drafts.v1";

const stages = [
  { label: "Extract", detail: "FFmpeg audio and frames", icon: FileVideo },
  { label: "Separate", detail: "Demucs vocal bed", icon: Music2 },
  { label: "Transcribe", detail: "WhisperX timestamps", icon: AudioWaveform },
  { label: "Speakers", detail: "pyannote diarization", icon: Mic2 },
  { label: "Translate", detail: "Target language dialogue", icon: Languages },
  { label: "Clone", detail: "Speaker voice match", icon: Library },
  { label: "Align", detail: "Timing and speed fit", icon: SlidersHorizontal },
  { label: "Mix", detail: "Final dubbed video", icon: CheckCircle2 },
];

const dependencyHealthInfo = [
  {
    dep: "FFmpeg",
    stage: "Extract, Align, Mix",
    fallback: "Required — pipeline cannot run without FFmpeg",
    critical: true,
    checkRows: (rows: DoctorRow[]) => {
      const ffmpeg = rows.find(r => r.name === 'ffmpeg')?.status ?? false;
      const ffprobe = rows.find(r => r.name === 'ffprobe')?.status ?? false;
      return ffmpeg && ffprobe;
    },
  },
  {
    dep: "Demucs",
    stage: "Separate",
    fallback: "Copies audio as-is — no vocal separation",
    critical: false,
    checkRows: (rows: DoctorRow[]) => rows.find(r => r.name === 'demucs')?.status ?? false,
  },
  {
    dep: "WhisperX / Whisper",
    stage: "Transcribe",
    fallback: "Placeholder transcription with no timestamps",
    critical: false,
    checkRows: (rows: DoctorRow[]) => {
      return (rows.find(r => r.name === 'whisperx')?.status ?? false)
          || (rows.find(r => r.name === 'whisper')?.status ?? false);
    },
  },
  {
    dep: "pyannote.audio",
    stage: "Speakers",
    fallback: "Single speaker assumed — no diarization",
    critical: false,
    checkRows: (rows: DoctorRow[]) => rows.find(r => r.name === 'pyannote.audio')?.status ?? false,
  },
  {
    dep: "LLM API key / NLLB",
    stage: "Translate",
    fallback: "Identity copy — source text used as-is",
    critical: false,
    checkRows: (rows: DoctorRow[]) => {
      return (rows.find(r => r.name === 'transformers')?.status ?? false)
          || (rows.find(r => r.name === 'env:OPENAI_API_KEY')?.status ?? false)
          || (rows.find(r => r.name === 'env:OLLAMA_HOST')?.status ?? false);
    },
  },
  {
    dep: "VoxCPM2 / XTTS / edge-tts",
    stage: "Clone",
    fallback: "Edge TTS stock voices — no voice cloning",
    critical: false,
    checkRows: (rows: DoctorRow[]) => {
      return (rows.find(r => r.name === 'edge_tts')?.status ?? false)
          || (rows.find(r => r.name === 'TTS')?.status ?? false)
          || (rows.find(r => r.name === 'voxcpm')?.status ?? false);
    },
  },
  {
    dep: "PyTorch",
    stage: "Separate, Transcribe, Speakers, Clone",
    fallback: "Multiple stages degraded — ML unavailable",
    critical: false,
    checkRows: (rows: DoctorRow[]) => rows.find(r => r.name === 'torch')?.status ?? false,
  },
];

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

const voiceEngines: Record<VoiceEngine, { label: string; note: string }> = {
  voxcpm2: {
    label: "VoxCPM2",
    note: "Primary cloning path. Best tested for Hindi first, Urdu needs sample validation.",
  },
  xtts: {
    label: "XTTS v2 fallback",
    note: "Useful fallback for Hindi and stock cloned voices.",
  },
  edge: {
    label: "Edge TTS fallback",
    note: "Fast stock Urdu/Hindi voice when cloning fails.",
  },
};

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

const AI_PROVIDERS: Record<string, { label: string; apiKeyField: keyof AISettingsData }> = {
  openai: { label: "OpenAI", apiKeyField: "openai_key" },
  gemini: { label: "Google Gemini", apiKeyField: "gemini_key" },
  grok: { label: "xAI Grok", apiKeyField: "grok_key" },
  cohere: { label: "Cohere", apiKeyField: "cohere_key" },
  openrouter: { label: "OpenRouter", apiKeyField: "openrouter_key" },
  groq: { label: "Groq", apiKeyField: "groq_key" },
};

function loadDrafts(): DubbingDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDrafts(drafts: DubbingDraft[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts.slice(0, 8)));
}

export default function DubbingPage() {
  const router = useRouter();
  const [name, setName] = useState("English to Urdu short");
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
  const [drafts, setDrafts] = useState<DubbingDraft[]>([]);
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [doctorReport, setDoctorReport] = useState<DubbingDoctorReport | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState("openai");
  const [availableAiProviders, setAvailableAiProviders] = useState<string[]>([]);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(true);
  const [referenceAudioSource, setReferenceAudioSource] = useState<ReferenceAudioSource>("none");
  const [referenceAudioPath, setReferenceAudioPath] = useState("");

  // Live dubbing-engine dependency check against local-runner /api/dubbing/doctor
  const refreshDoctor = useCallback(async (force = false) => {
    setDoctorLoading(true);
    try {
      const url = `http://127.0.0.1:3000/api/dubbing/doctor${force ? "?refresh=1" : ""}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = await response.json();
      if (payload?.success && payload.data) {
        setDoctorReport(payload.data as DubbingDoctorReport);
      } else {
        setDoctorReport({
          ok: false, verdict: "blocked", missing: ["Local runner did not return doctor data"], error: payload?.error || "Unknown",
        });
      }
    } catch (err) {
      setDoctorReport({
        ok: false, verdict: "blocked", missing: ["Local runner is not reachable"], error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDoctorLoading(false);
    }
  }, []);

  // Fetch AI settings to determine available providers
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
          // Default to the user's preferred default_provider, or first available, or 'openai'
          const defaultP = settings.default_provider || available[0] || "openai";
          if (available.includes(defaultP)) {
            setAiProvider(defaultP);
          } else if (available.length > 0) {
            setAiProvider(available[0]);
          } else {
            setAiProvider("openai");
          }
        } else {
          setAiProvider("openai");
        }
      } catch {
        // Silently fall back to openai if settings API is unreachable
        setAiProvider("openai");
      } finally {
        setAiSettingsLoading(false);
      }
    }
    void loadAiSettings();
  }, []);

  useEffect(() => {
    setDrafts(loadDrafts());
    void refreshDoctor(false);
    const interval = window.setInterval(() => { void refreshDoctor(false); }, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshDoctor]);

  const sourceReady = sourceMode === "upload" ? Boolean(sourceValue) : sourceValue.trim().length > 5;
  const readyChecks = [
    { label: "Video source", ok: sourceReady },
    { label: "Target language", ok: Boolean(targetLanguage) },
    { label: "Voice engine", ok: Boolean(voiceEngine) },
    { label: "Timing limit", ok: speedLimit >= 1.05 && speedLimit <= 1.35 },
  ];
  const isReady = readyChecks.every((check) => check.ok);

  const manifest = useMemo(() => ({
    workflow: "dubbing",
    type: "video",
    name,
    video_source: sourceMode === "url" ? "direct" : sourceMode === "local" ? "local_file" : "uploaded_file",
    source_mode: sourceMode,
    source_value: sourceValue || null,
    dubbing: {
      source_language: "en",
      target_language: targetLanguage,
      translation_engine: translationEngine,
      voice_engine: voiceEngine,
      voice_mode: voiceEngine === "voxcpm2" ? voiceMode : undefined,
      voice_style: voiceEngine === "voxcpm2" ? voiceStyle : undefined,
      voice_reference_seconds: voiceReferenceSeconds,
      reference_audio_source: referenceAudioSource,
      reference_audio_path: referenceAudioPath || undefined,
      ai_provider: aiProvider,
      diarization_enabled: diarization,
      mix_mode: mixMode,
      preserve_background: preserveBackground,
      max_tempo: speedLimit,
      lip_sync_enabled: lipSync,
      stages: stages.map((stage) => stage.label.toLowerCase()),
    },
  }), [
    name,
    sourceMode,
    sourceValue,
    targetLanguage,
    translationEngine,
    aiProvider,
    voiceEngine,
    voiceMode,
    voiceStyle,
    voiceReferenceSeconds,
    referenceAudioSource,
    referenceAudioPath,
    diarization,
    mixMode,
    preserveBackground,
    speedLimit,
    lipSync,
  ]);

  const handleSaveDraft = () => {
    const nextDraft: DubbingDraft = {
      id: `${Date.now()}`,
      name,
      sourceMode,
      sourceValue,
      targetLanguage,
      translationEngine,
      voiceEngine,
      voiceMode,
      voiceStyle,
      mixMode,
      preserveBackground,
      diarization,
      lipSync,
      speedLimit,
      voiceReferenceSeconds,
      referenceAudioSource,
      referenceAudioPath,
      createdAt: new Date().toISOString(),
    };
    const next = [nextDraft, ...drafts.filter((draft) => draft.name !== name)];
    setDrafts(next);
    saveDrafts(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const handleCreateAutomation = async (runNow = false) => {
    if (!isReady || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await api.post<{ id: number }>("/api/automations", {
        name,
        type: "dubbing",
        status: runNow ? "active" : "paused",
        config: JSON.stringify(manifest),
        schedule: null,
      });
      if (!response.success) {
        setCreateError(response.error || "Failed to create dubbing automation");
        return;
      }

      const newAutoId = response.data?.id;
      saveDrafts([{
        id: `${Date.now()}`,
        name,
        sourceMode,
        sourceValue,
        targetLanguage,
        translationEngine,
        voiceEngine,
        voiceMode,
        voiceStyle,
        referenceAudioSource,
        referenceAudioPath,
        mixMode,
        preserveBackground,
        diarization,
        lipSync,
        speedLimit,
        voiceReferenceSeconds,
        createdAt: new Date().toISOString(),
      }, ...drafts]);

      if (runNow && newAutoId) {
        // Trigger the run immediately
        try {
          await api.post(`/api/automations/${newAutoId}/run`, {});
        } catch (runError) {
          console.warn("Auto-run triggered but run API call had an issue", runError);
        }
      }

      router.push("/automations");
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Failed to create dubbing automation");
    } finally {
      setCreating(false);
    }
  };

  const loadDraft = (draft: DubbingDraft) => {
    setName(draft.name);
    setSourceMode(draft.sourceMode);
    setSourceValue(draft.sourceValue);
    setTargetLanguage(draft.targetLanguage);
    setTranslationEngine(draft.translationEngine);
    setVoiceEngine(draft.voiceEngine);
    setVoiceMode(draft.voiceMode);
    setVoiceStyle(draft.voiceStyle);
    setMixMode(draft.mixMode);
    setPreserveBackground(draft.preserveBackground);
    setDiarization(draft.diarization);
    setLipSync(draft.lipSync);
    setSpeedLimit(draft.speedLimit);
    setVoiceReferenceSeconds(draft.voiceReferenceSeconds);
    setReferenceAudioSource(draft.referenceAudioSource || "none");
    setReferenceAudioPath(draft.referenceAudioPath || "");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(20,184,166,0.14)] text-teal-300">
              <Languages className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-3xl font-bold">Video Dubbing</h2>
              <p className="mt-1 text-[#a1a1aa]">English to Urdu/Hindi voice-clone workflow</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleSaveDraft} className="glass-button flex items-center gap-2">
            <Save className="h-4 w-4" />
            {saved ? "Saved" : "Save Draft"}
          </button>
          <button
            onClick={() => handleCreateAutomation(false)}
            disabled={!isReady}
            className={`glass-button flex items-center gap-2 ${!isReady ? "cursor-not-allowed opacity-50" : ""}`}
            title={isReady ? "Create paused automation" : "Complete required fields first"}
          >
            <Save className="h-4 w-4" />
            {creating ? "Creating..." : "Save Only"}
          </button>
          <button
            onClick={() => handleCreateAutomation(true)}
            disabled={!isReady}
            className={`glass-button-primary flex items-center gap-2 ${!isReady ? "cursor-not-allowed opacity-50 hover:translate-y-0 hover:shadow-none" : ""}`}
            title={isReady ? "Create active automation and run immediately" : "Complete required fields first"}
          >
            <Play className="h-4 w-4" />
            {creating ? "Creating..." : "Create & Run Now"}
          </button>
        </div>
      </div>

      {createError && (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
          {createError}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="space-y-6">
          <section className="glass-card no-hover p-6">
            <div className="mb-5 flex items-center gap-2">
              <Upload className="h-5 w-5 text-teal-300" />
              <h3 className="text-lg font-semibold">Source</h3>
            </div>
            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <div className="space-y-2">
                {(["upload", "local", "url"] as SourceMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setSourceMode(mode);
                      setSourceValue("");
                    }}
                    className={`w-full rounded-xl px-4 py-3 text-left text-sm capitalize transition-colors ${
                      sourceMode === mode
                        ? "bg-[rgba(20,184,166,0.16)] text-teal-200 border border-[rgba(20,184,166,0.28)]"
                        : "bg-[rgba(255,255,255,0.03)] text-[#d4d4d8] border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.07)]"
                    }`}
                  >
                    {mode === "upload" ? "Video file" : mode === "local" ? "Local path" : "Video URL"}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
                {sourceMode === "upload" ? (
                  <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.06)] p-6 text-center">
                    <FileVideo className="mb-3 h-9 w-9 text-teal-300" />
                    <span className="text-sm font-medium">{sourceValue || "Choose MP4/MOV file"}</span>
                    <span className="mt-1 text-xs text-[#a1a1aa]">File is selected locally for the runner workflow</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(event) => setSourceValue(event.target.files?.[0]?.name || "")}
                    />
                  </label>
                ) : (
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      {sourceMode === "local" ? "Runner PC video path" : "Public video URL"}
                    </label>
                    <input
                      value={sourceValue}
                      onChange={(event) => setSourceValue(event.target.value)}
                      className="glass-input"
                      placeholder={sourceMode === "local" ? "C:\\Videos\\source.mp4" : "https://..."}
                    />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="glass-card no-hover p-6">
              <div className="mb-5 flex items-center gap-2">
                <Languages className="h-5 w-5 text-cyan-300" />
                <h3 className="text-lg font-semibold">Language</h3>
              </div>
              {/* Language category selector */}
              <div className="space-y-4">
                {LANG_CATEGORIES.map((cat) => {
                  const langsInCat = Object.entries(LANGUAGES)
                    .filter(([, info]) => info.category === cat.id);
                  if (langsInCat.length === 0) return null;
                  const expanded = targetLanguage === cat.id ? null : langsInCat.find(([code]) => code === targetLanguage) ? cat.id : null;
                  return (
                    <div key={cat.id}>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#71717a]">
                        {cat.label}
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {langsInCat.map(([code, info]) => (
                          <button
                            key={code}
                            onClick={() => setTargetLanguage(code as TargetLanguage)}
                            className={`rounded-lg border px-2.5 py-2 text-left transition-all ${
                              targetLanguage === code
                                ? "border-cyan-400/35 bg-cyan-400/12 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.08)]"
                                : "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] text-[#d4d4d8] hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
                            }`}
                          >
                            <span className="block text-sm font-semibold leading-tight">{info.label}</span>
                            <span className="mt-0.5 block text-[10px] text-[#71717a]">{info.script}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium">Translation engine</label>
                <select
                  value={translationEngine}
                  onChange={(event) => setTranslationEngine(event.target.value as TranslationEngine)}
                  className="glass-select"
                >
                  <option value="llm">LLM quality mode</option>
                  <option value="nllb">NLLB offline fallback</option>
                </select>
              </div>

              {translationEngine === "llm" && (
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium">
                    AI Provider
                    {aiSettingsLoading && <span className="ml-2 text-xs text-[#a1a1aa]">Loading...</span>}
                  </label>
                  <select
                    value={aiProvider}
                    onChange={(event) => setAiProvider(event.target.value)}
                    className="glass-select"
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
                  {availableAiProviders.length === 0 && !aiSettingsLoading && (
                    <p className="mt-2 text-xs text-amber-300">
                      No AI API keys configured. Set one in{' '}
                      <button
                        onClick={() => router.push("/settings")}
                        className="underline hover:text-amber-200"
                      >
                        Settings
                      </button>.
                    </p>
                  )}
                  {availableAiProviders.length > 0 && (
                    <p className="mt-2 text-xs text-[#a1a1aa]">
                      Uses the API key saved in Settings for{' '}
                      <span className="font-semibold text-[#d4d4d8]">
                        {AI_PROVIDERS[aiProvider]?.label || aiProvider}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="glass-card no-hover p-6">
              <div className="mb-5 flex items-center gap-2">
                <Mic2 className="h-5 w-5 text-emerald-300" />
                <h3 className="text-lg font-semibold">Voice</h3>
              </div>
              <select
                value={voiceEngine}
                onChange={(event) => setVoiceEngine(event.target.value as VoiceEngine)}
                className="glass-select"
              >
                {Object.entries(voiceEngines).map(([value, item]) => (
                  <option key={value} value={value}>{item.label}</option>
                ))}
              </select>
              <p className="mt-3 text-sm text-[#a1a1aa]">{voiceEngines[voiceEngine].note}</p>

              {/* Voice mode selector (only for VoxCPM2) */}
              {voiceEngine === "voxcpm2" && (
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium">Clone mode</label>
                  <div className="space-y-2">
                    {(["ultimate", "controllable", "design"] as VoiceMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setVoiceMode(mode)}
                        className={`w-full rounded-xl px-4 py-3 text-left text-sm transition-colors ${
                          voiceMode === mode
                            ? "bg-emerald-400/15 text-emerald-200 border border-emerald-400/25"
                            : "bg-[rgba(255,255,255,0.03)] text-[#a1a1aa] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]"
                        }`}
                      >
                        <span className="font-semibold">{voiceModes[mode].label}</span>
                        <span className="block mt-0.5 text-xs opacity-70">{voiceModes[mode].desc}</span>
                      </button>
                    ))}
                  </div>

                  {/* Style presets (for controllable/design modes) */}
                  {/* Voice Design: custom textarea for full voice description */}
                  {voiceMode === "design" && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium">
                          🎨 Describe the voice you want
                        </label>
                        <textarea
                          value={voiceStyle}
                          onChange={(e) => setVoiceStyle(e.target.value)}
                          placeholder="e.g. A calm middle-aged man with a deep, authoritative tone, speaking slowly and clearly in Urdu with a slight regional accent"
                          className="glass-input w-full resize-none min-h-[80px] text-sm leading-relaxed"
                          rows={3}
                        />
                        {voiceStyle && (
                          <p className="mt-1 text-[11px] text-indigo-300/70">
                            ✨ Zero-shot — VoxCPM2 will create a voice matching this description
                          </p>
                        )}
                      </div>
                      {/* Quick preset picker as fallback */}
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-[#a1a1aa]">
                          Or pick a quick preset
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {voiceStylePresets.filter(p => p.value).map((preset) => (
                            <button
                              key={preset.value}
                              onClick={() => setVoiceStyle(preset.value)}
                              className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
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
                      <label className="mb-2 block text-sm font-medium">Voice style hint</label>
                      <select
                        value={voiceStyle}
                        onChange={(e) => setVoiceStyle(e.target.value)}
                        className="glass-select"
                      >
                        {voiceStylePresets.map((preset) => (
                          <option key={preset.value} value={preset.value}>{preset.label}</option>
                        ))}
                      </select>
                      {voiceStyle && (
                        <p className="mt-1.5 text-xs text-emerald-300/60">
                          Style: <span className="italic">"{voiceStyle}"</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Reference audio source selector (for ultimate/controllable) */}
              {voiceEngine === "voxcpm2" && voiceMode !== "design" && (
                <div className="mt-5 p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
                  <label className="mb-2.5 block text-sm font-medium">Reference Audio Source</label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[{ v: "none", l: "None" }, { v: "upload", l: "Upload" }, { v: "builtin", l: "Built-in" }].map((opt) => (
                      <button key={opt.v}
                        onClick={() => { setReferenceAudioSource(opt.v as ReferenceAudioSource); if (opt.v !== "builtin") setReferenceAudioPath(""); }}
                        className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
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
                      <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-[rgba(20,184,166,0.3)] bg-[rgba(20,184,166,0.05)] p-3 text-center">
                        <span className="text-xs font-medium">{referenceAudioPath || "Choose .wav/.mp3"}</span>
                        <input type="file" accept="audio/*" className="hidden"
                          onChange={(e) => setReferenceAudioPath(e.target.files?.[0]?.name || "")} />
                      </label>
                      <p className="text-[11px] text-[#71717a]">Upload a clean voice sample (6-45s)</p>
                    </div>
                  )}

                  {referenceAudioSource === "builtin" && (
                    <div className="grid grid-cols-2 gap-2">
                      {BUILTIN_SAMPLES.map((sample) => (
                        <button key={sample.id}
                          onClick={() => setReferenceAudioPath(referenceAudioPath === sample.path ? "" : sample.path)}
                          className={`rounded-lg px-3 py-2 text-xs text-left transition-colors ${
                            referenceAudioPath === sample.path
                              ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/30"
                              : "bg-[rgba(255,255,255,0.03)] text-[#a1a1aa] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]"
                          }`}
                        >
                          <span className="block font-semibold">{sample.label}</span>
                          <span className="block mt-0.5 text-[10px] opacity-60">Built-in</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Reference seconds</span>
                  <input
                    type="number"
                    min={6}
                    max={45}
                    value={voiceReferenceSeconds}
                    onChange={(event) => setVoiceReferenceSeconds(Number(event.target.value))}
                    className="glass-input"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Max tempo</span>
                  <input
                    type="number"
                    min={1.05}
                    max={1.35}
                    step={0.05}
                    value={speedLimit}
                    onChange={(event) => setSpeedLimit(Number(event.target.value))}
                    className="glass-input"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="glass-card no-hover p-6">
            <div className="mb-5 flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-amber-300" />
              <h3 className="text-lg font-semibold">Audio and Timing</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                {
                  checked: preserveBackground,
                  set: setPreserveBackground,
                  title: "Preserve background bed",
                  detail: "Keep music and ambience under the dub",
                },
                {
                  checked: diarization,
                  set: setDiarization,
                  title: "Detect speakers",
                  detail: "Clone and route by speaker segment",
                },
                {
                  checked: lipSync,
                  set: setLipSync,
                  title: "Lip-sync pass",
                  detail: "Optional MuseTalk/Wav2Lip stage later",
                },
              ].map((item) => (
                <label
                  key={item.title}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) => item.set(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-[#14b8a6]"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="mt-1 block text-xs text-[#a1a1aa]">{item.detail}</span>
                  </span>
                </label>
              ))}
              <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
                <span className="mb-2 block text-sm font-semibold">Mix mode</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMixMode("bed")}
                    className={`rounded-lg px-3 py-2 text-sm ${mixMode === "bed" ? "bg-amber-400/15 text-amber-200" : "bg-white/5 text-[#d4d4d8]"}`}
                  >
                    Music bed
                  </button>
                  <button
                    onClick={() => setMixMode("replace")}
                    className={`rounded-lg px-3 py-2 text-sm ${mixMode === "replace" ? "bg-amber-400/15 text-amber-200" : "bg-white/5 text-[#d4d4d8]"}`}
                  >
                    Replace
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="glass-card no-hover p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-indigo-300" />
                <h3 className="text-lg font-semibold">Pipeline</h3>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isReady ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"}`}>
                {isReady ? "Ready" : "Draft"}
              </span>
            </div>
            <div className="space-y-3">
              {stages.map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <div key={stage.label} className="flex items-center gap-3 rounded-xl bg-[rgba(255,255,255,0.03)] p-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(99,102,241,0.14)] text-indigo-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{stage.label}</p>
                        <span className="text-xs text-[#71717a]">{String(index + 1).padStart(2, "0")}</span>
                      </div>
                      <p className="truncate text-xs text-[#a1a1aa]">{stage.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass-card no-hover p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-orange-300" />
                <h3 className="text-lg font-semibold">Dependency Health</h3>
              </div>
              <div className="flex items-center gap-2">
                {doctorLoading && <span className="text-[10px] text-[#a1a1aa]">Scanning...</span>}
                <button
                  onClick={() => void refreshDoctor(true)}
                  className="glass-button text-xs py-1 px-2"
                  title="Re-check engine availability"
                  disabled={doctorLoading}
                >
                  <RefreshCw className={`h-3 w-3 ${doctorLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Live verdict badge */}
            {doctorReport && (
              <div className={`mb-4 rounded-xl border p-3 text-xs ${
                doctorReport.verdict === 'ready'
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                  : doctorReport.verdict === 'degraded'
                  ? 'border-amber-500/25 bg-amber-500/10 text-amber-200'
                  : 'border-red-500/25 bg-red-500/10 text-red-200'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {doctorReport.verdict === 'ready' ? '✓ All systems ready'
                      : doctorReport.verdict === 'degraded' ? '⚠ Running in degraded mode'
                      : '✗ Engine setup required'}
                  </span>
                  <span className="text-[10px] opacity-70">
                    {doctorReport.ok_count ?? 0}/{doctorReport.total ?? 0} checks passed
                  </span>
                </div>
                {doctorReport.missing && doctorReport.missing.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {doctorReport.missing.map((item) => (
                      <div key={item} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
                {doctorReport.error && !doctorReport.missing?.length && (
                  <p className="mt-1 text-[10px] opacity-60">{doctorReport.error}</p>
                )}
                {doctorReport.checked_at && (
                  <p className="mt-1.5 text-[10px] opacity-40">
                    Checked: {new Date(doctorReport.checked_at).toLocaleTimeString()}
                    {doctorReport.cached ? ' (cached)' : ''}
                  </p>
                )}
              </div>
            )}

            {!doctorReport && !doctorLoading && (
              <div className="mb-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="flex items-center gap-2 text-xs text-[#a1a1aa]">
                  <WifiOff className="h-3.5 w-3.5" />
                  <span>Local runner not reachable — run the local dashboard to see live health</span>
                </div>
              </div>
            )}

            <p className="mb-4 text-xs text-[#a1a1aa]">
              These packages are auto-detected by the runner. Missing dependencies trigger graceful fallbacks —
              the pipeline still completes, but output quality may be reduced.
            </p>
            <div className="space-y-2">
              {dependencyHealthInfo.map((item) => {
                const installed = doctorReport?.rows && doctorReport.rows.length > 0
                  ? item.checkRows(doctorReport.rows)
                  : null;
                return (
                  <div
                    key={item.dep}
                    className={`rounded-xl border p-3 ${
                      installed === true
                        ? 'border-emerald-500/15 bg-emerald-500/05'
                        : installed === false
                        ? 'border-red-500/10 bg-red-500/05'
                        : 'border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {installed === true && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        )}
                        {installed === false && (
                          <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-red-400/30" />
                        )}
                        <span className="text-sm font-semibold text-[#d4d4d8]">{item.dep}</span>
                      </div>
                      {installed === true ? (
                        <span className="rounded-full bg-emerald-400/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 whitespace-nowrap">
                          Installed
                        </span>
                      ) : installed === false ? (
                        <span className="rounded-full bg-red-400/12 px-2 py-0.5 text-[10px] font-semibold text-red-300 whitespace-nowrap">
                          Missing
                        </span>
                      ) : item.critical ? (
                        <span className="rounded-full bg-red-400/12 px-2 py-0.5 text-[10px] font-semibold text-red-300 whitespace-nowrap">
                          Required
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-400/12 px-2 py-0.5 text-[10px] font-semibold text-amber-300 whitespace-nowrap">
                          Optional
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#a1a1aa]">
                      <span>Stage: <span className="text-[#d4d4d8]">{item.stage}</span></span>
                    </div>
                    <p className="mt-1 text-[11px] italic text-[#71717a]">
                      {item.fallback}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-xl border border-[rgba(99,102,241,0.15)] bg-[rgba(99,102,241,0.06)] p-3">
              <p className="text-xs text-indigo-200">
                Run <code className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-indigo-100">node doctor.js</code>{' '}
                on the runner to check installed packages. Or use the{' '}
                <code className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-indigo-100">install-dubbing-deps.ps1</code>{' '}
                script for the minimal viable setup.
              </p>
            </div>
          </section>

          <section className="glass-card no-hover p-6">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              <h3 className="text-lg font-semibold">Readiness</h3>
            </div>
            <div className="space-y-2">
              {readyChecks.map((check) => (
                <div key={check.label} className="flex items-center justify-between rounded-lg bg-[rgba(255,255,255,0.03)] px-3 py-2">
                  <span className="text-sm text-[#d4d4d8]">{check.label}</span>
                  {check.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Clock3 className="h-4 w-4 text-amber-300" />}
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card no-hover p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Manifest</h3>
              <RefreshCw className="h-4 w-4 text-[#a1a1aa]" />
            </div>
            <pre className="max-h-72 overflow-auto rounded-xl bg-black/35 p-4 text-xs leading-relaxed text-[#d4d4d8] scrollbar-thin">
              {JSON.stringify(manifest, null, 2)}
            </pre>
          </section>

          <section className="glass-card no-hover p-6">
            <div className="mb-4 flex items-center gap-2">
              <Library className="h-5 w-5 text-pink-300" />
              <h3 className="text-lg font-semibold">Drafts</h3>
            </div>
            {drafts.length === 0 ? (
              <p className="rounded-xl bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[#a1a1aa]">No saved dubbing drafts.</p>
            ) : (
              <div className="space-y-2">
                {drafts.map((draft) => (
                  <button
                    key={draft.id}
                    onClick={() => loadDraft(draft)}
                    className="w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-3 text-left hover:bg-[rgba(255,255,255,0.07)]"
                  >
                    <span className="block text-sm font-semibold">{draft.name}</span>
                    <span className="mt-1 block text-xs text-[#a1a1aa]">
                      {draft.targetLanguage.toUpperCase()} - {voiceEngines[draft.voiceEngine].label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
