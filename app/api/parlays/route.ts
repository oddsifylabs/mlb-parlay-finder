import { NextResponse } from 'next/server';
import { impliedFromAmerican, Leg, makeParlays } from '../../../lib/parlay';

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
      // Prefer consensus away from DraftKings. If DK is the only available book for a prop,
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

async function fetchDraftKingsLegs(includeAlternates: boolean, upcomingOnly: boolean): Promise<{ legs: Leg[]; eventsFound: number; eventsScanned: number; eventsEligible: number; eventsFilteredOut: number; marketsRequested: string[] }> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { legs: mockLegs(), eventsFound: 0, eventsScanned: 0, eventsEligible: 0, eventsFilteredOut: 0, marketsRequested: [] };

  const base = process.env.ODDS_API_BASE || 'https://api.the-odds-api.com/v4';
  const marketsRequested = includeAlternates ? [...CORE_MARKETS, ...ALTERNATE_MARKETS] : CORE_MARKETS;
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
    const dk = data.bookmakers?.find(b => b.key === 'draftkings');
    if (!dk) continue;

    for (const market of dk.markets || []) {
      for (const outcome of market.outcomes || []) {
        if (typeof outcome.price !== 'number') continue;
        const id = legId(event.id, market.key, outcome);
        const impliedProbability = impliedFromAmerican(outcome.price);
        const fairProbability = fairByOutcome.get(id);
        if (fairProbability === undefined) continue;
        const edge = fairProbability - impliedProbability;
        if (edge < minEdge) continue;
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
          source: 'live-consensus',
          commenceTime: event.commence_time,
          ...eventTiming(event.commence_time)
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
    const result = await fetchDraftKingsLegs(includeAlternates, upcomingOnly);
    const filtered = uniqueLegs(result.legs).sort((a, b) => b.edge - a.edge).slice(0, 80);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      usingMockData: !process.env.ODDS_API_KEY,
      status: process.env.ODDS_API_KEY ? 'Live DraftKings odds loaded with consensus fair-price model' : 'Using mock data because ODDS_API_KEY is missing',
      eventsFound: result.eventsFound,
      eventsScanned: result.eventsScanned,
      eventsEligible: result.eventsEligible,
      eventsFilteredOut: result.eventsFilteredOut,
      upcomingOnly,
      legsFound: filtered.length,
      marketsRequested: result.marketsRequested,
      threeLegs: uniqueParlays(makeParlays(filtered, 3, 30)),
      fiveLegs: uniqueParlays(makeParlays(filtered, 5, 30))
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
