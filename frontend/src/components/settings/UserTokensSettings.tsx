"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type ManagedUser = {
  id: number;
  name: string;
  email: string | null;
  role?: "admin" | "user";
  status: string;
  created_at: string;
  last_login_at?: string | null;
};

type IssuedTokens = {
  user_id?: number;
  access_token: string;
  runner_token: string;
};

type FlashMessage = {
  type: "success" | "error";
  text: string;
};

function formatDate(value?: string | null): string {
  if (!value) {
    return "Never";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString();
}

function statusTone(status: string): string {
  if (status === "active") return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20";
  if (status === "revoked") return "bg-red-500/15 text-red-300 border border-red-500/20";
  return "bg-amber-500/15 text-amber-200 border border-amber-500/20";
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export default function UserTokensSettings() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actingUserId, setActingUserId] = useState<number | null>(null);
  const [issuedTokens, setIssuedTokens] = useState<IssuedTokens | null>(null);
  const [message, setMessage] = useState<FlashMessage | null>(null);

  const nonAdminUsers = useMemo(
    () => users.filter((user) => user.role !== "admin"),
    [users]
  );

  const activeUsers = nonAdminUsers.filter((user) => user.status === "active").length;

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await api.get<ManagedUser[]>("/api/admin/users");
      setUsers(response.data || []);
    } catch {
      setMessage({ type: "error", text: "Failed to load users." });
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleCreateUser = async () => {
    const trimmedName = userName.trim();
    if (!trimmedName) {
      setMessage({ type: "error", text: "User name is required." });
      return;
    }

    setCreating(true);
    setMessage(null);
    setIssuedTokens(null);

    try {
      const response = await api.post<IssuedTokens & { id?: number }>("/api/admin/users", {
        name: trimmedName,
        email: email.trim() || null,
      });

      if (!response.success || !response.data?.access_token || !response.data?.runner_token) {
        setMessage({ type: "error", text: response.error || "Failed to create user." });
        return;
      }

      setIssuedTokens({
        user_id: response.data.id,
        access_token: response.data.access_token,
        runner_token: response.data.runner_token,
      });
      setUserName("");
      setEmail("");
      setMessage({ type: "success", text: "User created and tokens issued." });
      await loadUsers();
    } catch {
      setMessage({ type: "error", text: "Failed to create user." });
    } finally {
      setCreating(false);
    }
  };

  const handleRotateTokens = async (user: ManagedUser) => {
    setActingUserId(user.id);
    setMessage(null);
    setIssuedTokens(null);

    try {
      const response = await api.post<IssuedTokens>(`/api/admin/users/${user.id}/tokens/rotate`);
      if (!response.success || !response.data?.access_token || !response.data?.runner_token) {
        setMessage({ type: "error", text: response.error || "Failed to regenerate tokens." });
        return;
      }

      setIssuedTokens({
        user_id: user.id,
        access_token: response.data.access_token,
        runner_token: response.data.runner_token,
      });
      setMessage({ type: "success", text: `Tokens regenerated for ${user.name}.` });
      await loadUsers();
    } catch {
      setMessage({ type: "error", text: "Failed to regenerate tokens." });
    } finally {
      setActingUserId(null);
    }
  };

  const handleDeleteUser = async (user: ManagedUser) => {
    const confirmed = window.confirm(`Delete user "${user.name}" and all related data?`);
    if (!confirmed) {
      return;
    }

    setActingUserId(user.id);
    setMessage(null);

    try {
      const response = await api.delete(`/api/admin/users/${user.id}`);
      if (!response.success) {
        setMessage({ type: "error", text: response.error || "Failed to delete user." });
        return;
      }

      if (issuedTokens?.user_id === user.id) {
        setIssuedTokens(null);
      }

      setMessage({ type: "success", text: `User ${user.name} deleted.` });
      await loadUsers();
    } catch {
      setMessage({ type: "error", text: "Failed to delete user." });
    } finally {
      setActingUserId(null);
    }
  };

  const handleCopyToken = async (label: string, value: string) => {
    const ok = await copyText(value);
    setMessage({
      type: ok ? "success" : "error",
      text: ok ? `${label} copied.` : `Failed to copy ${label.toLowerCase()}.`,
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white">Users</h3>
            <p className="mt-1 max-w-2xl text-sm text-[#a1a1aa]">
              Create a user, issue fresh tokens, or remove a user. Remote runner controls and machine telemetry live in the separate runners screen.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="min-w-[120px] rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#71717a]">Users</div>
              <div className="mt-1 text-2xl font-semibold text-white">{nonAdminUsers.length}</div>
            </div>
            <div className="min-w-[120px] rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#71717a]">Active</div>
              <div className="mt-1 text-2xl font-semibold text-white">{activeUsers}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-[#71717a]">User Name</label>
            <input
              type="text"
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              placeholder="Client Runner 01"
              className="glass-input w-full px-4 py-3"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-[#71717a]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="client@example.com"
              className="glass-input w-full px-4 py-3"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreateUser}
              disabled={creating}
              className="h-[50px] rounded-2xl bg-[#2563eb] px-5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
            >
              {creating ? "Creating..." : "Generate User"}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
            message.type === "error"
              ? "border border-red-500/25 bg-red-500/10 text-red-300"
              : "border border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
          }`}>
            {message.text}
          </div>
        )}

        {issuedTokens && (
          <div className="mt-5 grid gap-4 rounded-3xl border border-[#2563eb]/30 bg-[#2563eb]/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Issued Tokens</div>
                <div className="text-xs text-[#bfdbfe]">
                  Keep `RUNNER_TOKEN` on the PC and use the matching `ACCESS_TOKEN` in the localhost dashboard.
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[#93c5fd]">Access Token</div>
                <code className="block break-all text-sm text-white">{issuedTokens.access_token}</code>
                <button
                  onClick={() => void handleCopyToken("Access token", issuedTokens.access_token)}
                  className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/5"
                >
                  Copy Access Token
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[#93c5fd]">Runner Token</div>
                <code className="block break-all text-sm text-white">{issuedTokens.runner_token}</code>
                <button
                  onClick={() => void handleCopyToken("Runner token", issuedTokens.runner_token)}
                  className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/5"
                >
                  Copy Runner Token
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-[rgba(255,255,255,0.03)] p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-white">Existing Users</h4>
            <p className="text-sm text-[#71717a]">Simple account management for locally linked runner users.</p>
          </div>
          <button
            onClick={() => void loadUsers()}
            disabled={loadingUsers}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/5 disabled:opacity-50"
          >
            {loadingUsers ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loadingUsers ? (
          <p className="text-sm text-[#71717a]">Loading users...</p>
        ) : nonAdminUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-[#71717a]">
            No users created yet.
          </div>
        ) : (
          <div className="space-y-3">
            {nonAdminUsers.map((user) => (
              <div
                key={user.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h5 className="text-base font-semibold text-white">{user.name}</h5>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${statusTone(user.status)}`}>
                        {user.status}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-[#a1a1aa]">{user.email || "No email"}</div>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#71717a]">
                      <span>Created: {formatDate(user.created_at)}</span>
                      <span>Last Login: {formatDate(user.last_login_at)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void handleRotateTokens(user)}
                      disabled={actingUserId === user.id}
                      className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-2 text-sm text-blue-200 transition hover:bg-blue-500/20 disabled:opacity-50"
                    >
                      {actingUserId === user.id ? "Working..." : "Regenerate Tokens"}
                    </button>
                    <button
                      onClick={() => void handleDeleteUser(user)}
                      disabled={actingUserId === user.id}
                      className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {actingUserId === user.id ? "Working..." : "Delete User"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
