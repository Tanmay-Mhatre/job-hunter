import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HttpClient } from "../src/http";
import { ProfileSchema, type CompanyRef, type Profile } from "../src/schema";

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8"));
}

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** HttpClient backed by a fake fetch; no waiting, records every URL requested. */
export function fakeHttp(route: Route) {
  const calls: string[] = [];
  const http = new HttpClient({
    hostDelayMs: 0,
    sleep: async () => {},
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      return route(url, init);
    }) as typeof fetch,
  });
  return { http, calls };
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const company = (ats: CompanyRef["ats"], extra: Partial<CompanyRef> = {}): CompanyRef => ({
  name: "Acme",
  ats,
  slug: "acme",
  enabled: true,
  ...extra,
});

export const profile = (overrides: Record<string, unknown> = {}): Profile =>
  ProfileSchema.parse({
    titles: { include: ["product manager", "head of product"], exclude: ["product marketing", "associate"] },
    seniority_boost: ["senior", "head", "group"],
    locations: {
      include: ["dubai", "abu dhabi", "uae", "united arab emirates"],
      remote_ok: ["emea", "remote"],
      remote_exclude: ["us", "united states", "canada"],
    },
    keywords: { crypto: 5, tokenization: 5, stablecoin: 4, exchange: 4, payments: 3, fintech: 3, ai: 3, kyc: 2 },
    min_score: 70,
    ...overrides,
  });
