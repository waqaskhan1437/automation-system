"use client";
import React from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { api } from "@/lib/api";
import { clearStoredAccessToken, getStoredAccessToken, setStoredAccessToken } from "@/lib/auth";
import { API_BASE_URL, HOSTED_FRONTEND_URL } from "@/lib/constants";
import { usePathname, useRouter } from "next/navigation";

type SessionUser = {
  id: number;
  name: string;
  email: string | null;
  status: string;
  role: "admin" | "user";
  is_admin: boolean;
};

type SessionContextValue = {
  sessionUser: SessionUser | null;
};

type LocalSessionInfo = {
  success: boolean;
  data?: {
    runner_user?: SessionUser | null;
    access_user?: SessionUser | null;
  };
  error?: string | null;
};

const SessionContext = React.createContext<SessionContextValue>({ sessionUser: null });

function isLocalBrowserOrigin(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function clearTokenQueryParam(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (!url.searchParams.has("token")) {
    return;
  }

  url.searchParams.delete("token");
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", nextUrl || "/");
}

export function useSessionUser(): SessionUser | null {
  return React.useContext(SessionContext).sessionUser;
}

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [token, setToken] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [adminPassword, setAdminPassword] = React.useState("");
  const [sessionUser, setSessionUser] = React.useState<SessionUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const isAdminRoute = pathname === "/adminlogin";
  const isLocalOrigin = isLocalBrowserOrigin();

  const fetchLocalSessionInfo = React.useCallback(async (): Promise<LocalSessionInfo | null> => {
    if (!isLocalBrowserOrigin()) {
      return null;
    }

    try {
      const response = await fetch("/api/local-session");
      return await response.json() as LocalSessionInfo;
    } catch {
      return null;
    }
  }, []);

  const verifyToken = React.useCallback(async (nextToken: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.post<{ user: SessionUser }>("/api/auth/token", undefined, {
        headers: {
          Authorization: `Bearer ${nextToken}`,
        },
      });

      if (!response.success || !response.data?.user) {
        throw new Error(response.error || "Invalid access token");
      }

      const localOrigin = isLocalBrowserOrigin();
      if (!localOrigin && !response.data.user.is_admin) {
        throw new Error("User workspace is only available from the local runner link on this PC.");
      }

      if (localOrigin && response.data.user.is_admin) {
        throw new Error("Admin access is only available from the hosted admin portal.");
      }

      if (localOrigin) {
        const localSession = await fetchLocalSessionInfo();
        if (!localSession?.success) {
          throw new Error(localSession?.error || "This PC is not fully linked yet. Add both the runner token and access token on the local launcher.");
        }
        const runnerUserId = localSession?.data?.runner_user?.id;
        if (runnerUserId && runnerUserId !== response.data.user.id) {
          throw new Error(
            localSession?.error ||
            `This PC is linked to runner workspace user ${runnerUserId}, but this browser token belongs to user ${response.data.user.id}.`
          );
        }
      }

      setStoredAccessToken(nextToken);
      setSessionUser(response.data.user);
      setToken("");
      clearTokenQueryParam();
      if (pathname === "/adminlogin" && !response.data.user.is_admin) {
        clearStoredAccessToken();
        setSessionUser(null);
        setError("This route is only for admin access.");
      }
    } catch (err) {
      clearStoredAccessToken();
      setSessionUser(null);
      setError(err instanceof Error ? err.message : "Invalid access token");
    } finally {
      setLoading(false);
    }
  }, [fetchLocalSessionInfo, pathname]);

  const loginAdmin = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.post<{ access_token: string; user: SessionUser }>("/api/auth/admin-login", {
        email: adminEmail.trim(),
        password: adminPassword,
      });

      if (!response.success || !response.data?.access_token || !response.data.user?.is_admin) {
        throw new Error(response.error || "Admin login failed");
      }

      if (isLocalBrowserOrigin()) {
        throw new Error("Admin login is only available from the hosted admin portal.");
      }

      setStoredAccessToken(response.data.access_token);
      setSessionUser(response.data.user);
      setAdminPassword("");
      router.push("/settings");
    } catch (err) {
      clearStoredAccessToken();
      setSessionUser(null);
      setError(err instanceof Error ? err.message : "Admin login failed");
    } finally {
      setLoading(false);
    }
  }, [adminEmail, adminPassword, router]);

  React.useEffect(() => {
    const queryToken = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("token")
      : null;
    if (queryToken) {
      void verifyToken(queryToken);
      return;
    }

    const storedToken = getStoredAccessToken();
    if (!storedToken) {
      setLoading(false);
      return;
    }
    void verifyToken(storedToken);
  }, [verifyToken]);

  React.useEffect(() => {
    if (!sessionUser || !isAdminRoute) {
      return;
    }
    if (sessionUser.is_admin) {
      router.replace("/settings");
      return;
    }
    clearStoredAccessToken();
    setSessionUser(null);
    setError("This route is only for admin access.");
  }, [isAdminRoute, router, sessionUser]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      const shouldAttachToken = url.startsWith("/") || url.startsWith(API_BASE_URL);
      if (!shouldAttachToken) {
        return originalFetch(input, init);
      }

      const tokenValue = getStoredAccessToken();
      if (!tokenValue) {
        return originalFetch(input, init);
      }

      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${tokenValue}`);
      }

      return originalFetch(input, {
        ...init,
        headers,
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  if (loading) {
    return (
      <ErrorBoundary name="App">
        <div className="min-h-screen flex items-center justify-center">
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-[#a1a1aa]">Verifying access token...</p>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (!sessionUser) {
    return (
      <ErrorBoundary name="App">
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="glass-card w-full max-w-md p-8">
            <h1 className="text-2xl font-bold mb-2">
              {isAdminRoute ? "Admin Login" : (isLocalOrigin ? "Connect Your Workspace" : "Admin Portal")}
            </h1>
            <p className="text-sm text-[#a1a1aa] mb-6">
              {isAdminRoute
                ? (isLocalOrigin
                  ? "Admin access is only available from the hosted admin portal."
                  : "Enter your admin email and password to manage users, tokens, and GitHub runner workflows.")
                : (isLocalOrigin
                  ? "Enter the access token issued for this user after the local launcher on this PC has already been linked with the matching runner token."
                  : "Hosted access is reserved for admins. User workspaces always open from the local runner link on the PC." )}
            </p>
            {isAdminRoute && !isLocalOrigin ? (
              <>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  placeholder="admin@example.com"
                  className="glass-input w-full mb-4"
                />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="Password"
                  className="glass-input w-full mb-4"
                />
              </>
            ) : (!isAdminRoute && isLocalOrigin ? (
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="atk_..."
                className="glass-input w-full mb-4"
              />
            ) : null)}
            {error ? <p className="text-sm text-[#ef4444] mb-4">{error}</p> : null}
            {isAdminRoute && isLocalOrigin ? (
              <button
                onClick={() => {
                  window.location.href = `${HOSTED_FRONTEND_URL}/adminlogin`;
                }}
                className="glass-button-primary w-full"
              >
                Open Hosted Admin Portal
              </button>
            ) : (!isLocalOrigin && !isAdminRoute ? (
              <button
                onClick={() => {
                  router.push("/adminlogin");
                }}
                className="glass-button-primary w-full"
              >
                Go To Admin Login
              </button>
            ) : (
              <button
                onClick={() => void (isAdminRoute ? loginAdmin() : verifyToken(token.trim()))}
                disabled={isAdminRoute ? !adminEmail.trim() || !adminPassword : !token.trim()}
                className="glass-button-primary w-full disabled:opacity-50"
              >
                {isAdminRoute ? "Access Admin" : "Load Local Dashboard"}
              </button>
            ))}
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <SessionContext.Provider value={{ sessionUser }}>
      <ErrorBoundary name="App">
        {children}
      </ErrorBoundary>
    </SessionContext.Provider>
  );
}
