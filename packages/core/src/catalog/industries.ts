import { matchesAny } from "../text";

/**
 * Industries a person can work in and a company can be in. No AI: companies are tagged from
 * source lists (aliases), from their job titles (terms), or by hand (seed list); people pick
 * theirs, prefilled from their resume (terms).
 */
export type Industry = {
  id: string;
  label: string;
  /** Words that signal the industry in job titles and resumes (whole words). */
  terms: string[];
  /** Topic keywords worth adding to a profile in this industry. */
  topics: string[];
  /** Labels other lists use for it (curated segments, crypto-jobs categories). */
  aliases?: string[];
  /** Tag companies from their job titles. Off for words common in every industry (e.g. "compliance"). */
  fromTitles?: boolean;
  /** Only infer from titles when the company already has this industry (e.g. an exchange is a crypto company first). */
  requires?: string;
};

export const INDUSTRIES: Industry[] = [
  {
    id: "crypto",
    label: "Crypto & Web3",
    terms: ["crypto", "cryptocurrency", "web3", "blockchain", "defi", "bitcoin", "ethereum", "onchain", "on-chain", "stablecoin", "stablecoins", "nft", "solana", "token"],
    topics: ["crypto", "web3", "blockchain", "defi", "stablecoin", "wallet"],
    aliases: ["crypto", "web3", "crypto infrastructure", "ecosystem"],
    fromTitles: true,
  },
  {
    id: "crypto-exchange",
    label: "Crypto exchange",
    terms: ["crypto exchange", "cryptocurrency exchange", "spot trading", "futures", "perpetuals", "perps", "p2p", "copy trading", "margin trading", "derivatives", "listing", "listings"],
    topics: ["exchange", "trading", "futures", "derivatives", "p2p", "crypto"],
    aliases: ["crypto exchange"],
    fromTitles: true,
    requires: "crypto",
  },
  {
    id: "brokerage",
    label: "Brokerage, CFD & FX",
    // Not "broker" (insurance/mortgage brokers), "fx" (FX payment firms) or "affiliates" (any partner programme).
    terms: ["brokerage", "cfd", "cfds", "forex", "mt4", "mt5", "metatrader", "dealing desk", "retail trading", "online trading", "introducing broker", "prop firm"],
    topics: ["trading", "brokerage", "cfd", "forex", "mt5", "metatrader"],
    aliases: ["brokerage"],
    fromTitles: true,
  },
  {
    id: "trading-tech",
    label: "Trading technology",
    terms: ["trading platform", "trading systems", "trading technology", "order management", "oms", "execution management", "low latency", "market data", "matching engine", "fix protocol", "algorithmic trading", "electronic trading"],
    topics: ["trading platform", "market data", "low latency", "order management"],
    aliases: ["trading tech"],
    fromTitles: true,
  },
  {
    id: "market-making",
    label: "Market making & prop trading",
    terms: ["market making", "market maker", "quantitative trading", "quant trader", "quantitative researcher", "proprietary trading", "prop trading", "liquidity provider", "hft", "trader"],
    topics: ["market making", "liquidity", "quantitative trading"],
    aliases: ["market making"],
    fromTitles: true,
  },
  {
    id: "digital-assets",
    label: "Digital assets & custody",
    terms: ["custody", "digital assets", "digital asset", "institutional crypto", "prime brokerage", "staking"],
    topics: ["custody", "digital assets", "staking"],
    aliases: ["digital assets", "custody"],
    fromTitles: true,
  },
  {
    id: "tokenization",
    label: "Tokenization & RWA",
    terms: ["tokenization", "tokenisation", "rwa", "real world assets", "real-world assets", "tokenized", "tokenised", "security tokens"],
    topics: ["tokenization", "rwa", "real world assets"],
    aliases: ["tokenization"],
    fromTitles: true,
  },
  {
    id: "payments",
    label: "Payments",
    terms: ["payments", "payment", "acquiring", "issuing", "checkout", "remittance", "cross border", "cross-border", "merchant", "card issuing", "payouts", "money movement"],
    topics: ["payments", "acquiring", "issuing", "checkout", "merchant", "remittance"],
    aliases: ["payments", "stablecoins"],
    fromTitles: true,
  },
  {
    id: "digital-bank",
    label: "Digital bank / neobank",
    terms: ["neobank", "digital bank", "digital banking", "challenger bank", "mobile banking"],
    topics: ["neobank", "digital banking", "mobile app"],
    aliases: ["digital bank"],
    fromTitles: true,
  },
  {
    id: "banking",
    label: "Banking",
    terms: ["banking", "retail banking", "corporate banking", "core banking", "treasury", "open banking", "transaction banking"],
    topics: ["banking", "open banking", "treasury"],
    aliases: ["bank", "open banking"],
    fromTitles: true,
  },
  {
    id: "wealth",
    label: "Wealth & investing",
    terms: ["wealth", "wealth management", "investing", "investment app", "robo advisor", "robo-advisor", "asset management", "portfolio management", "brokerage account"],
    topics: ["wealth", "investing", "asset management"],
    aliases: ["wealth", "investment"],
    fromTitles: true,
  },
  {
    id: "lending",
    label: "Lending & BNPL",
    terms: ["lending", "loans", "bnpl", "buy now pay later", "underwriting", "mortgage", "mortgages", "credit risk"],
    topics: ["lending", "bnpl", "credit"],
    aliases: ["lending", "bnpl"],
    fromTitles: true,
  },
  {
    id: "fintech",
    label: "Fintech (general)",
    terms: ["fintech", "financial technology", "financial services", "financial products"],
    topics: ["fintech"],
    aliases: ["fintech", "super app"],
    fromTitles: true,
  },
  {
    id: "regtech",
    label: "Regtech & financial crime",
    terms: ["regtech", "kyc", "aml", "financial crime", "sanctions", "fraud prevention", "transaction monitoring"],
    topics: ["kyc", "aml", "compliance", "fraud"],
    aliases: ["regtech", "regulator / free zone"],
  },
  {
    id: "insurtech",
    label: "Insurance & insurtech",
    terms: ["insurance", "insurtech", "claims", "policyholder", "reinsurance"],
    topics: ["insurance", "insurtech"],
    aliases: ["insurtech", "insurance"],
    fromTitles: true,
  },
  {
    id: "ai",
    label: "AI & machine learning",
    terms: ["ai", "machine learning", "ml", "llm", "llms", "genai", "generative ai", "deep learning", "computer vision", "nlp"],
    topics: ["ai", "machine learning", "llm", "genai"],
    aliases: ["ai"],
    fromTitles: true,
  },
  {
    id: "ecommerce",
    label: "E-commerce & marketplaces",
    terms: ["e-commerce", "ecommerce", "marketplace", "quick commerce", "q-commerce", "retail media", "grocery", "food delivery"],
    topics: ["e-commerce", "marketplace", "checkout", "conversion"],
    aliases: ["e-commerce", "foodtech", "marketplace"],
    fromTitles: true,
  },
  {
    id: "gaming",
    label: "Gaming & betting",
    terms: ["gaming", "igaming", "betting", "sportsbook", "casino", "esports", "game"],
    topics: ["gaming", "igaming", "betting"],
    aliases: ["gaming"],
    fromTitles: true,
  },
  {
    id: "proptech",
    label: "Real estate & proptech",
    terms: ["proptech", "real estate", "property", "mortgage broker"],
    topics: ["real estate", "proptech"],
    aliases: ["proptech"],
    fromTitles: true,
  },
  {
    id: "mobility",
    label: "Mobility & logistics",
    terms: ["mobility", "ride hailing", "logistics", "fleet", "last mile", "supply chain", "freight"],
    topics: ["logistics", "mobility"],
    aliases: ["mobility", "logistics"],
    fromTitles: true,
  },
  {
    id: "travel",
    label: "Travel & hospitality",
    terms: ["travel", "hospitality", "booking", "airline", "hotel", "hotels"],
    topics: ["travel", "booking"],
    aliases: ["travel"],
    fromTitles: true,
  },
  {
    id: "healthtech",
    label: "Health & healthtech",
    terms: ["healthtech", "healthcare", "clinical", "patient", "telehealth", "pharmacy", "medical"],
    topics: ["healthcare", "healthtech"],
    aliases: ["healthtech", "health"],
    fromTitles: true,
  },
  {
    id: "edtech",
    label: "Education & edtech",
    terms: ["edtech", "education", "learning platform", "students", "tutoring"],
    topics: ["edtech", "education"],
    aliases: ["edtech"],
    fromTitles: true,
  },
  {
    id: "cybersecurity",
    label: "Cybersecurity",
    terms: ["cybersecurity", "cyber security", "security operations", "threat intelligence", "identity and access", "zero trust"],
    topics: ["security", "identity"],
    aliases: ["cybersecurity", "security"],
    fromTitles: true,
  },
  {
    id: "devtools",
    label: "Developer tools & data",
    terms: ["developer tools", "devtools", "developer platform", "data platform", "observability", "api platform", "sdk"],
    topics: ["developer platform", "api", "data platform"],
    aliases: ["devtools", "data"],
    fromTitles: true,
  },
  {
    id: "media",
    label: "Media & consumer apps",
    terms: ["streaming", "media", "creator", "creators", "social", "content", "music", "video"],
    topics: ["consumer", "creator", "streaming"],
    aliases: ["media", "consumer"],
  },
];

