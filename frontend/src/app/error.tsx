"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: 48, textAlign: "center" }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          backgroundColor: "rgba(239,68,68,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
        }}
      >
        <svg width="32" height="32" style={{ color: "#ef4444" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "white", marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ color: "#a1a1aa", marginBottom: 24, fontSize: 14 }}>{error.message || "An unexpected error occurred"}</p>
      <button
        onClick={reset}
        style={{
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          border: "none",
          borderRadius: 12,
          color: "white",
          padding: "10px 24px",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Try again
      </button>
    </div>
  );
}
