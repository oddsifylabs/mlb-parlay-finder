import { NextResponse } from 'next/server';
import { impliedFromAmerican, Leg, makeParlays, ParlayMode } from '../../../lib/parlay';

const CORE_MARKETS = [
  'h2h',
  'spreads',
  'totals',
  'batter_home_runs',
  'batter_hits',
  'batter_total_bases',
  'batter_rbis',
  'batter_runs_scored',
  'batter_hits_runs_rbis',
  'batter_singles',
  'batter_doubles',
  'batter_walks',
  'batter_strikeouts',
  'batter_stolen_bases',
  'pitcher_strikeouts',
  'pitcher_record_a_win',
  'pitcher_hits_allowed',
  'pitcher_walks',
  'pitcher_earned_runs',
  'pitcher_outs'
];

export const MARKET_GROUPS = {
  pitcher: ['pitcher_strikeouts','pitcher_outs','pitcher_hits_allowed','pitcher_earned_runs','pitcher_walks','pitcher_record_a_win'],
  hitter: ['batter_hits','batter_total_bases','batter_hits_runs_rbis','batter_rbis','batter_runs_scored','batter_home_runs','batter_singles','batter_doubles','batter_walks','batter_strikeouts','batter_stolen_bases'],
  game: ['h2h','spreads','totals']
};

const ALTERNATE_MARKETS = [
  'batter_total_bases_alternate',
  'batter_home_runs_alternate',
  'batter_hits_alternate',
  'batter_rbis_alternate',
  'batter_walks_alternate',
  'batter_strikeouts_alternate',
  'batter_runs_scored_alternate',
  'batter_hits_runs_rbis_alternate',
  'batter_singles_alternate',
  'batter_doubles_alternate',
  'batter_triples_alternate',
  'pitcher_hits_allowed_alternate',
  'pitcher_walks_alternate',
  'pitcher_earned_runs_alternate',
  'pitcher_strikeouts_alternate',
  'pitcher_outs_alternate'
];

type OddsOutcome = { name: string; description?: string; price: number; point?: number };
type OddsMarket = { key: string; outcomes: OddsOutcome[] };
type OddsBookmaker = { key: string; title: string; markets: OddsMarket[] };
type OddsEvent = {
  id: string;
  commence_time?: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsBookmaker[];
};

type PricedOutcome = {
  bookmakerKey: string;
  marketKey: string;
  groupKey: string;
  outcomeKey: string;
  price: number;
};

const ODDSIFY_MODEL_VERSION = 'Oddsify Props Deep Dive v1';

