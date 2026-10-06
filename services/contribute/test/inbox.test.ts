import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

function fakeEnv(limitOk = true): Env & { store: Map<string, string> } {
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
  return { store, INBOX_TOKEN: "secret-token", LIMITER: { limit: async () => ({ success: limitOk }) }, INBOX: kv as unknown as Env["INBOX"] };
}
const call = (env: Env, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://inbox.test${path}`, init), env);
const post = (env: Env, path: string, body: unknown, headers: Record<string, string> = {}) => call(env, path, { method: "POST", body: JSON.stringify(body), headers });

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
      ],
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ received: 2 });
    const stored = JSON.parse([...env.store.values()][0]!);
    expect(stored.boards).toEqual([
      { ats: "lever", slug: "acme", name: "Acme b" },
      { ats: "workday", slug: "bank", shard: "wd3", site: "External" },
    ]);
    expect(Object.keys(stored).sort()).toEqual(["boards", "received_at"]);
  });

  it("rejects junk, oversize bodies and floods", async () => {
    const env = fakeEnv();
    expect((await post(env, "/v1/contributions", { boards: [{ ats: "lever", slug: "../etc" }] })).status).toBe(400);
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
    expect(env.store.size).toBe(0);
  });
});
