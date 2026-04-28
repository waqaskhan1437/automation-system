"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { Automation, RunningJob, JobStep } from "@/lib/types";
import { calculateProgress, getStatusColor } from "@/lib/utils";

interface UseAutomationsReturn {
  automations: Automation[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  create: (data: Partial<Automation> & { type: "video" | "image" }) => Promise<Automation | null>;
  update: (id: number, data: Partial<Automation>) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
  run: (id: number) => Promise<{ success: boolean; error?: string }>;
  pause: (id: number) => Promise<boolean>;
  resume: (id: number) => Promise<boolean>;
}

export function useAutomations(): UseAutomationsReturn {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<Automation[]>("/api/automations");
      if (response.success) {
        setAutomations(response.data || []);
      } else {
        setError(response.error || "Failed to load automations");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const create = useCallback(async (data: Partial<Automation> & { type: "video" | "image" }): Promise<Automation | null> => {
    try {
      const response = await api.post<{ id: number }>("/api/automations", {
        name: data.name,
        type: data.type,
        config: data.config || "{}",
        schedule: data.schedule || null,
      });
      if (response.success) {
        await refetch();
        return { ...data, id: response.data!.id, created_at: new Date().toISOString() } as Automation;
      }
      return null;
    } catch {
      return null;
    }
  }, [refetch]);

  const update = useCallback(async (id: number, data: Partial<Automation>): Promise<boolean> => {
    try {
      const response = await api.put("/api/automations/" + id, data);
      if (response.success) {
        await refetch();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [refetch]);

  const remove = useCallback(async (id: number): Promise<boolean> => {
    try {
      const response = await api.delete("/api/automations/" + id);
      if (response.success) {
        await refetch();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [refetch]);

  const run = useCallback(async (id: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await api.post("/api/automations/" + id + "/run");
      if (response.success) {
        await refetch();
        return { success: true };
      }
      return { success: false, error: response.error };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to run automation" };
    }
  }, [refetch]);

  const pause = useCallback(async (id: number): Promise<boolean> => {
    try {
      const response = await api.post("/api/automations/" + id + "/pause");
      if (response.success) {
        await refetch();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [refetch]);

  const resume = useCallback(async (id: number): Promise<boolean> => {
    try {
      const response = await api.post("/api/automations/" + id + "/resume");
      if (response.success) {
        await refetch();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [refetch]);

  return { automations, loading, error, refetch, create, update, remove, run, pause, resume };
}

interface UseRunningJobsReturn {
  runningJobs: Record<number, RunningJob>;
  refreshJobs: () => Promise<void>;
  getJobStatus: (automationId: number) => RunningJob | undefined;
}

export function useRunningJobs(): UseRunningJobsReturn {
  const [runningJobs, setRunningJobs] = useState<Record<number, RunningJob>>({});

  const refreshJobs = useCallback(async () => {
    try {
      const response = await api.get<Array<{
        id: number;
        automation_id: number;
        status: string;
        github_run_id: number | null;
        github_run_url: string | null;
        error_message: string | null;
      }>>("/api/jobs?limit=10");

      if (response.success && response.data) {
        const running: Record<number, RunningJob> = {};
        const latest: Record<number, typeof response.data[0]> = {};

        for (const job of response.data) {
          if (!latest[job.automation_id] || job.id > latest[job.automation_id].id) {
            latest[job.automation_id] = job;
          }
        }

        for (const autoId of Object.keys(latest)) {
          const job = latest[parseInt(autoId)];
          if (job.status === "running" || job.status === "queued") {
            try {
              const logsRes = await api.get<{
                run_status: string;
                run_conclusion: string | null;
                run_url: string;
                steps: JobStep[];
              }>(`/api/jobs/${job.id}/logs?t=${Date.now()}`);

              if (logsRes.success && logsRes.data) {
                const steps = logsRes.data.steps || [];
                let status = logsRes.data.run_status || "running";
                if (status === "completed") {
                  status = logsRes.data.run_conclusion === "success" ? "success" : "failed";
                }
                running[job.automation_id] = {
                  jobId: job.id,
                  status,
                  githubRunUrl: logsRes.data.run_url,
                  steps,
                  error: job.error_message,
                  progress: calculateProgress(steps),
                };
              }
            } catch {}
          }
        }
        setRunningJobs(running);
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshJobs();
    const interval = setInterval(refreshJobs, 5000);
    return () => clearInterval(interval);
  }, [refreshJobs]);

  const getJobStatus = useCallback((automationId: number) => {
    return runningJobs[automationId];
  }, [runningJobs]);

  return { runningJobs, refreshJobs, getJobStatus };
}
