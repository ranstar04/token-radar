// Token Radar's model (radar-3): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// rankable pre-token protocol below the watchlist floor: the early rows the radar exists to find. A
// protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol);
// the snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed
// into the ranked board.
//
// Implied value is a comparables model, computed from the snapshot's own figures only. No protocol
// name is ever special-cased: the same function scores every row.
//
//   multiple     = the category's median market-cap-to-TVL ratio among the snapshot's live-token
//                  protocols (at least 3 comparables), shrunk toward its family median; a thin
//                  category uses its family median, shrunk toward the snapshot-wide median; a
//                  category with no family uses the snapshot-wide median. Each ratio is clamped
//                  to [0.05, 1.50] first. A lending protocol is priced like lending protocols
//                  trade, a bridge like bridges trade.
//   base         = tvl_usd x multiple
//   growth       = clamp(change_7d, -50, +100) per cent
//   growthMult   = 1 + 0.35 x growth / 100 when growth is positive,
//                  1 + 0.70 x growth / 100 when it is negative (falls hurt twice as much)
//   maturity     = 0.70 + 0.50 x min(age_days, 730) / 730 up to 1.20 at two years, then
//                  1.20 - 0.25 x min(age_days - 730, 1460) / 1460 down to 0.95 (old launches
//                  stop getting more valuable for waiting); age unknown: 0.90
//   breadth      = 1 + 0.02 x min(max(chains - 1, 0), 5)
//   implied      = max(1, round(base x growthMult x maturity x breadth))
//
// Each row also carries its P10-P90 range (the same multipliers applied to the 10th and 90th
// percentile of the comparables actually used), a confidence factor from the level and the count
// of comparables, and a farm-economics verdict: the launch is assumed to airdrop 2% of the
// implied value, split among a rough farmer count by TVL tier and discounted by confidence,
// against setup gas, $2 a week for the hold and the hours spent valued at $10 an hour. Net
// >= +$10 is FARM, <= -$10 is SKIP, anything between is THIN.
//
// The model is backtested, leave-one-out, over the snapshot's own traded tokens: each token is
// priced by the same formula with itself removed from the comparables and compared against its
// real market cap, next to a flat baseline that prices every token off the single global median.
//
// The constants are stated in the dashboard's method section, and the page recomputes every row
// from the same figures, so the board, the screenshots and the code visibly agree.

/** The snapshot's protocol entry: exactly the eleven fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist: string[];
  protocols: SnapshotProtocol[];
}

export type MultipleSource = 'category' | 'family' | 'global';

/** One category's comparable multiple, for the dashboard's method table. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  comparables: number;
  fallback: boolean;
}

/** One family's comparable multiple: the median across its member categories. */
export interface FamilyMultiple {
  family: string;
  multiple: number;
  comparables: number;
  categories: string[];
}

/** Where one category's multiple came from, and the range around it. */
export interface MultipleResolution {
  multiple: number;
  multiple_lo: number;
  multiple_hi: number;
  comparables: number;
  fallback: boolean;
  source: MultipleSource;
  level: string;
}

export interface ModelConstants {
  growth_weight: number;
  growth_negative_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  maturity_decline: number;
  maturity_decline_days: number;
  unknown_age_multiplier: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  multiple_floor: number;
  multiple_cap: number;
  min_comparables: number;
  shrink_k: number;
  airdrop_pool_share: number;
  time_value_per_hour: number;
  gas_setup_high: number;
  gas_setup_low: number;
  gas_weekly: number;
  verdict_farm_min: number;
  verdict_skip_max: number;
}

