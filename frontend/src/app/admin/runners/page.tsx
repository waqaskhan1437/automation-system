"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type RunnerUser = {
  id: number;
  name: string;
  email: string | null;
  status: string;
  runner_hostname?: string | null;
  runner_status?: string | null;
  runner_last_seen_at?: string | null;
  runner_platform?: string | null;
  tailscale_status?: string | null;
  tailscale_ip?: string | null;
  tailscale_dns_name?: string | null;
  ssh_status?: string | null;
  ssh_target?: string | null;
};

function isOnline(user: RunnerUser): boolean {
  if (!user.runner_last_seen_at || user.status !== "active") {
    return false;
  }

  const parsed = Date.parse(user.runner_last_seen_at);
  return !Number.isNaN(parsed) && (Date.now() - parsed) < 120000;
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString();
}

export default function AdminRunnersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [runners, setRunners] = useState<RunnerUser[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await api.get<RunnerUser[]>("/api/admin/users");
        setRunners((response.data || []).filter((user) => user.status === "active" || user.runner_hostname || user.ssh_target));
      } catch {
        setError("Failed to fetch runners");
      }
      setLoading(false);
    };

    void load();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Runner Remote Access</h1>
          <p className="text-sm text-gray-400 mt-1">
            Portable Windows runners report their Tailscale network identity and OpenSSH target here.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="glass-card p-6">
          {loading ? (
            <p className="text-gray-400">Loading runners...</p>
          ) : runners.length === 0 ? (
            <p className="text-gray-400">No runners have reported remote-access telemetry yet.</p>
          ) : (
            <div className="space-y-4">
              {runners.map((runner) => (
                <div key={runner.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{runner.name}</div>
                      <div className="text-xs text-gray-400">{runner.email || "No email"}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      isOnline(runner) ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-200"
                    }`}>
                      {isOnline(runner) ? "online" : "offline"}
                    </span>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 mt-4 text-sm">
                    <div>
                      <div className="text-xs text-gray-400">Hostname</div>
                      <div>{runner.runner_hostname || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Last Seen</div>
                      <div>{formatDate(runner.runner_last_seen_at)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Platform</div>
                      <div>{runner.runner_platform || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Tailscale</div>
                      <div>{runner.tailscale_status || "not reported"}</div>
                      <div className="text-xs text-gray-500">{runner.tailscale_dns_name || runner.tailscale_ip || "-"}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs text-gray-400">SSH Target</div>
                      <code className="block break-all text-xs text-cyan-200">{runner.ssh_target ? `ssh ${runner.ssh_target}` : "-"}</code>
                      <div className="text-xs text-gray-500 mt-1">SSH status: {runner.ssh_status || "disabled"}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
