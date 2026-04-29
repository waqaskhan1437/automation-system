import { API_BASE_URL } from "./constants";
import type { ApiResponse } from "./types";
import { getStoredAccessToken } from "./auth";

interface FetchOptions extends RequestInit {
  timeout?: number;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {},
  baseUrl: string = API_BASE_URL
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
    const response = await fetch(fullUrl, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(getStoredAccessToken() ? { Authorization: `Bearer ${getStoredAccessToken()}` } : {}),
        ...fetchOptions.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      data?.error || `Request failed with status ${response.status}`,
      response.status,
      data
    );
  }

  return data as ApiResponse<T>;
}

export const api = {
  async get<T>(url: string, options?: FetchOptions): Promise<ApiResponse<T>> {
    const response = await fetchWithTimeout(url, { ...options, method: "GET" });
    return handleResponse<T>(response);
  },

  async post<T>(url: string, body?: unknown, options?: FetchOptions): Promise<ApiResponse<T>> {
    const response = await fetchWithTimeout(url, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  async put<T>(url: string, body?: unknown, options?: FetchOptions): Promise<ApiResponse<T>> {
    const response = await fetchWithTimeout(url, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  async patch<T>(url: string, body?: unknown, options?: FetchOptions): Promise<ApiResponse<T>> {
    const response = await fetchWithTimeout(url, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  async delete<T>(url: string, options?: FetchOptions): Promise<ApiResponse<T>> {
    const response = await fetchWithTimeout(url, { ...options, method: "DELETE" });
    return handleResponse<T>(response);
  },
};

export { ApiError };
export type { FetchOptions };
