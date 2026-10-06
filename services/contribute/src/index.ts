/**
 * Job Hunter contribution inbox (Cloudflare Worker).
 *
 * Apps send the company boards their users added with "Add by link". The inbox only checks the
 * shape and keeps them; the directory workflow pulls them, live-checks each board, adds good ones
 * to the shared list and acknowledges what it processed. No accounts, no personal data: a board
 * is a hiring system, a slug and a name.
 *
 *   POST /v1/contributions   { client?, boards: [{ ats, slug, region?, shard?, site?, name? }] }  (public)
 *   GET  /v1/pending         list waiting contributions                                     (Bearer INBOX_TOKEN)
 *   POST /v1/ack             { ids: [...] } remove processed contributions                   (Bearer INBOX_TOKEN)
 */

export interface Env {
  INBOX: KVNamespace;
  /** Workers rate limiting binding; optional so local dev works without it. */
  LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  INBOX_TOKEN: string;
}

type Board = { ats: string; slug: string; region?: string; shard?: string; site?: string; name?: string };

const SCANNABLE = new Set(["greenhouse", "lever", "ashby", "smartrecruiters", "workday"]);
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const MAX_BODY = 20_000;
const MAX_BOARDS = 25;
const KEEP_DAYS = 30;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The board as stored, or null when it isn't a board we could ever scan. */
function clean(b: unknown): Board | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  if (typeof o.ats !== "string" || !SCANNABLE.has(o.ats)) return null;
  if (typeof o.slug !== "string" || !SLUG.test(o.slug)) return null;
  if (o.ats === "workday" && !(typeof o.shard === "string" && /^wd\d{1,3}$/.test(o.shard) && typeof o.site === "string" && SLUG.test(o.site))) return null;
  const name = typeof o.name === "string" ? o.name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 100) : "";
  return {
    ats: o.ats,
    slug: o.slug,
    ...(o.region === "eu" ? { region: "eu" } : {}),
    ...(o.ats === "workday" ? { shard: o.shard as string, site: o.site as string } : {}),
    ...(name ? { name } : {}),
  };
}

/** Constant-time comparison for the workflow's token. */
function authorized(req: Request, env: Env): boolean {
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const want = env.INBOX_TOKEN ?? "";
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

async function contribute(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) return json({ error: "Too many requests, try again in a minute." }, 429);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: "Request too large." }, 413);
  let body: { boards?: unknown[] };
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }
  const seen = new Set<string>();
  const boards: Board[] = [];
  for (const raw of (Array.isArray(body.boards) ? body.boards : []).slice(0, MAX_BOARDS)) {
    const b = clean(raw);
    const key = b && `${b.ats}:${b.slug}|${b.shard ?? ""}|${b.site ?? ""}`.toLowerCase();
    if (!b || !key || seen.has(key)) continue;
    seen.add(key);
    boards.push(b);
  }
  if (!boards.length) return json({ error: "No boards we can use." }, 400);
  // No IP or user data is stored: only the boards and when they arrived.
  const id = `c:${Date.now()}:${crypto.randomUUID()}`;
  await env.INBOX.put(id, JSON.stringify({ boards, received_at: new Date().toISOString() }), { expirationTtl: KEEP_DAYS * 86_400 });
  return json({ received: boards.length }, 202);
}

async function pending(env: Env): Promise<Response> {
  const list = await env.INBOX.list({ prefix: "c:", limit: 500 });
  const items = await Promise.all(
    list.keys.map(async (k) => {
      const value = await env.INBOX.get(k.name);
      return value ? { id: k.name, ...(JSON.parse(value) as { boards: Board[]; received_at: string }) } : null;
    }),
  );
  return json({ items: items.filter(Boolean), more: !list.list_complete });
}

async function ack(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string" && x.startsWith("c:")).slice(0, 1000);
  await Promise.all(ids.map((id) => env.INBOX.delete(id)));
  return json({ removed: ids.length });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    try {
      if (req.method === "POST" && pathname === "/v1/contributions") return await contribute(req, env);
      if (req.method === "GET" && pathname === "/v1/pending") return authorized(req, env) ? await pending(env) : json({ error: "Unauthorized" }, 401);
      if (req.method === "POST" && pathname === "/v1/ack") return authorized(req, env) ? await ack(req, env) : json({ error: "Unauthorized" }, 401);
      if (req.method === "GET" && pathname === "/") return new Response("Job Hunter contribution inbox. POST /v1/contributions\n", { headers: { "content-type": "text/plain" } });
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  },
};
