"use client";
import { useJobs } from "@/hooks/useJobs";
import { useAutomations } from "@/hooks/useAutomations";

export default function Dashboard() {
  const { jobs } = useJobs(100);
  const { automations } = useAutomations();

  const stats = [
    {
      label: "Total Automations",
      value: automations.length.toString(),
      icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
      color: "#6366f1"
    },
    {
      label: "Total Jobs",
      value: jobs.length.toString(),
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
      color: "#8b5cf6"
    },
    {
      label: "Successful",
      value: jobs.filter(j => j.status === "success").length.toString(),
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
      color: "#10b981"
    },
    {
      label: "Failed",
      value: jobs.filter(j => j.status === "failed").length.toString(),
      icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      color: "#ef4444"
    },
  ];

  const recentJobs = jobs.slice(0, 5);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold">Dashboard</h2>
        <p className="text-[#a1a1aa] mt-1">Monitor your automation system</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="flex items-center justify-between mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${stat.color}20` }}
              >
                <svg className="w-5 h-5" fill="none" stroke={stat.color} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={stat.icon} />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-sm text-[#a1a1aa] mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <a href="/automations/video/new" className="glass-button-primary text-center py-4 rounded-xl block">
              Create Video Automation
            </a>
            <a href="/automations/image/new" className="glass-button-primary text-center py-4 rounded-xl block">
              Create Image Automation
            </a>
            <a href="/settings" className="glass-button text-center py-4 rounded-xl block">
              Settings
            </a>
            <a href="/jobs" className="glass-button text-center py-4 rounded-xl block">
              View Jobs
            </a>
          </div>
        </div>

        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Jobs</h3>
          {recentJobs.length === 0 ? (
            <div className="text-center py-12 text-[#a1a1aa]">
              <svg className="w-12 h-12 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p>No jobs yet</p>
              <p className="text-sm mt-1">Run an automation to see jobs here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-[rgba(255,255,255,0.03)]">
                  <div>
                    <p className="text-sm font-medium">Job #{job.id}</p>
                    <p className="text-xs text-[#71717a]">
                      {job.created_at ? new Date(job.created_at).toLocaleString() : ""}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    job.status === "success" ? "bg-[#10b981]/20 text-[#10b981]" :
                    job.status === "failed" ? "bg-[#ef4444]/20 text-[#ef4444]" :
                    job.status === "running" ? "bg-[#6366f1]/20 text-[#6366f1]" :
                    "bg-[#f59e0b]/20 text-[#f59e0b]"
                  }`}>
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