const MARKET_MODEL: Record<string, { rank: number; category: string; softness: 'Very High' | 'High' | 'Medium' | 'Low'; evCeiling: 'Very High' | 'High' | 'Medium-High' | 'Medium' | 'Low'; weight: number; reasons: string[] }> = {
  pitcher_strikeouts: { rank: 1, category: 'Pitcher Strikeouts', softness: 'Medium', evCeiling: 'Very High', weight: 1.00, reasons: ['Pitcher-first prop: workload sustainability controls strikeout ceiling', 'Uses consensus price as baseline, then prioritizes K markets with real edge'] },
  pitcher_strikeouts_alternate: { rank: 1, category: 'Pitcher Strikeouts', softness: 'Medium', evCeiling: 'Very High', weight: 0.90, reasons: ['Alternate K lines have higher variance; require a larger market edge'] },
  batter_total_bases: { rank: 2, category: 'Hitter Total Bases', softness: 'Medium', evCeiling: 'High', weight: 0.94, reasons: ['Total bases captures extra-base upside and contact quality signal', 'Best used with park/pitcher context when available'] },
  batter_total_bases_alternate: { rank: 2, category: 'Hitter Total Bases', softness: 'Medium', evCeiling: 'High', weight: 0.84, reasons: ['Alternate total-base lines are correlated and volatile; model discounts them'] },
  pitcher_outs: { rank: 3, category: 'Pitcher Outs Recorded', softness: 'High', evCeiling: 'High', weight: 1.08, reasons: ['Soft board: books often lag pitch-count, efficiency, and bullpen hook trends', 'Pitcher-first workload market gets a model boost when DK is mispriced'] },
  pitcher_outs_alternate: { rank: 3, category: 'Pitcher Outs Recorded', softness: 'High', evCeiling: 'High', weight: 0.96, reasons: ['Alternate outs line; still soft, but discounted for line variance'] },
  batter_hits: { rank: 4, category: 'Hitter Hits', softness: 'Medium', evCeiling: 'Medium-High', weight: 0.92, reasons: ['Contact prop: useful for consistency plays when consensus supports edge'] },
  batter_hits_alternate: { rank: 4, category: 'Hitter Hits', softness: 'Medium', evCeiling: 'Medium-High', weight: 0.82, reasons: ['Alternate hit lines are harder to cash; model requires stronger edge'] },
  batter_home_runs: { rank: 5, category: 'Home Run', softness: 'Medium', evCeiling: 'High', weight: 0.78, reasons: ['HR props are high-variance Poisson-style markets; model discounts parlays unless edge is large'] },
  batter_home_runs_alternate: { rank: 5, category: 'Home Run', softness: 'Medium', evCeiling: 'High', weight: 0.70, reasons: ['Alternate HR prop; extreme variance, heavily discounted'] },
  batter_hits_runs_rbis: { rank: 6, category: 'Hits + Runs + RBIs', softness: 'High', evCeiling: 'Medium-High', weight: 1.04, reasons: ['Combo stat often priced lazily against lineup role', 'Leadoff/cleanup context matters; consensus edge gets a small boost'] },
  batter_hits_runs_rbis_alternate: { rank: 6, category: 'Hits + Runs + RBIs', softness: 'High', evCeiling: 'Medium-High', weight: 0.92, reasons: ['Alternate H+R+RBI line; correlated with other hitter props'] },
  pitcher_earned_runs: { rank: 7, category: 'Pitcher Earned Runs', softness: 'Medium', evCeiling: 'High', weight: 0.96, reasons: ['Regression market: actual ERA vs expected quality matters when supplied'] },
  pitcher_earned_runs_alternate: { rank: 7, category: 'Pitcher Earned Runs', softness: 'Medium', evCeiling: 'High', weight: 0.86, reasons: ['Alternate earned-runs line discounted for volatility'] },
  batter_stolen_bases: { rank: 8, category: 'Stolen Bases', softness: 'High', evCeiling: 'Medium', weight: 1.02, reasons: ['Niche prop: books are often generic on attempt/catcher/pitcher timing context'] },
  batter_stolen_bases_alternate: { rank: 8, category: 'Stolen Bases', softness: 'High', evCeiling: 'Medium', weight: 0.90, reasons: ['Alternate stolen-base line; niche but volatile'] },
  pitcher_walks: { rank: 9, category: 'Pitcher Walks', softness: 'Very High', evCeiling: 'Medium', weight: 1.10, reasons: ['Very soft command market: public rarely prices BB/9, zone rate, chase rate', 'Model gives walk props priority when the DK edge is real'] },
  pitcher_walks_alternate: { rank: 9, category: 'Pitcher Walks', softness: 'Very High', evCeiling: 'Medium', weight: 0.98, reasons: ['Alternate walks line; soft market but more volatile'] }
};

function modelForMarket(marketKey: string) {
  return MARKET_MODEL[marketKey] || { rank: 99, category: marketKey.replaceAll('_', ' '), softness: 'Low' as const, evCeiling: 'Low' as const, weight: 0.85, reasons: ['Market is not in the Oddsify top-nine prop stack; consensus edge only'] };
}

function adjustedFairProbability(marketKey: string, consensusFair: number, impliedProbability: number): number {
  const model = modelForMarket(marketKey);
  const rawEdge = consensusFair - impliedProbability;
  if (rawEdge <= 0) return consensusFair;
  const adjustedEdge = rawEdge * model.weight;
  return Math.max(0.01, Math.min(0.97, impliedProbability + adjustedEdge));
}

