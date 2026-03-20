"use client";
import { useState, useEffect } from "react";

interface PostForMeResult {
  success: boolean;
  post_id?: string;
  post_url?: string;
  media_url?: string;
  platforms?: number;
  scheduled?: boolean;
  scheduled_at?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

interface Job {
  id: number;
  automation_id: number;
  status: string;
  github_run_id: number | null;
  github_run_url: string | null;
  input_data: string | null;
  output_data: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Automation {
  id: number;
  name: string;
}

interface OutputItem {
  job: Job;
  postResult: PostForMeResult | null;
  automationName: string;
}

export default function OutputPage() {
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<OutputItem | null>(null);

  useEffect(() => {
    fetchOutputs();
    const interval = setInterval(fetchOutputs, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchOutputs = async () => {
    try {
      const jobsRes = await fetch("/api/jobs?limit=20");
      const jobsData = await jobsRes.json();

      const autoRes = await fetch("/api/automations");
      const autoData = await autoRes.json();
      const automations: Automation[] = autoData.success ? autoData.data : [];

      if (jobsData.success && jobsData.data) {
        const items: OutputItem[] = [];
        
        for (const job of jobsData.data) {
          let postResult: PostForMeResult | null = null;
          
          if (job.output_data) {
            try {
              postResult = JSON.parse(job.output_data);
            } catch {}
          }
          
          const automation = automations.find((a) => a.id === job.automation_id);
          
          items.push({
            job,
            postResult,
            automationName: automation?.name || `Automation #${job.automation_id}`,
          });
        }
        
        setOutputs(items.sort((a, b) => 
          new Date(b.job.created_at).getTime() - new Date(a.job.created_at).getTime()
        ));
      }
    } catch {}
    setLoading(false);
  };

  const getStatusBadge = (status: string, postResult: PostForMeResult | null) => {
    if (status === "success") {
      if (postResult?.skipped) {
        return <span className="badge badge-gray">Skipped</span>;
      }
      if (postResult?.scheduled) {
        return <span className="badge badge-warning">Scheduled</span>;
      }
      if (postResult?.success) {
        return <span className="badge badge-success">Posted</span>;
      }
      return <span className="badge badge-success">Success</span>;
    }
    if (status === "failed") {
      return <span className="badge badge-error">Failed</span>;
    }
    return <span className="badge badge-info">Running</span>;
  };

  const formatScheduledTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">Output</h2>
          <p className="text-[#a1a1aa] mt-1">Review processed videos and posting status</p>
        </div>
        <button onClick={fetchOutputs} className="glass-button flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#a1a1aa]">Loading...</div>
      ) : outputs.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-20 h-20 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-lg font-medium">No outputs yet</p>
          <p className="text-[#a1a1aa] mt-1">Run an automation to see processed videos</p>
          <a href="/automations" className="glass-button-primary inline-block mt-4 px-6 py-2">
            Go to Automations
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {outputs.map((item) => (
            <div key={item.job.id} className="glass-card overflow-hidden">
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Video Preview / Player */}
                <div className="lg:w-1/3 aspect-[9/16] bg-gradient-to-br from-[#1a1a2e] to-[#0d0d14] flex items-center justify-center rounded-xl overflow-hidden relative">
                  {item.job.status === "running" ? (
                    <div className="text-center p-4">
                      <div className="w-12 h-12 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-sm text-white/60">Processing...</p>
                    </div>
                  ) : item.job.status === "failed" ? (
                    <div className="text-center p-4">
                      <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <p className="text-sm text-red-400">Processing Failed</p>
                      <p className="text-xs text-white/40 mt-1">Check GitHub for logs</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedVideo(item)}
                      className="w-full h-full flex items-center justify-center group cursor-pointer"
                    >
                      <div className="w-20 h-20 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center transition-colors">
                        <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </button>
                  )}
                  
                  {/* Status Badge */}
                  <div className="absolute top-3 right-3">
                    {getStatusBadge(item.job.status, item.postResult)}
                  </div>
                </div>

                {/* Info Panel */}
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold">{item.automationName}</h3>
                      <p className="text-sm text-[#a1a1aa] mt-1">
                        Job #{item.job.id} &bull; {new Date(item.job.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* PostForMe Status */}
                  {item.postResult && !item.postResult.skipped && (
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-white/80">PostForMe Status</div>
                      
                      {item.postResult.success ? (
                        <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                          {item.postResult.scheduled ? (
                            <>
                              <div className="flex items-center gap-2 text-green-400 mb-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Scheduled for {item.postResult.scheduled_at ? formatScheduledTime(item.postResult.scheduled_at) : "later"}
                              </div>
                              {item.postResult.post_id && (
                                <p className="text-xs text-green-400/60">Post ID: {item.postResult.post_id}</p>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 text-green-400 mb-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Posted to {item.postResult.platforms} platform(s)
                              </div>
                              {item.postResult.post_url && (
                                <a href={item.postResult.post_url} target="_blank" rel="noopener" className="text-xs text-indigo-400 hover:underline">
                                  View on PostForMe &rarr;
                                </a>
                              )}
                            </>
                          )}
                        </div>
                      ) : item.postResult.error ? (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                          <div className="flex items-center gap-2 text-red-400 mb-1">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Posting Failed
                          </div>
                          <p className="text-xs text-red-400/60">{item.postResult.error}</p>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 mt-4">
                    {item.job.github_run_url && (
                      <a
                        href={item.job.github_run_url}
                        target="_blank"
                        rel="noopener"
                        className="glass-button text-sm flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                        GitHub
                      </a>
                    )}
                    {item.job.status === "success" && (
                      <button
                        onClick={() => setSelectedVideo(item)}
                        className="glass-button-primary text-sm flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Preview Video
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video Player Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedVideo(null)}>
          <div className="glass-card max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="font-bold">{selectedVideo.automationName}</h3>
              <button onClick={() => setSelectedVideo(null)} className="p-2 hover:bg-white/10 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="aspect-[9/16] bg-black flex items-center justify-center">
              <div className="text-center p-8">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-white/60 mb-4">Video Preview</p>
                <p className="text-xs text-white/40">Download artifact to view full video</p>
                {selectedVideo.job.github_run_url && (
                  <a
                    href={selectedVideo.job.github_run_url}
                    target="_blank"
                    rel="noopener"
                    className="glass-button-primary inline-block mt-4"
                  >
                    View on GitHub
                  </a>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-white/10">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[#71717a]">Job ID:</span>
                  <span className="ml-2">#{selectedVideo.job.id}</span>
                </div>
                <div>
                  <span className="text-[#71717a]">Created:</span>
                  <span className="ml-2">{new Date(selectedVideo.job.created_at).toLocaleString()}</span>
                </div>
                {selectedVideo.postResult?.post_id && (
                  <div>
                    <span className="text-[#71717a]">Post ID:</span>
                    <span className="ml-2">{selectedVideo.postResult.post_id}</span>
                  </div>
                )}
                {selectedVideo.postResult?.scheduled_at && (
                  <div>
                    <span className="text-[#71717a]">Scheduled:</span>
                    <span className="ml-2">{formatScheduledTime(selectedVideo.postResult.scheduled_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
