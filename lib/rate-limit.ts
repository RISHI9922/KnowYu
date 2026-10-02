import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { env } from "./env";

const redis = new Redis({
  url: env.upstashRedisUrl,
  token: env.upstashRedisToken,
});

export const chatLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
});

export const ingestLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(2, "60 s"),
});

export const healthLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "60 s"),
});

export interface RateLimitMetadata {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export function rateLimitHeaders(
  result: RateLimitMetadata,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.reset / 1_000)),
  };

  if (!result.success) {
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1_000);
    headers["Retry-After"] = String(Math.max(1, retryAfter));
  }

  return headers;
}
