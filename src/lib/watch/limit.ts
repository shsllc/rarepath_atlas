/** Small per-key, per-minute limiter for this server instance (watch actions and feed polls). */
const hits = new Map<string, number[]>();

export function allow(key: string, perMinute: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) for (const [k, v] of hits) if (v.every((t) => now - t >= 60_000)) hits.delete(k);
  return true;
}
