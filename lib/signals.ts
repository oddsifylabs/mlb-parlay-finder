/**
 * VIC Signal Engine — The Six Signals from The Turtle Doctrine Chapter 8
 * 
 * Signal types:
 * - STEAM: Multiple books move same direction within 5 minutes
 * - RLM (Reverse Line Movement): Line moves opposite to public percentage
 * - KEY_NUMBER: Line crosses key numbers (1.5, 2.5, 3.5 runs)
 * - LATE_SHARP: Edge increases significantly in final 15 minutes
 * - LINE_FREEZE: Public >70% but line unchanged
 * - SYNC_JUICING: Multiple books increase vig simultaneously
 */

export type SignalType = 'STEAM' | 'RLM' | 'KEY_NUMBER' | 'LATE_SHARP' | 'LINE_FREEZE' | 'SYNC_JUICING';

export type SignalStrength = 'High' | 'Medium' | 'Low';

export interface Signal {
  type: SignalType;
  strength: SignalStrength;
  detectedAt: string;
  description: string;
  historicalCLV: number;  // Average CLV for this signal type
  sampleSize: number;     // Number of historical samples
}

export interface BookMovement {
  bookKey: string;
  marketKey: string;
  outcomeKey: string;
  previousPrice: number;
  currentPrice: number;
  timestamp: string;
}

export interface SignalConfig {
  steamWindowMinutes: number;      // Default: 5
  steamBookThreshold: number;       // Default: 3 (books moving same direction)
  rlmDivergenceThreshold: number;   // Default: 10 (% divergence)
  lineFreezePublicThreshold: number;// Default: 70 (%)
  lateSharpMinutesBeforeGame: number; // Default: 15
  lateSharpEdgeIncrease: number;    // Default: 0.015 (1.5% edge increase)
  syncJuicingVigIncrease: number;   // Default: 0.02 (2% vig increase)
  syncJuicingBookThreshold: number; // Default: 3 (books)
}

const DEFAULT_CONFIG: SignalConfig = {
  steamWindowMinutes: 5,
  steamBookThreshold: 3,
  rlmDivergenceThreshold: 10,
  lineFreezePublicThreshold: 70,
  lateSharpMinutesBeforeGame: 15,
  lateSharpEdgeIncrease: 0.015,
  syncJuicingVigIncrease: 0.02,
  syncJuicingBookThreshold: 3
};

// Historical CLV data by signal type (from Turtle Doctrine backtests)
const HISTORICAL_CLV: Record<SignalType, { clv: number; samples: number }> = {
  RLM: { clv: 0.047, samples: 523 },      // +4.7% CLV
  STEAM: { clv: 0.038, samples: 412 },     // +3.8% CLV
  LINE_FREEZE: { clv: 0.052, samples: 287 }, // +5.2% CLV
  KEY_NUMBER: { clv: 0.029, samples: 634 },  // +2.9% CLV
  LATE_SHARP: { clv: 0.041, samples: 198 },  // +4.1% CLV
  SYNC_JUICING: { clv: 0.033, samples: 156 }  // +3.3% CLV
};

/**
 * Detect STEAM moves — multiple books moving same direction within window
 * Chapter 8: "When multiple market makers move a line in the same direction 
 * within minutes, that's consensus."
 */
export function detectSteam(
  movements: BookMovement[],
  config: SignalConfig = DEFAULT_CONFIG
): Signal | null {
  const now = Date.now();
  const windowMs = config.steamWindowMinutes * 60 * 1000;
  
  // Group movements by market/outcome
  const byOutcome = new Map<string, BookMovement[]>();
  for (const move of movements) {
    const key = `${move.marketKey}|${move.outcomeKey}`;
    const group = byOutcome.get(key) || [];
    group.push(move);
    byOutcome.set(key, group);
  }
  
  // Check each group for steam
  for (const [outcomeKey, group] of byOutcome.entries()) {
    const recentMoves = group.filter(m => 
      now - new Date(m.timestamp).getTime() <= windowMs
    );
    
    if (recentMoves.length < config.steamBookThreshold) continue;
    
    // Check if all moving same direction
    const directions = new Set(recentMoves.map(m => 
      m.currentPrice > m.previousPrice ? 'up' : 'down'
    ));
    
    if (directions.size === 1) {
      const direction = directions.values().next().value;
      return {
        type: 'STEAM',
        strength: recentMoves.length >= 4 ? 'High' : recentMoves.length >= 3 ? 'Medium' : 'Low',
        detectedAt: new Date().toISOString(),
        description: `${recentMoves.length} books moved ${direction} within ${config.steamWindowMinutes} minutes`,
        historicalCLV: HISTORICAL_CLV.STEAM.clv,
        sampleSize: HISTORICAL_CLV.STEAM.samples
      };
    }
  }
  
  return null;
}

/**
 * Detect Reverse Line Movement — line moves opposite to public betting
 * Chapter 6: "When ticket percentage and money percentage diverge, sharps are 
 * on the opposite side of the public."
 */
