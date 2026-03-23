"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { PostformeSettings, GithubSettings, VideoSourceSettings, AISettings, SocialAccount } from "@/lib/types";

interface UseSettingsReturn {
  postforme: PostformeSettings | null;
  github: GithubSettings | null;
  videoSources: VideoSourceSettings | null;
  ai: AISettings | null;
  loading: boolean;
  error: string | null;
  savePostforme: (data: Partial<PostformeSettings>) => Promise<boolean>;
  saveGithub: (data: Partial<GithubSettings>) => Promise<boolean>;
  saveVideoSources: (data: Partial<VideoSourceSettings>) => Promise<boolean>;
  saveAI: (data: Partial<AISettings>) => Promise<boolean>;
  testPostforme: () => Promise<{ success: boolean; message: string }>;
  syncPostformeAccounts: () => Promise<SocialAccount[]>;
  testAIProvider: (provider: string, apiKey: string) => Promise<{ success: boolean; message: string }>;
  refetch: () => Promise<void>;
}

export function useSettings(): UseSettingsReturn {
  const [postforme, setPostforme] = useState<PostformeSettings | null>(null);
  const [github, setGithub] = useState<GithubSettings | null>(null);
  const [videoSources, setVideoSources] = useState<VideoSourceSettings | null>(null);
  const [ai, setAI] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pfRes, ghRes, vsRes, aiRes] = await Promise.all([
        api.get<PostformeSettings>("/api/settings/postforme"),
        api.get<GithubSettings>("/api/settings/github"),
        api.get<VideoSourceSettings>("/api/settings/video-sources"),
        api.get<AISettings>("/api/settings/ai"),
      ]);

      if (pfRes.success) setPostforme(pfRes.data || null);
      if (ghRes.success) setGithub(ghRes.data || null);
      if (vsRes.success) setVideoSources(vsRes.data || null);
      if (aiRes.success) setAI(aiRes.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const savePostforme = useCallback(async (data: Partial<PostformeSettings>): Promise<boolean> => {
    try {
      const response = await api.post("/api/settings/postforme", data);
      if (response.success) {
        await refetch();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [refetch]);

  const saveGithub = useCallback(async (data: Partial<GithubSettings>): Promise<boolean> => {
    try {
      const response = await api.post("/api/settings/github", data);
      if (response.success) {
        await refetch();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [refetch]);

  const saveVideoSources = useCallback(async (data: Partial<VideoSourceSettings>): Promise<boolean> => {
    try {
      const response = await api.post("/api/settings/video-sources", data);
      if (response.success) {
        await refetch();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [refetch]);

  const saveAI = useCallback(async (data: Partial<AISettings>): Promise<boolean> => {
    try {
      const response = await api.post("/api/settings/ai", data);
      if (response.success) {
        await refetch();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [refetch]);

  const testPostforme = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    if (!postforme?.api_key) return { success: false, message: "API key is required" };
    try {
      const response = await api.post<{ message: string }>("/api/settings/postforme/test", {
        api_key: postforme.api_key,
      });
      return {
        success: response.success,
        message: response.success ? (response.data?.message || "Connected!") : (response.error || "Connection failed"),
      };
    } catch {
      return { success: false, message: "Connection failed" };
    }
  }, [postforme]);

  const syncPostformeAccounts = useCallback(async (): Promise<SocialAccount[]> => {
    if (!postforme?.api_key) return [];
    try {
      const response = await api.post<SocialAccount[]>("/api/settings/postforme/sync", {
        api_key: postforme.api_key,
      });
      return response.success ? (response.data || []) : [];
    } catch {
      return [];
    }
  }, [postforme]);

  const testAIProvider = useCallback(async (provider: string, apiKey: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await api.post<{ message: string }>("/api/settings/ai/test", {
        provider,
        api_key: apiKey,
      });
      return {
        success: response.success,
        message: response.success ? (response.data?.message || "Connected!") : (response.error || "Test failed"),
      };
    } catch {
      return { success: false, message: "Test failed" };
    }
  }, []);

  return {
    postforme, github, videoSources, ai, loading, error,
    savePostforme, saveGithub, saveVideoSources, saveAI,
    testPostforme, syncPostformeAccounts, testAIProvider, refetch,
  };
}
