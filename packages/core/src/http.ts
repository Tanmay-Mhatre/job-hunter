export const VERSION = "0.1.0";

export function defaultUserAgent(): string {
  const repo = process.env.GITHUB_REPOSITORY;
  const home = repo ? `https://github.com/${repo}` : "self-hosted";
  return `JobHunter/${VERSION} (personal job radar; +${home})`;
}

export class HttpError extends Error {
  override name = "HttpError";
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export type HttpOptions = {
  userAgent?: string;
  timeoutMs?: number;
  /** Extra attempts after the first, for 429 / 5xx / network errors. */
  retries?: number;
  /** Minimum gap between two requests to the same host. */
  hostDelayMs?: number;
  /** First backoff wait; doubles each retry. */
  backoffMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Polite HTTP for connectors: identifying User-Agent, 30s timeout, per-host spacing,
 * retries with exponential backoff on 429 and 5xx (honouring Retry-After).
 */
export class HttpClient {
  private readonly opts: Required<HttpOptions>;
  /** Earliest time (ms) the next request to each host may start. */
  private readonly nextSlot = new Map<string, number>();

  constructor(opts: HttpOptions = {}) {
    this.opts = {
      userAgent: opts.userAgent ?? defaultUserAgent(),
      timeoutMs: opts.timeoutMs ?? 30_000,
      retries: opts.retries ?? 3,
      hostDelayMs: opts.hostDelayMs ?? 1_000,
      backoffMs: opts.backoffMs ?? 2_000,
      fetchImpl: opts.fetchImpl ?? fetch,
      sleep: opts.sleep ?? realSleep,
    };
  }

  async getJson<T = unknown>(url: string): Promise<T> {
    const res = await this.request(url, { headers: { accept: "application/json" } });
    return (await res.json()) as T;
  }

  async postJson<T = unknown>(url: string, body: unknown): Promise<T> {
    const res = await this.request(url, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  }

  async getText(url: string): Promise<string> {
    const res = await this.request(url, {});
    return res.text();
  }

  async request(url: string, init: RequestInit): Promise<Response> {
    const { retries, backoffMs, sleep } = this.opts;
    let lastError: HttpError | undefined;
    let retryAfterMs: number | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(retryAfterMs ?? backoffMs * 2 ** (attempt - 1));
      retryAfterMs = undefined;
      await this.waitForHost(url);
      let res: Response;
      try {
        res = await this.opts.fetchImpl(url, {
          ...init,
          headers: { "user-agent": this.opts.userAgent, ...(init.headers as Record<string, string>) },
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
      } catch (err) {
        const e = err as Error;
        const reason = e.name === "TimeoutError" ? `timed out after ${this.opts.timeoutMs / 1000}s` : e.message;
        lastError = new HttpError(`${reason} (${url})`, url);
        continue;
      }
      if (res.ok) return res;
      lastError = new HttpError(`HTTP ${res.status} (${url})`, url, res.status);
      if (res.status !== 429 && res.status < 500) throw lastError; // 4xx won't fix itself
      if (res.status === 429) retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
      await res.body?.cancel().catch(() => {});
    }
    throw lastError ?? new HttpError(`request failed (${url})`, url);
  }

  /** Reserve the next free slot for this host, then wait for it. Safe for parallel callers. */
  private async waitForHost(url: string): Promise<void> {
    const host = new URL(url).host;
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, slot + this.opts.hostDelayMs);
    if (slot > now) await this.opts.sleep(slot - now);
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, MAX_RETRY_AFTER_MS);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.min(Math.max(0, at - Date.now()), MAX_RETRY_AFTER_MS);
}