export function detectRLM(
  ticketPercentage: number,
  moneyPercentage: number,
  lineMovement: number,  // positive = moved toward favorite/over
  config: SignalConfig = DEFAULT_CONFIG
): Signal | null {
  const divergence = Math.abs(ticketPercentage - moneyPercentage);
  
  if (divergence < config.rlmDivergenceThreshold) return null;
  
  // Public betting one side, line moving the other
  const publicSide = ticketPercentage > 50 ? 'favorite' : 'underdog';
  const lineDirection = lineMovement > 0 ? 'toward favorite' : 'toward underdog';
  
  // RLM when public on favorite but line moves toward underdog (or vice versa)
  const isRLM = (publicSide === 'favorite' && lineMovement < 0) ||
                (publicSide === 'underdog' && lineMovement > 0);
  
  if (!isRLM) return null;
  
  const strength = divergence >= 20 ? 'High' : divergence >= 15 ? 'Medium' : 'Low';
  
  return {
    type: 'RLM',
    strength,
    detectedAt: new Date().toISOString(),
    description: `Public ${Math.round(ticketPercentage)}% on ${publicSide}, line moving ${lineDirection} (${divergence.toFixed(1)}% split)`,
    historicalCLV: HISTORICAL_CLV.RLM.clv,
    sampleSize: HISTORICAL_CLV.RLM.samples
  };
}

/**
 * Detect Key Number crosses — line crosses 1.5, 2.5, 3.5 runs
 * Chapter 8: "Key numbers in baseball are 1.5, 2.5, 3.5 runs. Crossing these 
 * thresholds creates value opportunities."
 */
export function detectKeyNumber(
  openingLine: number,
  currentLine: number,
  marketType: 'total' | 'spread' = 'total'
): Signal | null {
  const keyNumbers = [1.5, 2.5, 3.5];
  
  const crossedNumbers: number[] = [];
  for (const key of keyNumbers) {
    const crossedOpening = openingLine >= key;
    const crossedCurrent = currentLine >= key;
    
    if (crossedOpening !== crossedCurrent) {
      crossedNumbers.push(key);
    }
  }
  
  if (crossedNumbers.length === 0) return null;
  
  const direction = currentLine > openingLine ? 'up' : 'down';
  
  return {
    type: 'KEY_NUMBER',
    strength: crossedNumbers.length >= 2 ? 'High' : 'Medium',
    detectedAt: new Date().toISOString(),
    description: `Line crossed ${crossedNumbers.join(', ')} (moving ${direction} from ${openingLine} to ${currentLine})`,
    historicalCLV: HISTORICAL_CLV.KEY_NUMBER.clv,
    sampleSize: HISTORICAL_CLV.KEY_NUMBER.samples
  };
}

/**
 * Detect Late Sharp Action — edge increases significantly in final 15 minutes
 * Chapter 8: "Late sharp money often hits in the final 15 minutes before first pitch."
 */
export function detectLateSharp(
  minutesUntilStart: number | undefined,
  currentEdge: number,
  previousEdge: number | undefined,
  config: SignalConfig = DEFAULT_CONFIG
): Signal | null {
  if (minutesUntilStart === undefined || minutesUntilStart > config.lateSharpMinutesBeforeGame) {
    return null;
  }
  
  if (previousEdge === undefined) return null;
  
  const edgeIncrease = currentEdge - previousEdge;
  
  if (edgeIncrease < config.lateSharpEdgeIncrease) return null;
  
  const strength = edgeIncrease >= 0.03 ? 'High' : edgeIncrease >= 0.02 ? 'Medium' : 'Low';
  
  return {
    type: 'LATE_SHARP',
    strength,
    detectedAt: new Date().toISOString(),
    description: `Edge increased ${(edgeIncrease * 100).toFixed(1)}% in final ${minutesUntilStart} minutes (${(currentEdge * 100).toFixed(1)}% total edge)`,
    historicalCLV: HISTORICAL_CLV.LATE_SHARP.clv,
    sampleSize: HISTORICAL_CLV.LATE_SHARP.samples
  };
}

/**
 * Detect Line Freeze — public heavy but line unchanged
 * Chapter 6: "If the public is 70% on the over but the line stays at 8.5, the line 
 * is 'pinned' by sharp action."
 */
export function detectLineFreeze(
  ticketPercentage: number,
  openingLine: number,
  currentLine: number,
  config: SignalConfig = DEFAULT_CONFIG
): Signal | null {
  if (ticketPercentage < config.lineFreezePublicThreshold) return null;
  
  const lineMovement = Math.abs(currentLine - openingLine);
  
  // Line hasn't moved despite heavy public action
  if (lineMovement > 0.05) return null;  // More than 5 cents movement
  
  const side = ticketPercentage > 50 ? 'favorite/over' : 'underdog/under';
  
  return {
    type: 'LINE_FREEZE',
    strength: ticketPercentage >= 80 ? 'High' : ticketPercentage >= 75 ? 'Medium' : 'Low',
    detectedAt: new Date().toISOString(),
    description: `Public ${Math.round(ticketPercentage)}% on ${side} but line frozen at ${currentLine}`,
    historicalCLV: HISTORICAL_CLV.LINE_FREEZE.clv,
    sampleSize: HISTORICAL_CLV.LINE_FREEZE.samples
  };
}

