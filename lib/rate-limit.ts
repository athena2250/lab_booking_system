import type { NextRequest } from "next/server";

/**
 * In-memory attempt counters, keyed by client IP.
 *
 * Resets on redeploy and isn't shared between serverless instances — good
 * enough to blunt a script on a school LAN, and not relied on for anything
 * else. Sign-in and sign-up each keep their own bucket so a burst of failed
 * passwords can't lock out someone creating their account.
 */

export type Limiter = {
  isLimited(ip: string): boolean;
  record(ip: string): void;
  clear(ip: string): void;
};

export function createLimiter(max: number, windowMs: number): Limiter {
  const hits = new Map<string, { count: number; firstAt: number }>();

  return {
    isLimited(ip) {
      const entry = hits.get(ip);
      if (!entry) return false;
      if (Date.now() - entry.firstAt > windowMs) {
        hits.delete(ip);
        return false;
      }
      return entry.count >= max;
    },

    record(ip) {
      const entry = hits.get(ip);
      if (!entry || Date.now() - entry.firstAt > windowMs) {
        hits.set(ip, { count: 1, firstAt: Date.now() });
        return;
      }
      entry.count += 1;
    },

    clear(ip) {
      hits.delete(ip);
    },
  };
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
