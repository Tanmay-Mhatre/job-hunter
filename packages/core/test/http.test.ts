import { describe, expect, it } from "vitest";
import { HttpClient } from "../src/http";
import { json } from "./helpers";

function client(responses: (Response | Error)[], extra: { sleeps?: number[] } = {}) {
  const seen: { url: string; ua: string | undefined }[] = [];
  const http = new HttpClient({
    userAgent: "test-agent",
    hostDelayMs: 0,
    backoffMs: 100,
    sleep: async (ms) => void extra.sleeps?.push(ms),
    fetchImpl: (async (url: string, init?: RequestInit) => {
      seen.push({ url, ua: (init?.headers as Record<string, string>)["user-agent"] });
      const next = responses.shift();
      if (!next) throw new Error("no more responses");
      if (next instanceof Error) throw next;
      return next;
    }) as typeof fetch,
  });
  return { http, seen };
}

describe("HttpClient", () => {
  it("sends an identifying User-Agent", async () => {
    const { http, seen } = client([json({ ok: 1 })]);
    await expect(http.getJson("https://a.example/x")).resolves.toEqual({ ok: 1 });
    expect(seen[0]!.ua).toBe("test-agent");
  });

  it("retries 429 and 5xx with backoff, honouring Retry-After", async () => {
    const sleeps: number[] = [];
    const { http, seen } = client(
      [new Response("", { status: 429, headers: { "retry-after": "3" } }), new Response("", { status: 503 }), json([1])],
      { sleeps },
    );
    await expect(http.getJson("https://a.example/x")).resolves.toEqual([1]);
    expect(seen).toHaveLength(3);
    expect(sleeps).toEqual([3000, 200]);
  });

  it("retries network errors, then gives up with the last error", async () => {
    const { http, seen } = client([new Error("ECONNRESET"), new Error("ECONNRESET"), new Error("ECONNRESET"), new Error("ECONNRESET")]);
    await expect(http.getJson("https://a.example/x")).rejects.toThrow(/ECONNRESET/);
    expect(seen).toHaveLength(4);
  });

  it("does not retry other 4xx", async () => {
    const { http, seen } = client([new Response("", { status: 404 })]);
    await expect(http.getJson("https://a.example/x")).rejects.toMatchObject({ status: 404 });
    expect(seen).toHaveLength(1);
  });

  it("spaces requests to the same host", async () => {
    const sleeps: number[] = [];
    const http = new HttpClient({
      hostDelayMs: 1000,
      sleep: async (ms) => void sleeps.push(ms),
      fetchImpl: (async () => json({})) as unknown as typeof fetch,
    });
    await Promise.all([http.getJson("https://a.example/1"), http.getJson("https://a.example/2"), http.getJson("https://b.example/1")]);
    // First call to each host goes straight away; the second a.example call waits ~1s.
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThan(900);
  });
});
