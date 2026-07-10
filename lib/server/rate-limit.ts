// In-memory sliding-window rate limiter. Good enough for a single-process,
// self-hosted deployment (matches how lib/server/price-catalog.ts caches);
// it resets on process restart and doesn't share state across instances,
// which is an acceptable tradeoff here rather than a schema migration for a
// dedicated attempts table.
type Bucket = {
  failures: number;
  windowStart: number;
  lockedUntil: number;
};

const MAX_TRACKED_KEYS = 5000;
const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
};

export function isRateLimited(key: string): number | null {
  const bucket = buckets.get(key);
  if (!bucket || bucket.lockedUntil <= Date.now()) {
    return null;
  }
  return Math.ceil((bucket.lockedUntil - Date.now()) / 1000);
}

export function recordFailedAttempt(key: string, options: RateLimitOptions): void {
  const now = Date.now();
  const existing = buckets.get(key);
  const bucket =
    existing && now - existing.windowStart <= options.windowMs
      ? existing
      : { failures: 0, windowStart: now, lockedUntil: 0 };

  bucket.failures += 1;
  if (bucket.failures >= options.maxAttempts) {
    bucket.lockedUntil = now + options.lockoutMs;
  }

  if (!buckets.has(key) && buckets.size >= MAX_TRACKED_KEYS) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey !== undefined) {
      buckets.delete(oldestKey);
    }
  }
  buckets.set(key, bucket);
}

export function clearAttempts(key: string): void {
  buckets.delete(key);
}

// `x-forwarded-for`/`x-real-ip` are only trustworthy when a reverse proxy
// you control sets them itself, overwriting whatever a client sent. Exposed
// directly to the internet (no proxy in front), a remote attacker can put
// any value in those headers on a raw HTTP request and rotate it per
// request, making IP-keyed rate limits a no-op. Default to *not* trusting
// them; set TRUST_PROXY_HEADERS=true only once there's a proxy (nginx,
// Caddy, Traefik, a cloud load balancer) sitting in front that guarantees
// it, never passing through a client-supplied value.
const TRUST_PROXY_HEADERS = process.env.TRUST_PROXY_HEADERS === "true";

export function getClientIp(request: Request): string {
  if (!TRUST_PROXY_HEADERS) {
    // No trusted proxy: every direct connection shares one bucket. That's
    // strictly safe (can't be spoofed to bypass the limit) and, for a
    // single-user app, has no real downside — real users don't hammer their
    // own login/register endpoint.
    return "direct";
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // With exactly one trusted proxy in front (Caddy/nginx/Traefik), each
    // hop *appends* its own observed peer to this header rather than
    // prepending — so the last entry is the one *our* proxy appended,
    // trustworthy. The first entry can still be anything a client chose to
    // send in their original request and must not be trusted.
    const parts = forwardedFor.split(",").map((part) => part.trim());
    return parts[parts.length - 1] || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