export interface FarmEconomics {
  capital_usd: number;
  fee_usd: number;
  hold_days: number;
  work_hours: number;
  ev_usd: number;
  net_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    multiple_lo: number;
    multiple_hi: number;
    comparables: number;
    multiple_source: MultipleSource;
    multiple_level: string;
    confidence: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
    implied_lo_usd: number;
    implied_hi_usd: number;
    capital_usd: number;
    fee_usd: number;
    hold_days: number;
    work_hours: number;
    ev_usd: number;
    net_usd: number;
    verdict: 'FARM' | 'THIN' | 'SKIP';
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  multiple_lo: number;
  multiple_hi: number;
  multiple_source: MultipleSource;
  multiple_level: string;
  comparables: number;
  confidence: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  implied_lo_usd: number;
  implied_hi_usd: number;
  capital_usd: number;
  fee_usd: number;
  hold_days: number;
  work_hours: number;
  ev_usd: number;
  net_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The leave-one-out backtest over the snapshot's own traded tokens. */
export interface BacktestSummary {
  n: number;
  median_miss: number;
  within_3x_pct: number;
  within_2x_pct: number;
  flat_median_miss: number;
  flat_within_3x_pct: number;
  fit_slope: number;
  fit_intercept: number;
  points: [number, number][];
}

/** Everything the dashboard needs: the board, the live set, the multiples and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  watchlist: string[];
  global_multiple: number;
  multiples: CategoryMultiple[];
  families: FamilyMultiple[];
  backtest: BacktestSummary;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

export const MODEL: ModelConstants = {
  growth_weight: 0.35,
  growth_negative_weight: 0.7,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.5,
  maturity_days: 730,
  maturity_decline: 0.25,
  maturity_decline_days: 1460,
  unknown_age_multiplier: 0.9,
  breadth_per_chain: 0.02,
  breadth_max_chains: 5,
  multiple_floor: 0.05,
  multiple_cap: 1.5,
  min_comparables: 3,
  shrink_k: 3,
  airdrop_pool_share: 0.02,
  time_value_per_hour: 10,
  gas_setup_high: 8,
  gas_setup_low: 4,
  gas_weekly: 2,
  verdict_farm_min: 10,
  verdict_skip_max: -10,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

// Families group categories that trade the same way, so a thin category
// borrows its family's price instead of falling straight to the global
// median. A category not listed here has no family and falls back to the
// snapshot-wide median directly.
export const FAMILIES: Record<string, string[]> = {
  Lending: ['Lending', 'CDP', 'Collateral Management', 'Leveraged Farming'],
  Yield: ['Yield', 'Yield Aggregator', 'Farm', 'Liquidity Manager'],
  Staking: ['Liquid Staking', 'Restaking', 'Liquid Restaking', 'Staking Pool'],
  Trading: ['Dexs', 'Derivatives', 'Options', 'Prediction Market', 'Basis Trading'],
  Bridges: ['Bridge', 'Canonical Bridge', 'Cross Chain Bridge'],
  'Real Assets': ['RWA', 'Dual-Token Stablecoin'],
  Allocators: ['Onchain Capital Allocator', 'Risk Curators', 'Indexes', 'Token Locker', 'Governance Incentives'],
};

export function familyOf(category: string | null): string | null {
  if (!category) return null;
  for (const [family, members] of Object.entries(FAMILIES)) {
    if (members.includes(category)) return family;
  }
  return null;
}

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted-or-not list, or null when empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The p-th percentile of a list, linearly interpolated. */
export function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  if (s.length === 1) return s[0]!;
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

export function fmtPct(x: number): string {
  return `${x > 0 ? '+' : ''}${x.toFixed(1)}%`;
}

export function fmtNet(n: number): string {
  return n >= 0 ? `+$${Math.round(n)}` : `-$${Math.round(-n)}`;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export interface MultiplesTable {
  global: number;
  globalRatios: number[];
  byCategory: Map<string, CategoryMultiple>;
  byFamily: Map<string, FamilyMultiple>;
  ratiosByCategory: Map<string, number[]>;
  ratiosByFamily: Map<string, number[]>;
}

/** The comparables table: every live-token category's median market-cap-to-TVL ratio, plus family medians. */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): MultiplesTable {
  const byCat = new Map<string, number[]>();
  const byFam = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = clamp(p.mcap_usd / p.tvl_usd, model.multiple_floor, model.multiple_cap);
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(ratio);
    byCat.set(key, list);
    const fam = familyOf(p.category);
    if (fam) {
      const flist = byFam.get(fam) ?? [];
      flist.push(ratio);
      byFam.set(fam, flist);
    }
  }
  const globalRaw = median(all) ?? 0.2;
  const global = clamp(globalRaw, model.multiple_floor, model.multiple_cap);
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [cat, ratios] of byCat) {
    if (ratios.length >= model.min_comparables) {
      const m = median(ratios)!;
      byCategory.set(cat, {
        category: cat,
        multiple: clamp(m, model.multiple_floor, model.multiple_cap),
        comparables: ratios.length,
        fallback: false,
      });
    }
  }
  const byFamily = new Map<string, FamilyMultiple>();
  for (const [fam, ratios] of byFam) {
    if (ratios.length >= model.min_comparables) {
      const m = median(ratios)!;
      byFamily.set(fam, {
        family: fam,
        multiple: clamp(m, model.multiple_floor, model.multiple_cap),
        comparables: ratios.length,
        categories: FAMILIES[fam]!,
      });
    }
  }
  return { global, globalRatios: all, byCategory, byFamily, ratiosByCategory: byCat, ratiosByFamily: byFam };
}

