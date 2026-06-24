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
  commenceTime?: string;
  startStatus?: 'green' | 'yellow' | 'red' | 'started' | 'unknown';
  minutesUntilStart?: number;
};

export type Parlay = {
  legs: Leg[];
  decimalOdds: number;
  americanOdds: number;
  impliedProbability: number;
  estimatedProbability: number;
  expectedValue: number;
  score: number;
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
  // Avoid multiple legs from the same event and same market; this removes duplicate/correlated outcomes.
  return a.event === b.event && a.market === b.market;
}

export function makeParlays(legs: Leg[], size: 3 | 5, max = 20): Parlay[] {
  return buildCombinations(legs, size)
    .filter(combo => combo.every((x, i) => combo.slice(i + 1).every(y => !samePlayerOrMarket(x, y))))
    .map(combo => {
      const decimalOdds = combo.reduce((p, leg) => p * americanToDecimal(leg.price), 1);
      const estimatedProbability = combo.reduce((p, leg) => p * leg.fairProbability, 1);
      const impliedProbability = 1 / decimalOdds;
      const expectedValue = estimatedProbability * decimalOdds - 1;
      const score = expectedValue * 100 + combo.reduce((s, l) => s + l.edge, 0) * 10;
      return { legs: combo, decimalOdds, americanOdds: decimalToAmerican(decimalOdds), impliedProbability, estimatedProbability, expectedValue, score };
    })
    .filter(p => p.expectedValue > -0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
