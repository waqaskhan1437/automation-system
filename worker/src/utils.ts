import { ApiResponse } from "./types";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key, X-Access-Token",
};

export function jsonResponse<T>(data: ApiResponse<T>, status: number = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...headers,
    },
  });
}

export function githubHeaders(patToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${patToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "AutomationSystem/1.0",
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function safeRequestJson<T = any>(request: Request): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text || !text.trim()) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("JSON parse error:", error instanceof Error ? error.message : String(error));
    return null;
  }
}