function shrink(base: number, parent: number, n: number, model: ModelConstants): number {
  const w = n / (n + model.shrink_k);
  return w * base + (1 - w) * parent;
}

export function confidenceFor(source: MultipleSource, n: number): number {
  if (source === 'category') return round2(0.7 + 0.3 * (Math.min(n, 10) / 10));
  if (source === 'family') return round2(0.45 + 0.25 * (Math.min(n, 10) / 10));
  return 0.35;
}

// Resolve the multiple for one category through the hierarchy, with
// shrinkage toward the parent level. Returns the multiple actually used,
// its P10-P90 range, and which level supplied it.
export function multipleFor(
  category: string | null,
  table: MultiplesTable,
  model: ModelConstants = MODEL,
): MultipleResolution {
  const cat = category ?? 'Other';
  const catEntry = table.byCategory.get(cat);
  if (catEntry) {
    const fam = familyOf(category);
    const parent = fam && table.byFamily.get(fam) ? table.byFamily.get(fam)!.multiple : table.global;
    const ratios = table.ratiosByCategory.get(cat)!;
    const multiple = round4(shrink(catEntry.multiple, parent, catEntry.comparables, model));
    return {
      multiple,
      multiple_lo: round4(clamp(percentile(ratios, 0.1), model.multiple_floor, model.multiple_cap)),
      multiple_hi: round4(clamp(percentile(ratios, 0.9), model.multiple_floor, model.multiple_cap)),
      comparables: catEntry.comparables,
      fallback: false,
      source: 'category',
      level: cat,
    };
  }
  const fam = familyOf(category);
  const famEntry = fam ? table.byFamily.get(fam) : undefined;
  if (famEntry) {
    const ratios = table.ratiosByFamily.get(fam!)!;
    const multiple = round4(shrink(famEntry.multiple, table.global, famEntry.comparables, model));
    return {
      multiple,
      multiple_lo: round4(clamp(percentile(ratios, 0.1), model.multiple_floor, model.multiple_cap)),
      multiple_hi: round4(clamp(percentile(ratios, 0.9), model.multiple_floor, model.multiple_cap)),
      comparables: famEntry.comparables,
      fallback: true,
      source: 'family',
      level: fam!,
    };
  }
  return {
    multiple: table.global,
    multiple_lo: round4(clamp(percentile(table.globalRatios, 0.1), model.multiple_floor, model.multiple_cap)),
    multiple_hi: round4(clamp(percentile(table.globalRatios, 0.9), model.multiple_floor, model.multiple_cap)),
    comparables: 0,
    fallback: true,
    source: 'global',
    level: 'global',
  };
}

export function growthMult(growthPct: number, model: ModelConstants = MODEL): number {
  const g = clamp(growthPct, model.growth_floor, model.growth_cap);
  const w = g >= 0 ? model.growth_weight : model.growth_negative_weight;
  return 1 + (w * g) / 100;
}

