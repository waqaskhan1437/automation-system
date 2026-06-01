"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface QueueItem {
  id: number;
  url: string;
  title: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  job_id: number | null;
  error_message: string | null;
  queue_order: number;
  created_at: string;
  processed_at: string | null;
}

export default function YoutubeQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<QueueItem[]>("/api/youtube-queue");
      setItems(res.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const addUrls = async () => {
    const urls = inputText.trim();
    if (!urls) return;

    setAdding(true);
    setError(null);
    try {
      const res = await api.post<{ added: { url: string; id: number }[]; skipped_count?: number }>("/api/youtube-queue", { urls });
      setInputText("");
      await fetchQueue();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add URLs");
    } finally {
      setAdding(false);
    }
  };

  const removeItem = async (id: number) => {
    try {
      await api.delete(`/api/youtube-queue/${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove item");
    }
  };

  const clearPending = async () => {
    try {
      await api.delete("/api/youtube-queue");
      await fetchQueue();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to clear queue");
    }
  };

  const reorder = async (ids: number[]) => {
    try {
      await api.patch("/api/youtube-queue/reorder", { ids });
      await fetchQueue();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reorder");
    }
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    reorder(newItems.map((i) => i.id));
  };

  const moveDown = (index: number) => {
    if (index >= items.length - 1) return;
    const newItems = [...items];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    reorder(newItems.map((i) => i.id));
  };

  const pendingItems = items.filter((i) => i.status === "pending");
  const completedItems = items.filter((i) => i.status === "completed");
  const failedItems = items.filter((i) => i.status === "failed");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">YouTube Queue</h1>

      {/* Add URLs */}
      <div className="glass-card p-4 mb-6">
        <h2 className="text-sm font-semibold mb-2">Add YouTube URLs</h2>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste YouTube URLs here, one per line&#10;e.g. https://www.youtube.com/watch?v=..."
          className="w-full h-24 px-3 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg text-sm text-white placeholder-[#71717a] focus:border-[#6366f1] focus:outline-none resize-none mb-3"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={addUrls}
            disabled={adding || !inputText.trim()}
            className="px-4 py-2 bg-[#6366f1] text-white text-sm font-medium rounded-lg hover:bg-[#4f46e5] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? "Adding..." : "Add to Queue"}
          </button>
          {pendingItems.length > 0 && (
            <button
              onClick={clearPending}
              className="px-4 py-2 bg-red-500/10 text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/20 border border-red-500/20"
            >
              Clear Pending
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Pending Items */}
      {loading ? (
        <div className="text-center py-8 text-[#a1a1aa]">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-[#a1a1aa]">
          No URLs in queue. Add some YouTube links above.
        </div>
      ) : (
        <>
          {pendingItems.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-3 text-[#a1a1aa] uppercase tracking-wider">
                Pending ({pendingItems.length})
              </h2>
              <div className="space-y-2">
                {pendingItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="glass-card p-3 flex items-center gap-3 group"
                  >
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveUp(index)}
                        disabled={index === 0}
                        className="text-[#a1a1aa] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                      </button>
                      <button
                        onClick={() => moveDown(index)}
                        disabled={index >= pendingItems.length - 1}
                        className="text-[#a1a1aa] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>
                    <span className="text-[10px] text-[#6366f1] font-mono w-6">#{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.url}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                        Pending
                      </span>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Items */}
          {completedItems.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-3 text-[#a1a1aa] uppercase tracking-wider">
                Completed ({completedItems.length})
              </h2>
              <div className="space-y-1">
                {completedItems.map((item) => (
                  <div key={item.id} className="glass-card p-3 flex items-center gap-3 opacity-60">
                    <span className="text-[10px] text-[#10b981] font-mono w-6">&#10003;</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.url}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                      Done
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed Items */}
          {failedItems.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3 text-[#a1a1aa] uppercase tracking-wider">
                Failed ({failedItems.length})
              </h2>
              <div className="space-y-1">
                {failedItems.map((item) => (
                  <div key={item.id} className="glass-card p-3 flex items-center gap-3">
                    <span className="text-[10px] text-red-400 font-mono w-6">&#10007;</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.url}</p>
                      {item.error_message && (
                        <p className="text-[10px] text-red-400 truncate mt-0.5">{item.error_message}</p>
                      )}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                      Failed
                    </span>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-[#a1a1aa] hover:text-white"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
