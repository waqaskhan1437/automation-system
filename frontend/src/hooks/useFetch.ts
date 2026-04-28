"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";

export interface UseFetchOptions<T> {
  url: string;
  immediate?: boolean;
  refetchInterval?: number;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

export interface UseFetchReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: (nextUrl?: string) => Promise<void>;
}

export function useFetch<T>(options: UseFetchOptions<T>): UseFetchReturn<T>;
export function useFetch<T>(url: string, immediate?: boolean): UseFetchReturn<T>;
export function useFetch<T>(
  urlOrOptions: string | UseFetchOptions<T>,
  immediate = true
): UseFetchReturn<T> {
  const url = typeof urlOrOptions === "string" ? urlOrOptions : urlOrOptions.url;
  const refetchInterval = typeof urlOrOptions === "object" ? urlOrOptions.refetchInterval : undefined;
  const onSuccess = typeof urlOrOptions === "object" ? urlOrOptions.onSuccess : undefined;
  const onError = typeof urlOrOptions === "object" ? urlOrOptions.onError : undefined;
  const shouldRefetch = typeof urlOrOptions === "object" ? (urlOrOptions.immediate ?? true) : immediate;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(shouldRefetch);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async (nextUrl?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<T>(nextUrl || url);
      if (response.success) {
        setData(response.data as T);
        onSuccess?.(response.data as T);
      } else {
        const errorMsg = response.error || "Failed to fetch data";
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [url, onSuccess, onError]);

  useEffect(() => {
    if (shouldRefetch) {
      refetch();
    }
  }, [refetch, shouldRefetch]);

  useEffect(() => {
    if (refetchInterval) {
      intervalRef.current = setInterval(() => {
        void refetch();
      }, refetchInterval);
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [refetchInterval, refetch]);

  return { data, loading, error, refetch };
}