export function maturityMult(age: number | null, model: ModelConstants = MODEL): number {
  if (age === null) return model.unknown_age_multiplier;
  if (age <= model.maturity_days) {
    return model.maturity_floor + model.maturity_range * (age / model.maturity_days);
  }
  const over = Math.min(age - model.maturity_days, model.maturity_decline_days);
  return model.maturity_floor + model.maturity_range - model.maturity_decline * (over / model.maturity_decline_days);
}

export function breadthMult(chains: number, model: ModelConstants = MODEL): number {
  return 1 + model.breadth_per_chain * Math.min(Math.max(chains - 1, 0), model.breadth_max_chains);
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

export function farmersFor(tvl: number): number {
  if (tvl >= 1e9) return 100000;
  if (tvl >= 1e8) return 40000;
  return 10000;
}

// The farm economics, stated as assumptions so a reader can re-price
// them: the launch airdrops 2% of the implied value, split among a
// rough farmer count by TVL tier, discounted by how sure the price is.
// Costs are setup gas plus $2 a week for the hold, and the hours spent
// are valued at $10 an hour.
export function econFor(tvl: number, implied: number, confidence: number, holdDays: number, capital: number, model: ModelConstants = MODEL): FarmEconomics {
  const weeks = Math.ceil(holdDays / 7);
  const gas = (capital >= 150 ? model.gas_setup_high : model.gas_setup_low) + model.gas_weekly * weeks;
  const hours = round2(0.25 + 0.17 * weeks + 0.17);
  const ev = round2((implied * model.airdrop_pool_share * confidence) / farmersFor(tvl));
  const fee = gas + round2(hours * model.time_value_per_hour);
  const net = round2(ev - fee);
  const verdict: FarmEconomics['verdict'] = net >= model.verdict_farm_min ? 'FARM' : net <= model.verdict_skip_max ? 'SKIP' : 'THIN';
  return { capital_usd: capital, fee_usd: fee, hold_days: holdDays, work_hours: hours, ev_usd: ev, net_usd: net, verdict };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  table: MultiplesTable,
  model: ModelConstants = MODEL,
): {
  implied: number;
  multiple: number;
  multiple_lo: number;
  multiple_hi: number;
  comparables: number;
  fallback: boolean;
  source: MultipleSource;
  level: string;
  confidence: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
  implied_lo: number;
  implied_hi: number;
  econ: FarmEconomics;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const res = multipleFor(protocol.category, table, model);
  // The multiple is rounded to 4 decimals before use, so the dashboard's recomputation from the
  // board's own figures lands on the same whole dollar the model wrote.
  const multiple = round4(res.multiple);
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const gMult = growthMult(growthPct, model);
  const mMult = maturityMult(age, model);
  const bMult = breadthMult(protocol.chains.length, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * gMult * mMult * bMult));
  const impliedLo = Math.max(1, Math.round(protocol.tvl_usd * res.multiple_lo * gMult * mMult * bMult));
  const impliedHi = Math.max(1, Math.round(protocol.tvl_usd * res.multiple_hi * gMult * mMult * bMult));
  const confidence = confidenceFor(res.source, res.comparables);
  const capital = capitalFor(protocol.tvl_usd);
  const econ = econFor(protocol.tvl_usd, implied, confidence, holdDaysFor(age), capital, model);
  return {
    implied,
    multiple,
    multiple_lo: res.multiple_lo,
    multiple_hi: res.multiple_hi,
    comparables: res.comparables,
    fallback: res.fallback,
    source: res.source,
    level: res.level,
    confidence,
    growthPct,
    growthMult: gMult,
    maturityMult: mMult,
    breadthMult: bMult,
    age,
    implied_lo: impliedLo,
    implied_hi: impliedHi,
    econ,
  };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave the deposit earning for the full hold.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
  if (c.includes('yield') || c.includes('yield aggregator')) return `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and let the yield compound.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then put the bridged funds to work in its app.`;
  if (c.includes('restak')) return `Restake $${capital} of the liquid staking token through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('staking') || c.includes('liquid staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one market position on ${name}, then leave the market to settle.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} curated vault on ${chain} and keep the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it through the month.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain} and keep the account funded.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('cede') || c.includes('central')) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the balance earning.`;
  if (c.includes('chain') || c.includes('infrastructure')) return `Bridge $${capital} of USDC to the chain ${name} serves and use it in one app there.`;
  if (c.includes('govern')) return `Deposit $${capital} into ${name}'s vault on ${chain} and vote in one governance round.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, matched to the category. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'a supply top-up, a borrow, or a repay';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'a swap, a liquidity rebalance, or a fee claim';
  if (c.includes('bridge') || c.includes('cross chain')) return 'a small bridge, or a swap on the destination chain';
  if (c.includes('staking') || c.includes('restak')) return 'a stake top-up, or a reward claim';
  if (c.includes('perpetual') || c.includes('derivative')) return 'a small trade, or a funding-fee claim';
  if (c.includes('yield')) return 'a vault deposit, or a reward harvest';
  if (c.includes('govern')) return 'a vote, or a proposal comment';
  return 'a deposit, a swap, or a vote';
}

/**
 * A protocol's farm plan: the steps are derived from the protocol's own record (category, chains,
 * TVL, age, growth) and from the model's own verdict, never from a hand-written list of names.
 * The weekly step follows the 7-day growth; a multi-chain protocol gets a bridge step; the last
 * step follows the verdict, so two rows with the same value but different certainty farm
 * differently.
 */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  v?: ReturnType<typeof impliedValue>,
): FarmStep[] {
  const chain = chainOf(p);
  const capital = v ? v.econ.capital_usd : capitalFor(p.tvl_usd);
  const hold = v ? v.econ.hold_days : holdDaysFor(age);
  const fee = v ? v.econ.fee_usd : 18;
  const net = v ? v.econ.net_usd : 0;
  const verdict = v ? v.econ.verdict : 'THIN';
  const growthPct = v ? v.growthPct : clamp(finite(p.change_7d, 0), MODEL.growth_floor, MODEL.growth_cap);
  const weekly = weeklyActionFor(p);
  let action = actionFor(p, capital, chain);
  if (v && v.source === 'family') {
    action += ` The comparables for this category are thin (no direct category price; the value is priced from the ${v.level} family, ${v.comparables} live tokens), so treat the implied value as a rough range — the P10–P90 range on this row is the honest one.`;
  } else if (v && v.source === 'global') {
    action += ` There are no direct comparables for this category at all (the value is priced from the snapshot-wide median), so treat the implied value as a rough range — the P10–P90 range on this row is the honest one.`;
  }
  const steps: FarmStep[] = [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about $${fee} of fees and time in total`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text:
        growthPct < 0
          ? `Do one small qualifying action each week, such as ${weekly}, and stop there: while TVL is falling, do not add capital — a shrinking protocol pays its airdrop to the few who stayed, not to the most recent depositors.`
          : growthPct > 10
            ? `Do one qualifying action each week, such as ${weekly}, and add a small top-up while growth holds above 10%: rising TVL is the model's strongest signal that the launch will be worth farming.`
            : `Do one qualifying action each week, such as ${weekly}, so the wallet stays active.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
  ];
  if (p.chains.length > 3) {
    steps.push({
      text: `Bridge $${Math.round(capital / 2)} of USDC to each of the other ${p.chains.length - 1} chains the protocol runs on, so the position is live on every chain before the snapshot — some launches weight multi-chain users.`,
      cost: `$${Math.round(capital / 2)} of USDC per chain, plus bridge gas`,
      time: '20 minutes',
    });
  }
  steps.push(
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text:
        verdict === 'FARM'
          ? `Write the wallet, the dates and every transaction in a farm log, then farm on schedule: at an expected net of about ${fmtNet(net)} the row clears its costs with room to spare.`
          : verdict === 'THIN'
            ? `Write the wallet, the dates and every transaction in a farm log, then deploy only half the capital first: at an expected net of about ${fmtNet(net)} the row barely clears its costs, so keep the rest back until the next snapshot still shows growth.`
            : `Do not deploy capital now: at an expected net of about ${fmtNet(net)} this row does not clear its costs. Write the row in the log and re-check the board in 30 days — the value only moves if TVL, growth or the comparables move.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  );
  return steps;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const table = categoryMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor, by TVL. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, table, model);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: round4(s.v.multiple),
      multiple_lo: s.v.multiple_lo,
      multiple_hi: s.v.multiple_hi,
      comparables: s.v.comparables,
      multiple_source: s.v.source,
      multiple_level: s.v.level,
      confidence: s.v.confidence,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      breadth_multiplier: round4(s.v.breadthMult),
      age_days: s.v.age,
      implied_lo_usd: s.v.implied_lo,
      implied_hi_usd: s.v.implied_hi,
      capital_usd: s.v.econ.capital_usd,
      fee_usd: s.v.econ.fee_usd,
      hold_days: s.v.econ.hold_days,
      work_hours: s.v.econ.work_hours,
      ev_usd: s.v.econ.ev_usd,
      net_usd: s.v.econ.net_usd,
      verdict: s.v.econ.verdict,
    },
    farm_steps: farmSteps(s.p, s.v.age, s.v).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    multiple_lo: row.model.multiple_lo,
    multiple_hi: row.model.multiple_hi,
    multiple_source: row.model.multiple_source,
    multiple_level: row.model.multiple_level,
    comparables: row.model.comparables,
    confidence: row.model.confidence,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    implied_lo_usd: row.model.implied_lo_usd,
    implied_hi_usd: row.model.implied_hi_usd,
    capital_usd: row.model.capital_usd,
    fee_usd: row.model.fee_usd,
    hold_days: row.model.hold_days,
    work_hours: row.model.work_hours,
    ev_usd: row.model.ev_usd,
    net_usd: row.model.net_usd,
    verdict: row.model.verdict,
  };
}

