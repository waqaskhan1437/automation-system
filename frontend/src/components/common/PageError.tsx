"use client";
import { useState, useEffect, useCallback } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

interface PageErrorProps {
  children: React.ReactNode;
  onRetry?: () => void;
}

export default function PageErrorBoundary({ children, onRetry }: PageErrorProps) {
  return (
    <ErrorBoundary name="Page">
      {children}
    </ErrorBoundary>
  );
}

interface AsyncWrapperProps {
  children: React.ReactNode;
  loading?: React.ReactNode;
  error?: React.ReactNode;
}

export function AsyncContent({ children, loading, error }: AsyncWrapperProps) {
  return (
    <>
      {loading}
      {error}
      {children}
    </>
  );
}

interface DataLoaderProps<T> {
  fetcher: () => Promise<T>;
  children: (data: T) => React.ReactNode;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  onError?: (error: Error) => void;
}

export function DataLoader<T>({
  fetcher,
  children,
  loadingComponent,
  errorComponent,
  onError,
}: DataLoaderProps<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetcher();
      setData(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [fetcher, onError]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <>{loadingComponent}</>;
  if (error && errorComponent) return <>{errorComponent}</>;
  if (!data) return null;
  return <>{children(data)}</>;
}
