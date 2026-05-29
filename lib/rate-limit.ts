interface RateLimitOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  const now = options.now ?? Date.now;

  return {
    check(key: string): RateLimitResult {
      const current = now();
      const existing = buckets.get(key);
      const bucket =
        existing && existing.resetAt > current
          ? existing
          : { count: 0, resetAt: current + options.windowMs };

      if (bucket.count >= options.limit) {
        buckets.set(key, bucket);
        return {
          allowed: false,
          limit: options.limit,
          remaining: 0,
          resetAt: bucket.resetAt,
          retryAfterSeconds: Math.ceil((bucket.resetAt - current) / 1000),
        };
      }

      bucket.count += 1;
      buckets.set(key, bucket);

      return {
        allowed: true,
        limit: options.limit,
        remaining: Math.max(0, options.limit - bucket.count),
        resetAt: bucket.resetAt,
        retryAfterSeconds: 0,
      };
    },
  };
}

export function clientIdFromRequest(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
