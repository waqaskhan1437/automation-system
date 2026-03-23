export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString() + " at " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function getStatusColor(status: string): string {
  if (status === "success" || status === "completed") return "#10b981";
  if (status === "failed") return "#ef4444";
  if (status === "running" || status === "in_progress") return "#6366f1";
  return "#f59e0b";
}

export function getStatusIcon(conclusion: string | null, status: string): string {
  if (conclusion === "success") return "\u2713";
  if (conclusion === "failure") return "\u2717";
  if (status === "in_progress") return "\u27F3";
  return "\u25CB";
}

export function calculateProgress(steps: Array<{ conclusion: string | null }>): number {
  if (!steps.length) return 0;
  const done = steps.filter((s) => s.conclusion === "success").length;
  return Math.round((done / steps.length) * 100);
}

export function parseJsonSafe<T>(jsonString: string | null | undefined, fallback: T): T {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return fallback;
  }
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