function clvConfidence(edge: number, marketKey: string, minutesUntilStart?: number): 'High' | 'Medium' | 'Low' {
  const model = modelForMarket(marketKey);
  const softBoost = model.softness === 'Very High' || model.softness === 'High';
  if (minutesUntilStart !== undefined && minutesUntilStart <= 15) return 'Low';
  if (edge >= 0.035 && softBoost) return 'High';
  if (edge >= 0.025) return 'High';
  if (edge >= 0.012) return 'Medium';
  return 'Low';
}

function quarterKellyFraction(probability: number, americanPrice: number): number {
  const decimal = americanPrice > 0 ? 1 + americanPrice / 100 : 1 + 100 / Math.abs(americanPrice);
  const b = decimal - 1;
  if (b <= 0) return 0;
  const fullKelly = (probability * b - (1 - probability)) / b;
  return Math.max(0, Math.min(0.02, fullKelly * 0.25));
}

function mockLegs(): Leg[] {
  const names = ['Shohei Ohtani hits Over 1.5','Aaron Judge total bases Over 1.5','Tarik Skubal strikeouts Over 6.5','Yankees moneyline','Dodgers -1.5','Mets/Braves Over 8.5','Juan Soto RBIs Over 0.5','Corbin Burnes strikeouts Over 5.5','Red Sox moneyline','Phillies team total Over 4.5'];
  return names.map((selection, i) => {
    const price = [-115, 125, -105, -135, 145, -110, 160, 105, -120, 115][i];
    const impliedProbability = impliedFromAmerican(price);
    const fairProbability = Math.min(0.72, impliedProbability + [0.03,0.02,0.04,0.01,0.05,0.02,0.06,0.03,0.01,0.02][i]);
    return { id: `mock-${i}`, event: ['LAD @ SF','NYY @ BOS','DET @ CLE','NYM @ ATL'][i % 4], market: i < 7 ? 'player_prop' : 'game_prop', selection, price, impliedProbability, fairProbability, edge: fairProbability - impliedProbability, source: 'mock' };
  });
}

function normalizePoint(point?: number): string {
  return point === undefined ? '' : String(point);
}

function sideKey(outcome: OddsOutcome): string {
  return `${outcome.name}|${normalizePoint(outcome.point)}`;
}

function groupKey(eventId: string, marketKey: string, outcome: OddsOutcome): string {
  // Player props use description as the player name. Game markets often omit it.
  const subject = outcome.description || 'game';
  const point = marketKey === 'h2h' ? '' : normalizePoint(outcome.point);
  return `${eventId}|${marketKey}|${subject}|${point}`;
}

function legId(eventId: string, marketKey: string, outcome: OddsOutcome): string {
  return `${groupKey(eventId, marketKey, outcome)}|${sideKey(outcome)}`;
}

function selectionLabel(marketKey: string, outcome: OddsOutcome): string {
  const subject = outcome.description ? `${outcome.description} ` : '';
  if (marketKey === 'h2h') return `${outcome.name} moneyline`;
  if (marketKey === 'spreads') return `${outcome.name} ${outcome.point !== undefined && outcome.point > 0 ? '+' : ''}${outcome.point}`;
  if (marketKey === 'totals') return `Game total ${outcome.name} ${outcome.point ?? ''}`.trim();
  if (outcome.point !== undefined) return `${subject}${marketKey.replaceAll('_', ' ')} ${outcome.name} ${outcome.point}`;
  return `${subject}${marketKey.replaceAll('_', ' ')} ${outcome.name}`;
}

