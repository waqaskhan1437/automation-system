import { ApiResponse } from "./types";

export function jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
