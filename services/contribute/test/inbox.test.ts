import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

function fakeEnv(limitOk = true, extra: Partial<Env> = {}): Env & { store: Map<string, string> } {
  const store = new Map<string, string>();
  const kv = {
    put: async (k: string, v: string) => void store.set(k, v),
    get: async (k: string) => store.get(k) ?? null,
    delete: async (k: string) => void store.delete(k),
    list: async ({ prefix }: { prefix: string }) => ({
      keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
    }),
  };
  return { store, INBOX_TOKEN: "secret-token", LIMITER: { limit: async () => ({ success: limitOk }) }, INBOX: kv as unknown as Env["INBOX"], ...extra };
}
const call = (env: Env, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://inbox.test${path}`, init), env);
const post = (env: Env, path: string, body: unknown, headers: Record<string, string> = {}) => call(env, path, { method: "POST", body: JSON.stringify(body), headers });
/** The stored contributions (what the workflow sees), oldest first. */
const contributions = (env: { store: Map<string, string> }) =>
  [...env.store.entries()].filter(([k]) => k.startsWith("c:")).map(([, v]) => JSON.parse(v) as Record<string, unknown>);

describe("contribution inbox", () => {
  it("keeps valid boards only, deduplicated, with no user data", async () => {
    const env = fakeEnv();
    const res = await post(env, "/v1/contributions", {
      boards: [
        { ats: "lever", slug: "acme", name: "Acme <b>" },
        { ats: "lever", slug: "ACME" },
        { ats: "taleo", slug: "x" },
        { ats: "workday", slug: "bank" },
        { ats: "workday", slug: "bank", shard: "wd3", site: "External" },
        { ats: "lever", slug: "other", url: "https://tracker.example/?id=me", email: "me@example.com" },
      ],
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ received: 3, duplicates: 0 });
    const [stored] = contributions(env);
    expect(stored!.boards).toEqual([
      { ats: "lever", slug: "acme", name: "Acme b" },
      { ats: "workday", slug: "bank", shard: "wd3", site: "External" },
      { ats: "lever", slug: "other" },
    ]);
    expect(Object.keys(stored!).sort()).toEqual(["boards", "received_at"]);
  });

  it("keeps the client field only when it is the app name and version", async () => {
    const env = fakeEnv();
    await post(env, "/v1/contributions", { client: "job-hunter/0.1.0", boards: [{ ats: "lever", slug: "a" }] });
    await post(env, "/v1/contributions", { client: "job-hunter jane@example.com", boards: [{ ats: "lever", slug: "b" }] });
    await post(env, "/v1/contributions", { client: { id: 1 }, boards: [{ ats: "lever", slug: "c" }] });
    await post(env, "/v1/contributions", { client: "job-hunter", boards: [{ ats: "lever", slug: "d" }] });
    await post(env, "/v1/contributions", { client: "rawjobs/0.2.0", boards: [{ ats: "lever", slug: "e" }] });
    const bySlug = Object.fromEntries(contributions(env).map((s) => [(s.boards as { slug: string }[])[0]!.slug, s.client]));
    expect(bySlug).toEqual({ a: "job-hunter/0.1.0", b: undefined, c: undefined, d: "job-hunter", e: "rawjobs/0.2.0" });
  });

  it("skips boards already received this week", async () => {
    const env = fakeEnv();
    await post(env, "/v1/contributions", { boards: [{ ats: "lever", slug: "acme" }] });
    const again = await post(env, "/v1/contributions", { boards: [{ ats: "lever", slug: "Acme" }, { ats: "ashby", slug: "new" }] });
    expect(await again.json()).toEqual({ received: 1, duplicates: 1 });
    const only = await post(env, "/v1/contributions", { boards: [{ ats: "lever", slug: "acme" }] });
    expect(only.status).toBe(202);
    expect(await only.json()).toEqual({ received: 0, duplicates: 1 });
    expect(contributions(env)).toHaveLength(2);
  });

  it("stops accepting at the daily cap, all or nothing", async () => {
    const env = fakeEnv(true, { DAILY_CAP: "3" });
    expect((await post(env, "/v1/contributions", { boards: [{ ats: "lever", slug: "a" }, { ats: "lever", slug: "b" }] })).status).toBe(202);
    expect((await post(env, "/v1/contributions", { boards: [{ ats: "lever", slug: "c" }, { ats: "lever", slug: "d" }] })).status).toBe(429);
    expect((await post(env, "/v1/contributions", { boards: [{ ats: "lever", slug: "c" }] })).status).toBe(202);
    expect((await post(env, "/v1/contributions", { boards: [{ ats: "lever", slug: "e" }] })).status).toBe(429);
    expect(contributions(env)).toHaveLength(2);
  });

  it("rejects junk, oversize bodies and floods", async () => {
    const env = fakeEnv();
    expect((await post(env, "/v1/contributions", { boards: [{ ats: "lever", slug: "../etc" }] })).status).toBe(400);
    expect((await post(env, "/v1/contributions", null)).status).toBe(400);
    expect((await call(env, "/v1/contributions", { method: "POST", body: "x".repeat(30_000) })).status).toBe(413);
    expect((await post(fakeEnv(false), "/v1/contributions", { boards: [{ ats: "lever", slug: "a" }] })).status).toBe(429);
  });

  it("lists and acknowledges pending items only with the token", async () => {
    const env = fakeEnv();
    await post(env, "/v1/contributions", { boards: [{ ats: "ashby", slug: "kraken.com" }] });
    expect((await call(env, "/v1/pending")).status).toBe(401);
    const auth = { authorization: "Bearer secret-token" };
    const pending = (await (await call(env, "/v1/pending", { headers: auth })).json()) as { items: { id: string }[] };
    expect(pending.items).toHaveLength(1);
    expect(await (await post(env, "/v1/ack", { ids: [pending.items[0]!.id] }, auth)).json()).toEqual({ removed: 1 });
    expect(contributions(env)).toHaveLength(0);
  });
});
