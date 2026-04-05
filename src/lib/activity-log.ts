/**
 * Client-side activity log for sync, enrich, and compute events.
 * Stored in localStorage so it persists across page navigations.
 * Max 50 entries, oldest pruned automatically.
 */

export interface ActivityEntry {
  id: string;
  type: "sync" | "enrich" | "compute" | "import" | "error";
  message: string;
  detail?: string;
  timestamp: number; // Date.now()
}

const STORAGE_KEY = "activity_log";
const MAX_ENTRIES = 50;

export function getActivityLog(): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addActivityEntry(entry: Omit<ActivityEntry, "id" | "timestamp">): void {
  if (typeof window === "undefined") return;
  const log = getActivityLog();
  log.unshift({
    ...entry,
    id: Math.random().toString(36).slice(2, 10),
    timestamp: Date.now(),
  });
  // Prune old entries
  if (log.length > MAX_ENTRIES) log.length = MAX_ENTRIES;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch { /* ignore */ }
}

export function clearActivityLog(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
