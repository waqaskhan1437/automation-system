"use client";
import { useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiReturn<T> extends UseApiState<T> {
  execute: () => Promise<void>;
  reset: () => void;
}

export function useApi<T>(
  url: string,
  options?: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown }
): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async () => {
    setState({ data: null, loading: true, error: null });
    try {
      const method = options?.method || "GET";
      const response = method === "GET" 
        ? await api.get<T>(url)
        : method === "POST"
        ? await api.post<T>(url, options?.body)
        : method === "PUT"
        ? await api.put<T>(url, options?.body)
        : await api.delete<T>(url);

      if (response.success) {
        setState({ data: response.data as T, loading: false, error: null });
      } else {
        setState({ data: null, loading: false, error: response.error || "Request failed" });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "An unexpected error occurred";
      setState({ data: null, loading: false, error: message });
    }
  }, [url, options]);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

interface UseMutationOptions<T, V> {
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

interface UseMutationReturn<T, V> {
  mutate: (variables?: V) => Promise<T | null>;
  loading: boolean;
  error: string | null;
  data: T | null;
  reset: () => void;
}

export function useMutation<T, V = unknown>(
  url: string,
  method: "POST" | "PUT" | "DELETE" = "POST",
  options?: UseMutationOptions<T, V>
): UseMutationReturn<T, V> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const mutate = useCallback(async (variables?: V): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = method === "POST"
        ? await api.post<T>(url, variables)
        : method === "PUT"
        ? await api.put<T>(url, variables)
        : await api.delete<T>(url);

      if (response.success) {
        const resultData = response.data as T;
        setData(resultData);
        options?.onSuccess?.(resultData);
        return resultData;
      } else {
        const errorMsg = response.error || "Request failed";
        setError(errorMsg);
        options?.onError?.(errorMsg);
        return null;
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "An unexpected error occurred";
      setError(message);
      options?.onError?.(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [url, method, options]);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return { mutate, loading, error, data, reset };
}
