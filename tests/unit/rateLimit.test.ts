import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// rateLimit.ts reads env + keeps in-memory state at module load, so each test
// gets a fresh copy of the module.
async function loadRateLimit() {
  vi.resetModules();
  return import("@/lib/rateLimit");
}

describe("in-memory rate limiter (no Upstash configured)", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("RATE_LIMIT_PER_DAY", "3");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T09:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit then blocks", async () => {
    const { checkRateLimit } = await loadRateLimit();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit("1.1.1.1"));
    expect(results.map((r) => r.success)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
  });

  it("tracks each IP separately", async () => {
    const { checkRateLimit } = await loadRateLimit();
    for (let i = 0; i < 3; i++) await checkRateLimit("1.1.1.1");
    expect((await checkRateLimit("1.1.1.1")).success).toBe(false);
    expect((await checkRateLimit("2.2.2.2")).success).toBe(true);
  });

  it("frees slots after 24 hours", async () => {
    const { checkRateLimit } = await loadRateLimit();
    for (let i = 0; i < 3; i++) await checkRateLimit("1.1.1.1");
    const blocked = await checkRateLimit("1.1.1.1");
    expect(blocked.success).toBe(false);
    expect(blocked.resetAt).toBe(new Date("2026-09-21T09:00:00Z").getTime());

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect((await checkRateLimit("1.1.1.1")).success).toBe(true);
  });
});

describe("Upstash rate limiter", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "secret-token");
    vi.stubEnv("RATE_LIMIT_PER_DAY", "6");
  });

  function mockUpstash(count: number, ttl = 3600) {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ result: count }, { result: 1 }, { result: ttl }]), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends an INCR/EXPIRE NX/TTL pipeline with the bearer token", async () => {
    const fetchMock = mockUpstash(1);
    const { checkRateLimit } = await loadRateLimit();
    await checkRateLimit("9.9.9.9");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://redis.example/pipeline");
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(init.body)).toEqual([
      ["INCR", "cognify:rl:9.9.9.9"],
      ["EXPIRE", "cognify:rl:9.9.9.9", "86400", "NX"],
      ["TTL", "cognify:rl:9.9.9.9"],
    ]);
  });

  it.each([
    [1, true, 5],
    [6, true, 0],
    [7, false, 0],
  ])("count %i → success=%s, remaining=%i", async (count, success, remaining) => {
    mockUpstash(count);
    const { checkRateLimit } = await loadRateLimit();
    expect(await checkRateLimit("9.9.9.9")).toMatchObject({ success, remaining, limit: 6 });
  });

  it("fails open when Redis is down, so an outage doesn't break the app", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const { checkRateLimit } = await loadRateLimit();
    expect((await checkRateLimit("9.9.9.9")).success).toBe(true);
  });

  it("fails open on a non-2xx Redis response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    const { checkRateLimit } = await loadRateLimit();
    expect((await checkRateLimit("9.9.9.9")).success).toBe(true);
  });
});

describe("getClientIp", () => {
  it.each([
    [{ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }, "203.0.113.5"],
    [{ "x-real-ip": "198.51.100.7" }, "198.51.100.7"],
    [{}, "unknown"],
  ])("headers %j → %s", async (headers, expected) => {
    const { getClientIp } = await loadRateLimit();
    expect(getClientIp(new Request("http://localhost/api", { headers }))).toBe(expected);
  });
});
