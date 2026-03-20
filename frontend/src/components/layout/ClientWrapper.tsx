"use client";
import React from "react";
import { ErrorBoundary } from "@/components/automations/ErrorBoundary";

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary name="App">
      {children}
    </ErrorBoundary>
  );
}
