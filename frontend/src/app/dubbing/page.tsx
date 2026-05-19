"use client";

import {
  Activity,
  AlertTriangle,
  AudioWaveform,
  CheckCircle2,
  Clock3,
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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

type TargetLanguage = "ur" | "hi";
type TranslationEngine = "llm" | "nllb";
type VoiceEngine = "voxcpm2" | "xtts" | "edge";
type MixMode = "replace" | "bed";
type SourceMode = "upload" | "local" | "url";

interface DubbingDraft {
  id: string;
  name: string;
  sourceMode: SourceMode;
  sourceValue: string;
  targetLanguage: TargetLanguage;
  translationEngine: TranslationEngine;
  voiceEngine: VoiceEngine;
  mixMode: MixMode;
  preserveBackground: boolean;
  diarization: boolean;
  lipSync: boolean;
  speedLimit: number;
  voiceReferenceSeconds: number;
  createdAt: string;
}

const STORAGE_KEY = "automation.dubbing.drafts.v1";

const stages = [
  { label: "Extract", detail: "FFmpeg audio and frames", icon: FileVideo },
  { label: "Separate", detail: "Demucs vocal bed", icon: Music2 },
  { label: "Transcribe", detail: "WhisperX timestamps", icon: AudioWaveform },
  { label: "Speakers", detail: "pyannote diarization", icon: Mic2 },
  { label: "Translate", detail: "Urdu/Hindi dialogue", icon: Languages },
  { label: "Clone", detail: "Speaker voice match", icon: Library },
  { label: "Align", detail: "Timing and speed fit", icon: SlidersHorizontal },
  { label: "Mix", detail: "Final dubbed video", icon: CheckCircle2 },
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

  useEffect(() => {
    setDrafts(loadDrafts());
  }, []);

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
      voice_reference_seconds: voiceReferenceSeconds,
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
    voiceEngine,
    voiceReferenceSeconds,
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
      mixMode,
      preserveBackground,
      diarization,
      lipSync,
      speedLimit,
      voiceReferenceSeconds,
      createdAt: new Date().toISOString(),
    };
    const next = [nextDraft, ...drafts.filter((draft) => draft.name !== name)];
    setDrafts(next);
    saveDrafts(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const handleCreateAutomation = async () => {
    if (!isReady || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await api.post<{ id: number }>("/api/automations", {
        name,
        type: "video",
        status: "paused",
        config: JSON.stringify(manifest),
        schedule: null,
      });
      if (!response.success) {
        setCreateError(response.error || "Failed to create dubbing automation");
        return;
      }
      saveDrafts([{
        id: `${Date.now()}`,
        name,
        sourceMode,
        sourceValue,
        targetLanguage,
        translationEngine,
        voiceEngine,
        mixMode,
        preserveBackground,
        diarization,
        lipSync,
        speedLimit,
        voiceReferenceSeconds,
        createdAt: new Date().toISOString(),
      }, ...drafts]);
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
    setMixMode(draft.mixMode);
    setPreserveBackground(draft.preserveBackground);
    setDiarization(draft.diarization);
    setLipSync(draft.lipSync);
    setSpeedLimit(draft.speedLimit);
    setVoiceReferenceSeconds(draft.voiceReferenceSeconds);
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
            onClick={handleCreateAutomation}
            disabled={!isReady}
            className={`glass-button-primary flex items-center gap-2 ${!isReady ? "cursor-not-allowed opacity-50 hover:translate-y-0 hover:shadow-none" : ""}`}
            title={isReady ? "Ready for backend integration" : "Complete required fields first"}
          >
            <Play className="h-4 w-4" />
            {creating ? "Creating..." : "Create Automation"}
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
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "ur", label: "Urdu", script: "Nastaliq" },
                  { value: "hi", label: "Hindi", script: "Devanagari" },
                ].map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setTargetLanguage(item.value as TargetLanguage)}
                    className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                      targetLanguage === item.value
                        ? "border-cyan-400/35 bg-cyan-400/12 text-cyan-100"
                        : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#d4d4d8]"
                    }`}
                  >
                    <span className="block text-base font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs text-[#a1a1aa]">{item.script}</span>
                  </button>
                ))}
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
