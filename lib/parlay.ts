import type { Signal } from './signals';

export type ParlayMode = 'safe' | 'balanced' | 'lowCorrelation' | 'aggressive';

export type WeatherCondition = {
  temperature: number;      // Fahrenheit
  windSpeed: number;        // MPH
  windDirection: 'in' | 'out' | 'left' | 'right' | 'none';
  precipitation: number;    // Percentage
  condition: 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm';
};

export type LineupStatus = 'confirmed' | 'projected' | 'unknown';

export type TicketMoneySplit = {
  ticketPercentage: number;   // Public ticket %
  moneyPercentage: number;    // Sharp money %
  isSplitAction: boolean;     // true when divergence > 10%
};

export type CLVData = {
  openingLine?: number;       // Opening odds
  currentLine?: number;       // Current odds
  closingLine?: number;       // Closing odds (post-game)
  clv?: number;               // (closing - opening) / opening
};

export type Leg = {
  id: string;
  event: string;
  market: string;
  selection: string;
  point?: number;
  price: number;
  impliedProbability: number;
  fairProbability: number;
  edge: number;
  source?: string;
  modelVersion?: string;
  modelCategory?: string;
  marketSoftness?: 'Very High' | 'High' | 'Medium' | 'Low';
  evCeiling?: 'Very High' | 'High' | 'Medium-High' | 'Medium' | 'Low';
  clvConfidence?: 'High' | 'Medium' | 'Low';
  kellyFraction?: number;
  unitRecommendation?: number;
  modelReasons?: string[];
  commenceTime?: string;
  startStatus?: 'green' | 'yellow' | 'red' | 'started' | 'unknown';
  minutesUntilStart?: number;
  
  // Turtle Doctrine additions
  signals?: Signal[];                    // Detected VIC signals
  signalScore?: number;                  // Combined signal strength
  ticketMoneySplit?: TicketMoneySplit;   // Public vs sharp split
  clvData?: CLVData;                     // Line tracking
  weather?: WeatherCondition;            // Game weather
  lineupStatus?: LineupStatus;           // Confirmed or projected
  previousEdge?: number;                 // For late sharp detection
};

export type Parlay = {
  legs: Leg[];
  decimalOdds: number;
  americanOdds: number;
  impliedProbability: number;
  estimatedProbability: number;
  expectedValue: number;
  score: number;
  mode?: ParlayMode;
  riskLabel?: 'Low' | 'Medium' | 'High';
};

export function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number {
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

export function impliedFromAmerican(american: number): number {
  return american < 0 ? Math.abs(american) / (Math.abs(american) + 100) : 100 / (american + 100);
}

export function buildCombinations<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, combo: T[]) => {
    if (combo.length === size) return out.push([...combo]);
    for (let i = start; i < items.length; i++) walk(i + 1, [...combo, items[i]]);
  };
  walk(0, []);
  return out;
}

function subjectKey(leg: Leg): string {
  const lower = leg.selection.toLowerCase();
  return lower
    .replace(/ over .*/, '')
    .replace(/ under .*/, '')
    .replace(/ yes$/, '')
    .replace(/ no$/, '')
    .replace(/ moneyline$/, '')
    .trim();
}

function samePlayerOrMarket(a: Leg, b: Leg): boolean {
  const aSubject = subjectKey(a);
  const bSubject = subjectKey(b);
  if (aSubject && bSubject && aSubject === bSubject) return true;
  return a.event === b.event && a.market === b.market;
}

function isSameEvent(a: Leg, b: Leg): boolean {
  return a.event === b.event;
}

function modePass(combo: Leg[], mode: ParlayMode): boolean {
  if (combo.every((x, i) => combo.slice(i + 1).every(y => !samePlayerOrMarket(x, y))) === false) return false;

  const events = new Set(combo.map(l => l.event));
  const markets = new Set(combo.map(l => l.market));
  const avgEdge = combo.reduce((s, l) => s + l.edge, 0) / combo.length;
  const highConfidence = combo.filter(l => l.clvConfidence === 'High').length;

  if (mode === 'lowCorrelation') {
    return events.size === combo.length && markets.size >= Math.min(combo.length, 3);
  }

  if (mode === 'safe') {
    return events.size >= Math.ceil(combo.length * 0.75)
      && avgEdge >= 0.012
      && combo.every(l => l.edge >= 0.007)
      && highConfidence >= Math.max(1, Math.floor(combo.length / 2));
  }

  if (mode === 'aggressive') {
    const plusMoneyLegs = combo.filter(l => l.price > 0).length;
    const sameEventPairs = combo.reduce((count, x, i) => count + combo.slice(i + 1).filter(y => isSameEvent(x, y)).length, 0);
    return avgEdge >= 0.005 && sameEventPairs <= 1 && plusMoneyLegs >= 1;
  }

  return events.size >= Math.ceil(combo.length / 2);
}

function riskFor(combo: Leg[], mode: ParlayMode): 'Low' | 'Medium' | 'High' {
  if (mode === 'aggressive') return 'High';
  if (mode === 'lowCorrelation' || mode === 'safe') return 'Low';
  const events = new Set(combo.map(l => l.event)).size;
  return events === combo.length ? 'Medium' : 'High';
}

export function makeParlays(legs: Leg[], size: 3 | 4 | 5, max = 20, mode: ParlayMode = 'balanced'): Parlay[] {
  return buildCombinations(legs, size)
    .filter(combo => modePass(combo, mode))
    .map(combo => {
      const decimalOdds = combo.reduce((p, leg) => p * americanToDecimal(leg.price), 1);
      const estimatedProbability = combo.reduce((p, leg) => p * leg.fairProbability, 1);
      const impliedProbability = 1 / decimalOdds;
      const expectedValue = estimatedProbability * decimalOdds - 1;
      const modelBonus = combo.reduce((s, l) => {
        const softness = l.marketSoftness === 'Very High' ? 3 : l.marketSoftness === 'High' ? 2 : l.marketSoftness === 'Medium' ? 1 : 0;
        const clv = l.clvConfidence === 'High' ? 2 : l.clvConfidence === 'Medium' ? 1 : 0;
        return s + softness + clv;
      }, 0);
      const diversificationBonus = new Set(combo.map(l => l.event)).size * (mode === 'lowCorrelation' ? 2.5 : 1);
      const avgEdge = combo.reduce((s, l) => s + l.edge, 0) / combo.length;
      const aggressiveBonus = mode === 'aggressive' ? combo.filter(l => l.price > 0).length * 1.5 : 0;
      const score = expectedValue * 100 + avgEdge * 100 + modelBonus + diversificationBonus + aggressiveBonus;
      return {
        legs: combo,
        decimalOdds,
        americanOdds: decimalToAmerican(decimalOdds),
        impliedProbability,
        estimatedProbability,
        expectedValue,
        score,
        mode,
        riskLabel: riskFor(combo, mode)
      };
    })
    .filter(p => p.expectedValue > (mode === 'safe' ? -0.05 : mode === 'aggressive' ? -0.35 : -0.25))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