/**
 * Detect Synchronized Juicing — multiple books increase vig simultaneously
 * Chapter 8: "When multiple books increase vig at the same time, they're 
 * protecting against sharp action."
 */
export function detectSyncJuicing(
  bookVigChanges: Array<{ bookKey: string; previousVig: number; currentVig: number }>,
  config: SignalConfig = DEFAULT_CONFIG
): Signal | null {
  const increasedBooks = bookVigChanges.filter(b => 
    b.currentVig - b.previousVig >= config.syncJuicingVigIncrease
  );
  
  if (increasedBooks.length < config.syncJuicingBookThreshold) return null;
  
  const avgVigIncrease = increasedBooks.reduce((sum, b) => 
    sum + (b.currentVig - b.previousVig), 0
  ) / increasedBooks.length;
  
  return {
    type: 'SYNC_JUICING',
    strength: increasedBooks.length >= 4 ? 'High' : 'Medium',
    detectedAt: new Date().toISOString(),
    description: `${increasedBooks.length} books increased vig by avg ${(avgVigIncrease * 100).toFixed(1)}% simultaneously`,
    historicalCLV: HISTORICAL_CLV.SYNC_JUICING.clv,
    sampleSize: HISTORICAL_CLV.SYNC_JUICING.samples
  };
}

/**
 * Calculate vig from two-sided odds
 */
export function calculateVig(favoriteOdds: number, underdogOdds: number): number {
  const favImplied = favoriteOdds < 0 
    ? Math.abs(favoriteOdds) / (Math.abs(favoriteOdds) + 100)
    : 100 / (favoriteOdds + 100);
  
  const dogImplied = underdogOdds < 0
    ? Math.abs(underdogOdds) / (Math.abs(underdogOdds) + 100)
    : 100 / (underdogOdds + 100);
  
  return (favImplied + dogImplied) - 1;
}

/**
 * Run all signal detections on a leg
 */
export interface SignalDetectionInput {
  ticketPercentage?: number;
  moneyPercentage?: number;
  openingLine?: number;
  currentLine?: number;
  lineMovement?: number;
  currentEdge: number;
  previousEdge?: number;
  minutesUntilStart?: number;
  bookMovements?: BookMovement[];
  bookVigChanges?: Array<{ bookKey: string; previousVig: number; currentVig: number }>;
  marketType?: 'total' | 'spread';
}

export function detectAllSignals(
  input: SignalDetectionInput,
  config: SignalConfig = DEFAULT_CONFIG
): Signal[] {
  const signals: Signal[] = [];
  
  // STEAM
  if (input.bookMovements && input.bookMovements.length > 0) {
    const steam = detectSteam(input.bookMovements, config);
    if (steam) signals.push(steam);
  }
  
  // RLM
  if (input.ticketPercentage !== undefined && 
      input.moneyPercentage !== undefined && 
      input.lineMovement !== undefined) {
    const rlm = detectRLM(input.ticketPercentage, input.moneyPercentage, input.lineMovement, config);
    if (rlm) signals.push(rlm);
  }
  
  // KEY_NUMBER
  if (input.openingLine !== undefined && input.currentLine !== undefined) {
    const keyNumber = detectKeyNumber(input.openingLine, input.currentLine, input.marketType);
    if (keyNumber) signals.push(keyNumber);
  }
  
  // LATE_SHARP
  const lateSharp = detectLateSharp(
    input.minutesUntilStart, 
    input.currentEdge, 
    input.previousEdge, 
    config
  );
  if (lateSharp) signals.push(lateSharp);
  
  // LINE_FREEZE
  if (input.ticketPercentage !== undefined && 
      input.openingLine !== undefined && 
      input.currentLine !== undefined) {
    const lineFreeze = detectLineFreeze(
      input.ticketPercentage, 
      input.openingLine, 
      input.currentLine, 
      config
    );
    if (lineFreeze) signals.push(lineFreeze);
  }
  
  // SYNC_JUICING
  if (input.bookVigChanges && input.bookVigChanges.length > 0) {
    const syncJuicing = detectSyncJuicing(input.bookVigChanges, config);
    if (syncJuicing) signals.push(syncJuicing);
  }
  
  // Sort by historical CLV (highest first)
  return signals.sort((a, b) => b.historicalCLV - a.historicalCLV);
}

/**
 * Get combined signal strength score
 */
export function getSignalScore(signals: Signal[]): number {
  if (signals.length === 0) return 0;
  
  const strengthWeights: Record<SignalStrength, number> = {
    High: 3,
    Medium: 2,
    Low: 1
  };
  
  let totalWeight = 0;
  let totalCLV = 0;
  
  for (const signal of signals) {
    const weight = strengthWeights[signal.strength];
    totalWeight += weight;
    totalCLV += signal.historicalCLV * weight;
  }
  
  // Weighted average CLV
  return totalCLV / totalWeight;
}
