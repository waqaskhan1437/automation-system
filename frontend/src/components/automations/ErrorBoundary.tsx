"use client";
import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  name?: string;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
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

export function SafeTab({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <ErrorBoundary name={name}>
      <TabErrorWrapper name={name}>{children}</TabErrorWrapper>
    </ErrorBoundary>
  );
}

function TabErrorWrapper({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <React.Suspense fallback={
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <span className="ml-2 text-xs text-[#71717a]">Loading {name}...</span>
      </div>
    }>
      {children}
    </React.Suspense>
  );
}