// Leave-one-out backtest over the snapshot's own traded tokens: each
// token is priced by the same formula, with itself removed from the
// comparables, and compared against its real market cap. The flat
// baseline prices every token off the single global median, so the
// reader can see what the hierarchy and the multipliers add.
export function backtest(snapshot: Snapshot, model: ModelConstants = MODEL): BacktestSummary {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const ratios: number[] = [];
  const flatRatios: number[] = [];
  const points: [number, number][] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of live) {
    const rest: Snapshot = { ...snapshot, protocols: snapshot.protocols.filter((q) => q.slug !== p.slug) };
    const table = categoryMultiples(rest, model);
    const v = impliedValue(p, snapshot.as_of, table, model);
    ratios.push(v.implied / p.mcap_usd!);
    const flat = Math.max(1, Math.round(p.tvl_usd * table.global * v.growthMult * v.maturityMult * v.breadthMult));
    flatRatios.push(flat / p.mcap_usd!);
    const x = Math.log10(p.tvl_usd);
    const y = Math.log10(p.mcap_usd!);
    points.push([round2(x), round2(y)]);
    xs.push(x);
    ys.push(y);
  }
  const miss = (rs: number[]) => median(rs.map((r) => Math.max(r, 1 / r))) ?? 0;
  const within = (rs: number[], k: number) => (rs.filter((r) => r >= 1 / k && r <= k).length / rs.length) * 100;
  const n = live.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const cov = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0);
  const varx = xs.reduce((a, x) => a + (x - mx) * (x - mx), 0);
  const slope = varx === 0 ? 1 : cov / varx;
  const intercept = my - slope * mx;
  return {
    n,
    median_miss: round2(miss(ratios)),
    within_3x_pct: round2(within(ratios, 3)),
    within_2x_pct: round2(within(ratios, 2)),
    flat_median_miss: round2(miss(flatRatios)),
    flat_within_3x_pct: round2(within(flatRatios, 3)),
    fit_slope: round2(slope),
    fit_intercept: round2(intercept),
    points,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const table = categoryMultiples(snapshot, model);
  const back = backtest(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const multiples: CategoryMultiple[] = [...table.byCategory.values()]
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const families: FamilyMultiple[] = [...table.byFamily.values()]
    .sort((a, b) => b.multiple - a.multiple || (a.family < b.family ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    watchlist: [...snapshot.watchlist],
    global_multiple: round4(table.global),
    multiples,
    families,
    backtest: back,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
