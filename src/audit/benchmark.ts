import seed from "../../data/seed_prices.json" with { type: "json" };
import type { Benchmark } from "./types.js";

// CMS "Medicare Physician & Other Practitioners – by Geography and Service", 2024 data.
const CMS_DATASET_URL = "https://data.cms.gov/data-api/v1/dataset/0c75b0b3-b40f-4007-a5ac-f9f2fed95862/data";
export const CMS_DATA_YEAR = 2024;

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** One CMS row: a code in a state, in one place of service (F = facility, O = office). */
export interface CmsRow {
  code: string;
  state: string;
  placeOfService: "F" | "O";
  description: string;
  avgSubmitted: number;
  avgAllowed: number;
  avgPayment: number;
  totalServices: number;
  dataYear: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Live CMS lookup. Used on cache misses and by scripts/seed-prices.ts. */
export async function fetchCmsRows(code: string, state: string): Promise<CmsRow[]> {
  const geo = STATE_NAMES[state];
  if (!geo) return [];
  const url = new URL(CMS_DATASET_URL);
  url.searchParams.set("filter[Rndrng_Prvdr_Geo_Desc]", geo);
  url.searchParams.set("filter[HCPCS_Cd]", code);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`CMS ${res.status} for ${code}/${state}`);
  const rows = (await res.json()) as Record<string, string>[];
  return rows.map((r) => ({
    code: r.HCPCS_Cd,
    state,
    placeOfService: r.Place_Of_Srvc === "F" ? "F" : "O",
    description: r.HCPCS_Desc,
    avgSubmitted: round2(Number(r.Avg_Sbmtd_Chrg)),
    avgAllowed: round2(Number(r.Avg_Mdcr_Alowd_Amt)),
    avgPayment: round2(Number(r.Avg_Mdcr_Pymt_Amt)),
    totalServices: Number(r.Tot_Srvcs),
    dataYear: CMS_DATA_YEAR,
  }));
}

/** Collapses a code's F/O rows into one conservative benchmark (the higher submitted charge). */
export function toBenchmark(rows: CmsRow[]): Benchmark | undefined {
  if (rows.length === 0) return undefined;
  const top = rows.reduce((a, b) => (b.avgSubmitted > a.avgSubmitted ? b : a));
  return {
    code: top.code,
    state: top.state,
    avgSubmitted: top.avgSubmitted,
    avgAllowed: top.avgAllowed,
    avgPayment: top.avgPayment,
    placeOfService: top.placeOfService,
    dataYear: top.dataYear,
    description: top.description,
  };
}

/** Raw rows for a code in a state — the visit-level rule needs the facility-setting row specifically. */
export function seededRows(code: string, state: string): CmsRow[] {
  return (seed as CmsRow[]).filter((r) => r.code === code && r.state === state);
}

export interface PriceCache {
  get(code: string, state: string): Promise<CmsRow[] | undefined>;
  put(code: string, state: string, rows: CmsRow[]): Promise<void>;
}

/**
 * Cache-first lookup: seed file → price cache (Supabase) → live CMS API.
 * The demo bill's codes are all seeded, so no network call happens on stage.
 */
export async function lookupBenchmarks(
  codes: string[],
  state: string,
  cache?: PriceCache,
): Promise<Map<string, Benchmark>> {
  const out = new Map<string, Benchmark>();
  await Promise.all(
    [...new Set(codes)].map(async (code) => {
      let rows = seededRows(code, state);
      if (rows.length === 0 && cache) rows = (await cache.get(code, state)) ?? [];
      if (rows.length === 0) {
        try {
          rows = await fetchCmsRows(code, state);
          if (cache) await cache.put(code, state, rows);
        } catch (err) {
          console.warn("[benchmark] CMS lookup failed", code, state, err);
        }
      }
      const b = toBenchmark(rows);
      if (b) out.set(code, b);
    }),
  );
  return out;
}
