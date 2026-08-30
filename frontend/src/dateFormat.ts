function format(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The V5 Brain has no onboard clock, so `recorded_at` is often absent.
 * Fall back to import time and say so, rather than showing nothing or a
 * silently wrong date. */
export function formatTestDate(recordedAt: string | null, importedAt: string | null): string {
  if (recordedAt) return format(recordedAt);
  if (importedAt) return `${format(importedAt)} (import time)`;
  return "Unknown date";
}
