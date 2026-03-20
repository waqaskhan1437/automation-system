"use client";
import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  name?: string;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error.message, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-red-500/20 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-red-400">
              {this.props.name ? `${this.props.name} Error` : "Component Error"}
            </span>
          </div>
          <p className="text-[11px] text-red-300/70 mb-2">
            {this.state.error?.message || "Something went wrong"}
          </p>
          <button
            onClick={this.reset}
            className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface SafeWrapperProps {
  children: React.ReactNode;
  name: string;
  loadingComponent?: React.ReactNode;
}

export function SafeWrapper({ children, name, loadingComponent }: SafeWrapperProps) {
  return (
    <ErrorBoundary name={name}>
      <React.Suspense fallback={loadingComponent || <DefaultLoading name={name} />}>
        {children}
      </React.Suspense>
    </ErrorBoundary>
  );
}

function DefaultLoading({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      <span className="ml-2 text-xs text-[#71717a]">Loading {name}...</span>
    </div>
  );
}

export function LoadingPage({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      <p className="text-[#a1a1aa] mt-4">{message}</p>
    </div>
  );
}

export function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass-card p-8 flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        {message && <p className="text-[#a1a1aa] mt-4">{message}</p>}
      </div>
    </div>
  );
}

export default ErrorBoundary;
