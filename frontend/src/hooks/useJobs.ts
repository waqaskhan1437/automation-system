"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";

interface UseJobsReturn {
  jobs: Job[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  retry: (id: number) => Promise<boolean>;
  getJobLogs: (id: number) => Promise<{
    run_status: string;
    run_conclusion: string | null;
    run_url: string;
    steps: Array<{ name: string; status: string; conclusion: string | null }>;
  } | null>;
}

export function useJobs(limit: number = 50): UseJobsReturn {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<Job[]>(`/api/jobs?limit=${limit}`);
      if (response.success) {
        setJobs(response.data || []);
      } else {
        setError(response.error || "Failed to load jobs");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const retry = useCallback(async (id: number): Promise<boolean> => {
    try {
      const response = await api.post(`/api/jobs/${id}/retry`);
      if (response.success) {
        await refetch();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [refetch]);

  const getJobLogs = useCallback(async (id: number) => {
    try {
      const response = await api.get<{
        run_status: string;
        run_conclusion: string | null;
        run_url: string;
        steps: Array<{ name: string; status: string; conclusion: string | null }>;
      }>(`/api/jobs/${id}/logs`);
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  return { jobs, loading, error, refetch, retry, getJobLogs };
}

interface UseJobArtifactsReturn {
  artifacts: Array<{
    name: string;
    archive_download_url: string;
    size_in_bytes: number;
  }>;
  loading: boolean;
  error: string | null;
  fetchArtifacts: (jobId: number) => Promise<void>;
}

export function useJobArtifacts(): UseJobArtifactsReturn {
  const [artifacts, setArtifacts] = useState<Array<{
    name: string;
    archive_download_url: string;
    size_in_bytes: number;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchArtifacts = useCallback(async (jobId: number) => {
    setLoading(true);
    setError(null);
    setArtifacts([]);
    try {
      const response = await api.get<Array<{
        name: string;
        archive_download_url: string;
        size_in_bytes: number;
      }>>(`/api/jobs/${jobId}/artifacts`);
      if (response.success) {
        setArtifacts(response.data || []);
      } else {
        setError(response.error || "Failed to fetch artifacts");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch artifacts");
    } finally {
      setLoading(false);
    }
  }, []);

  return { artifacts, loading, error, fetchArtifacts };
}
