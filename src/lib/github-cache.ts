// Pure helpers for reasoning about cache age and staleness.
// Persistent cache reads/writes live in the Rust app-data layer.

export function ageMillis(fetchedAt: string | null | undefined): number | null {
  if (!fetchedAt) return null;
  const value = new Date(fetchedAt).getTime();
  if (Number.isNaN(value)) return null;
  return Math.max(0, Date.now() - value);
}

export function isStale(
  fetchedAt: string | null | undefined,
  maxAgeMs: number,
): boolean {
  const age = ageMillis(fetchedAt);
  return age === null || age > maxAgeMs;
}

export function describeAge(fetchedAt: string | null | undefined): string {
  const age = ageMillis(fetchedAt);
  if (age === null) return "no data";
  if (age < 1_000) return "just now";
  if (age < 60_000) return `${Math.round(age / 1_000)}s ago`;
  if (age < 3_600_000) return `${Math.round(age / 60_000)}m ago`;
  if (age < 86_400_000) return `${Math.round(age / 3_600_000)}h ago`;
  return `${Math.round(age / 86_400_000)}d ago`;
}
