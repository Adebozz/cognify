// lib/rateLimit.ts
// 6 real-AI calls per IP per day (= 2 full 3-phase sessions) on the server key.
// Uses the Upstash Redis REST API directly (no SDK dependency) in production;
// falls back to in-memory for local dev (per-instance, resets on redeploy).

const LIMIT = Number(process.env.RATE_LIMIT_PER_DAY ?? "6");
const DAY_S = 24 * 60 * 60;
const DAY_MS = DAY_S * 1000;

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // epoch ms
};

// ---- Upstash REST (fixed daily window: INCR + EXPIRE on first hit) ----

async function upstashLimit(key: string): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    // Pipeline: INCR key; EXPIRE key 86400 NX (set TTL only when first created)
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(DAY_S), "NX"],
        ["TTL", key],
      ]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);

    const data = (await res.json()) as Array<{ result: number }>;
    const count = Number(data[0]?.result ?? 0);
    const ttl = Number(data[2]?.result ?? DAY_S);
    const resetAt = Date.now() + Math.max(ttl, 0) * 1000;

    return {
      success: count <= LIMIT,
      remaining: Math.max(LIMIT - count, 0),
      limit: LIMIT,
      resetAt,
    };
  } catch (err) {
    // Redis outage should not take the feature down — allow the request.
    console.error("[rateLimit] Upstash error, allowing request:", err);
    return { success: true, remaining: 0, limit: LIMIT, resetAt: Date.now() + DAY_MS };
  }
}

// ---- in-memory fallback (local dev only) ----

const memory = new Map<string, number[]>();

function memoryLimit(key: string): RateLimitResult {
  const now = Date.now();
  const hits = (memory.get(key) ?? []).filter((t) => now - t < DAY_MS);
  if (hits.length >= LIMIT) {
    return { success: false, remaining: 0, limit: LIMIT, resetAt: hits[0] + DAY_MS };
  }
  hits.push(now);
  memory.set(key, hits);
  return { success: true, remaining: LIMIT - hits.length, limit: LIMIT, resetAt: now + DAY_MS };
}

/**
 * Check + consume one rate-limit slot for this IP.
 * BYOK requests should skip this entirely (caller's responsibility).
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const viaUpstash = await upstashLimit(`cognify:rl:${ip}`);
  if (viaUpstash) return viaUpstash;

  if (process.env.NODE_ENV === "production") {
    console.warn("[rateLimit] Upstash not configured in production — using in-memory fallback.");
  }
  return memoryLimit(ip);
}

/** Extract the client IP from a Next.js Request (Vercel sets x-forwarded-for). */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
