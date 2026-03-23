"use client";
import { useState, useEffect, useCallback } from "react";
import { VideoUpload } from "../lib/types";

export function useUploads(jobId?: number) {
  const [uploads, setUploads] = useState<VideoUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUploads = useCallback(async () => {
    try {
      setLoading(true);
      const url = jobId ? `/api/uploads?job_id=${jobId}` : "/api/uploads";
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.success) {
        setUploads(data.data || []);
      } else {
        setError(data.error || "Failed to fetch uploads");
      }
    } catch (err) {
      setError("Failed to fetch uploads");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  const uploadVideo = async (videoData: {
    job_id: number;
    media_url: string;
    platforms?: string[];
    aspect_ratio?: string;
    duration?: number;
    file_size?: number;
  }) => {
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...videoData,
        platforms: JSON.stringify(videoData.platforms || []),
      }),
    });
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.error);
    }
    
    await fetchUploads();
    return data.data;
  };

  const postVideo = async (uploadId: number) => {
    const res = await fetch(`/api/uploads/${uploadId}/post`, {
      method: "POST",
    });
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.error);
    }
    
    await fetchUploads();
    return data.data;
  };

  const scheduleVideo = async (uploadId: number, scheduledAt: string) => {
    const res = await fetch(`/api/uploads/${uploadId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    });
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.error);
    }
    
    await fetchUploads();
    return data.data;
  };

  const getUploadStatus = (upload: VideoUpload | undefined) => {
    if (!upload) return null;
    
    if (upload.post_status === "posted") {
      return { label: "Posted", variant: "success" as const };
    }
    if (upload.post_status === "scheduled") {
      return { label: `Scheduled: ${new Date(upload.scheduled_at!).toLocaleString()}`, variant: "warning" as const };
    }
    if (upload.upload_status === "uploaded") {
      return { label: "Just Uploaded", variant: "info" as const };
    }
    if (upload.upload_status === "failed") {
      return { label: "Upload Failed", variant: "error" as const };
    }
    return { label: "Uploading...", variant: "default" as const };
  };

  return {
    uploads,
    loading,
    error,
    fetchUploads,
    uploadVideo,
    postVideo,
    scheduleVideo,
    getUploadStatus,
  };
}