export const INDUSTRY_BY_ID = new Map(INDUSTRIES.map((i) => [i.id, i]));

/** Taxonomy ids for a label from another list ("crypto exchange" -> crypto + crypto-exchange). Unknown -> []. */
export function industriesForLabel(label: string | undefined): string[] {
  const l = label?.toLowerCase().trim();
  if (!l) return [];
  const ids = INDUSTRY_BY_ID.has(l) ? [l] : INDUSTRIES.filter((i) => i.label.toLowerCase() === l || i.aliases?.includes(l)).map((i) => i.id);
  // An exchange or custodian is a crypto company too.
  if (ids.some((id) => ["crypto-exchange", "digital-assets", "tokenization"].includes(id)) && !ids.includes("crypto")) ids.unshift("crypto");
  return ids;
}

/**
 * Industries a company's job titles point to: at least 8% of the titles (and at least 2) mention
 * the industry's terms. Industries with `requires` need that industry already (from `known` or titles).
 */
export function industriesFromTitles(titles: readonly string[], known: readonly string[] = []): string[] {
  if (titles.length === 0) return [];
  const min = Math.max(2, Math.ceil(titles.length * 0.08));
  const found: string[] = [];
  for (const ind of INDUSTRIES) {
    if (!ind.fromTitles) continue;
    let hits = 0;
    for (const t of titles) if (matchesAny(t, ind.terms) && ++hits >= min) break;
    if (hits >= min) found.push(ind.id);
  }
  const have = new Set([...known, ...found]);
  return found.filter((id) => {
    const req = INDUSTRY_BY_ID.get(id)!.requires;
    return !req || have.has(req);
  });
}

/** Industries a resume mentions at least twice (whole words), most mentioned first. */
export function industriesFromText(text: string, minMentions = 2): string[] {
  const lower = text.toLowerCase();
  const counts = INDUSTRIES.map((ind) => {
    let n = 0;
    for (const term of ind.terms) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]+")}(?![\\p{L}\\p{N}])`, "giu");
      n += lower.match(re)?.length ?? 0;
    }
    return [ind.id, n] as const;
  });
  return counts
    .filter(([, n]) => n >= minMentions)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}