function uniqueLegs(legs: Leg[]): Leg[] {
  const seen = new Set<string>();
  return legs.filter(leg => {
    const key = `${leg.id}:${leg.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueParlays<T extends { legs: Leg[] }>(parlays: T[]): T[] {
  const seen = new Set<string>();
  return parlays.filter(parlay => {
    const key = parlay.legs.map(l => `${l.id}:${l.price}`).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function consensusFairProbabilities(event: OddsEvent): Map<string, number> {
  const byBookAndGroup = new Map<string, PricedOutcome[]>();

  for (const book of event.bookmakers || []) {
    for (const market of book.markets || []) {
      for (const outcome of market.outcomes || []) {
        if (typeof outcome.price !== 'number') continue;
        const g = groupKey(event.id, market.key, outcome);
        const bookGroupKey = `${book.key}|${g}`;
        const rows = byBookAndGroup.get(bookGroupKey) || [];
        rows.push({
          bookmakerKey: book.key,
          marketKey: market.key,
          groupKey: g,
          outcomeKey: sideKey(outcome),
          price: outcome.price
        });
        byBookAndGroup.set(bookGroupKey, rows);
      }
    }
  }

  const fairSamples = new Map<string, number[]>();

  for (const rows of byBookAndGroup.values()) {
    if (rows.length < 2) continue;
    const impliedSum = rows.reduce((sum, row) => sum + impliedFromAmerican(row.price), 0);
    if (!Number.isFinite(impliedSum) || impliedSum <= 0) continue;
    for (const row of rows) {
      // Prefer consensus away from Hard Rock Bet. If HRB is the only available book for a prop,
      // we skip it instead of pretending there is an edge.
      if (row.bookmakerKey === 'draftkings') continue;
      const noVig = impliedFromAmerican(row.price) / impliedSum;
      const key = `${row.groupKey}|${row.outcomeKey}`;
      const samples = fairSamples.get(key) || [];
      samples.push(noVig);
      fairSamples.set(key, samples);
    }
  }

  const fair = new Map<string, number>();
  for (const [key, samples] of fairSamples.entries()) {
    if (samples.length === 0) continue;
    fair.set(key, samples.reduce((a, b) => a + b, 0) / samples.length);
  }
  return fair;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 60 } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Odds API ${res.status}: ${text.slice(0, 220)}`);
  return JSON.parse(text) as T;
}

function eventTiming(commenceTime?: string): { minutesUntilStart?: number; startStatus: 'green' | 'yellow' | 'red' | 'started' | 'unknown' } {
  if (!commenceTime) return { startStatus: 'unknown' };
  const ms = new Date(commenceTime).getTime() - Date.now();
  if (!Number.isFinite(ms)) return { startStatus: 'unknown' };
  const minutesUntilStart = Math.floor(ms / 60000);
  if (minutesUntilStart <= 0) return { minutesUntilStart, startStatus: 'started' };
  if (minutesUntilStart <= 15) return { minutesUntilStart, startStatus: 'red' };
  if (minutesUntilStart <= 60) return { minutesUntilStart, startStatus: 'yellow' };
  return { minutesUntilStart, startStatus: 'green' };
}

async function fetchHardRockBetLegs(includeAlternates: boolean, upcomingOnly: boolean, marketFilter: string[]): Promise<{ legs: Leg[]; eventsFound: number; eventsScanned: number; eventsEligible: number; eventsFilteredOut: number; marketsRequested: string[] }> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { legs: mockLegs(), eventsFound: 0, eventsScanned: 0, eventsEligible: 0, eventsFilteredOut: 0, marketsRequested: [] };

  const base = process.env.ODDS_API_BASE || 'https://api.the-odds-api.com/v4';
  const allowedMarkets = new Set([...CORE_MARKETS, ...ALTERNATE_MARKETS]);
  const requestedFromUi = marketFilter.filter(m => allowedMarkets.has(m));
  const defaultMarkets = includeAlternates ? [...CORE_MARKETS, ...ALTERNATE_MARKETS] : CORE_MARKETS;
  const marketsRequested = requestedFromUi.length ? requestedFromUi : defaultMarkets;
  const maxEvents = Number(process.env.MAX_MLB_EVENTS || '30');
  const minEdge = Number(process.env.MIN_EDGE || '0.005');

  const eventsUrl = `${base}/sports/baseball_mlb/events?apiKey=${key}`;
  const events = await fetchJson<OddsEvent[]>(eventsUrl);
  const lockBufferMinutes = Number(process.env.GAME_LOCK_BUFFER_MINUTES || '0');
  const cutoff = Date.now() + lockBufferMinutes * 60 * 1000;
  const eligibleEvents = upcomingOnly
    ? events.filter(event => event.commence_time && new Date(event.commence_time).getTime() > cutoff)
    : events;
  const selectedEvents = eligibleEvents.slice(0, maxEvents);
  const allLegs: Leg[] = [];

  for (const event of selectedEvents) {
    const url = `${base}/sports/baseball_mlb/events/${event.id}/odds?apiKey=${key}&regions=us&markets=${marketsRequested.join(',')}&oddsFormat=american`;
    const data = await fetchJson<OddsEvent>(url);
    const fairByOutcome = consensusFairProbabilities(data);
    // Hard Rock Bet — multiple state licenses available via The Odds API
    // us2 region: hardrockbet (IN), hardrockbet_az (AZ), hardrockbet_fl (FL), hardrockbet_oh (OH)
    // See: https://the-odds-api.com/sports-odds-data/bookmaker-apis.html#us-bookmakers
    const hardRockBetKeys = ['hardrockbet', 'hardrockbet_az', 'hardrockbet_fl', 'hardrockbet_oh'];
    const targetBookmaker = data.bookmakers?.find(b => hardRockBetKeys.includes(b.key));
    if (!targetBookmaker) continue;

    for (const market of targetBookmaker.markets || []) {
      for (const outcome of market.outcomes || []) {
        if (typeof outcome.price !== 'number') continue;
        const id = legId(event.id, market.key, outcome);
        const impliedProbability = impliedFromAmerican(outcome.price);
        const consensusFairProbability = fairByOutcome.get(id);
        if (consensusFairProbability === undefined) continue;
        const fairProbability = adjustedFairProbability(market.key, consensusFairProbability, impliedProbability);
        const edge = fairProbability - impliedProbability;
        if (edge < minEdge) continue;
        const timing = eventTiming(event.commence_time);
        const model = modelForMarket(market.key);
        const kellyFraction = quarterKellyFraction(fairProbability, outcome.price);
        const clv = clvConfidence(edge, market.key, timing.minutesUntilStart);
        allLegs.push({
          id,
          event: `${event.away_team} @ ${event.home_team}`,
          market: market.key,
          selection: selectionLabel(market.key, outcome),
          point: outcome.point,
          price: outcome.price,
          impliedProbability,
          fairProbability,
          edge,
          source: 'live-consensus-plus-oddsify-model',
          modelVersion: ODDSIFY_MODEL_VERSION,
          modelCategory: model.category,
          marketSoftness: model.softness,
          evCeiling: model.evCeiling,
          clvConfidence: clv,
          kellyFraction,
          unitRecommendation: Math.round(kellyFraction * 10000) / 100,
          modelReasons: model.reasons,
          commenceTime: event.commence_time,
          ...timing
        });
      }
    }
  }

  return { legs: allLegs, eventsFound: events.length, eventsScanned: selectedEvents.length, eventsEligible: eligibleEvents.length, eventsFilteredOut: events.length - eligibleEvents.length, marketsRequested };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeAlternates = searchParams.get('alternates') === '1';
    const upcomingOnly = searchParams.get('upcomingOnly') !== '0';
    const mode = ((searchParams.get('mode') || 'balanced') as ParlayMode);
    const marketsParam = searchParams.get('markets') || '';
    const marketFilter = marketsParam.split(',').map(m => m.trim()).filter(Boolean);
    const result = await fetchHardRockBetLegs(includeAlternates, upcomingOnly, marketFilter);
    const filtered = uniqueLegs(result.legs).sort((a, b) => b.edge - a.edge).slice(0, 80);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      usingMockData: !process.env.ODDS_API_KEY,
      status: process.env.ODDS_API_KEY ? 'Live Hard Rock Bet odds loaded with Oddsify Props Deep Dive model' : 'Using mock data because ODDS_API_KEY is missing',
      modelVersion: ODDSIFY_MODEL_VERSION,
      eventsFound: result.eventsFound,
      eventsScanned: result.eventsScanned,
      eventsEligible: result.eventsEligible,
      eventsFilteredOut: result.eventsFilteredOut,
      upcomingOnly,
      legsFound: filtered.length,
      marketsRequested: result.marketsRequested,
      mode,
      threeLegs: uniqueParlays(makeParlays(filtered, 3, 40, mode)),
      fourLegs: uniqueParlays(makeParlays(filtered, 4, 40, mode)),
      fiveLegs: uniqueParlays(makeParlays(filtered, 5, 40, mode))
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
