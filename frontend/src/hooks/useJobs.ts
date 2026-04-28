"use client";
import { useCallback } from "react";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";
import { useFetch } from "./useFetch";

interface JobLogs {
  run_status: string;
  run_conclusion: string | null;
  run_url: string;
  steps: Array<{ name: string; status: string; conclusion: string | null }>;
}

interface JobArtifact {
  name: string;
  archive_download_url: string;
  size_in_bytes: number;
}

interface UseJobsReturn {
  jobs: Job[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  retry: (id: number) => Promise<boolean>;
  getJobLogs: (id: number) => Promise<JobLogs | null>;
}

export function useJobs(limit: number = 50): UseJobsReturn {
  const { data, loading, error, refetch } = useFetch<Job[]>(`/api/jobs?limit=${limit}`);

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
      const response = await api.get<JobLogs>(`/api/jobs/${id}/logs`);
      return response.success && response.data ? response.data : null;
    } catch {
      return null;
    }
  }, []);

  return { jobs: data || [], loading, error, refetch, retry, getJobLogs };
}

interface UseJobArtifactsReturn {
  artifacts: JobArtifact[];
  loading: boolean;
  error: string | null;
  fetchArtifacts: (jobId: number) => Promise<void>;
}

export function useJobArtifacts(): UseJobArtifactsReturn {
  const { data, loading, error, refetch } = useFetch<JobArtifact[]>({
    url: "/api/jobs/0/artifacts",
    immediate: false,
  });

  const fetchArtifacts = useCallback(async (jobId: number) => {
    await refetch(`/api/jobs/${jobId}/artifacts`);
  }, [refetch]);

  return { artifacts: data || [], loading, error, fetchArtifacts };
}
