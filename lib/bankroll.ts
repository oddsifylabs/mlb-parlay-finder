/**
 * Turtle Doctrine Bankroll Management — Chapter 10
 * 
 * Implements the Turtle Position-Sizing System:
 * - Bankroll tiers with seasonal scaling
 * - Quarter-Kelly criterion with drawdown adjustments
 * - Unit tracking and risk management
 */

export type BankrollTier = 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4';

export interface BankrollState {
  totalBankroll: number;      // Total bankroll in dollars
  currentUnits: number;       // Current unit count
  startingBankroll: number;   // Season starting bankroll
  peakBankroll: number;       // Highest bankroll this season
  drawdownPercent: number;    // Current drawdown from peak
  tier: BankrollTier;         // Current tier
  unitSize: number;           // Current unit size in dollars
  activeBets: number;         // Number of active bets
  reservedUnits: number;      // Units reserved for active bets
  availableUnits: number;     // Units available for new bets
}

export interface BetRecord {
  id: string;
  date: string;
  event: string;
  selection: string;
  odds: number;
  stake: number;            // In units
  result?: 'win' | 'loss' | 'push';
  profit?: number;          // In units
  clv?: number;             // Closing line value
  signalType?: string;      // VIC signal that triggered bet
}

export interface BankrollConfig {
  // Tier thresholds (from Turtle Doctrine Appendix B)
  tier1MinBankroll: number;   // Default: $10,000
  tier2MinBankroll: number;   // Default: $5,000
  tier3MinBankroll: number;   // Default: $2,000
  tier4MinBankroll: number;   // Default: $500
  
  // Base unit sizes (percentage of bankroll)
  tier1UnitPercent: number;   // Default: 0.01 (1%)
  tier2UnitPercent: number;   // Default: 0.015 (1.5%)
  tier3UnitPercent: number;   // Default: 0.02 (2%)
  tier4UnitPercent: number;   // Default: 0.025 (2.5%)
  
  // Drawdown adjustments
  drawdown10Reduction: number; // Default: 0.25 (reduce 25% at 10% DD)
  drawdown20Reduction: number; // Default: 0.50 (reduce 50% at 20% DD)
  drawdown30Stop: boolean;     // Default: true (stop at 30% DD)
  
  // Kelly criterion settings
  kellyFraction: number;      // Default: 0.25 (quarter-Kelly)
  maxUnitSize: number;        // Default: 3 (max units per bet)
  minUnitSize: number;        // Default: 0.25 (min units per bet)
  
  // Active bet limits
  maxActiveBets: number;      // Default: 10
  maxExposure: number;        // Default: 15 (max units at risk)
}

const DEFAULT_CONFIG: BankrollConfig = {
  tier1MinBankroll: 10000,
  tier2MinBankroll: 5000,
  tier3MinBankroll: 2000,
  tier4MinBankroll: 500,
  
  tier1UnitPercent: 0.01,
  tier2UnitPercent: 0.015,
  tier3UnitPercent: 0.02,
  tier4UnitPercent: 0.025,
  
  drawdown10Reduction: 0.25,
  drawdown20Reduction: 0.50,
  drawdown30Stop: true,
  
  kellyFraction: 0.25,
  maxUnitSize: 3,
  minUnitSize: 0.25,
  
  maxActiveBets: 10,
  maxExposure: 15
};

/**
 * Determine bankroll tier based on current bankroll
 * Chapter 10: "Bankroll Tiers and Seasonal Scaling"
 */
export function getBankrollTier(bankroll: number, config: BankrollConfig = DEFAULT_CONFIG): BankrollTier {
  if (bankroll >= config.tier1MinBankroll) return 'Tier 1';
  if (bankroll >= config.tier2MinBankroll) return 'Tier 2';
  if (bankroll >= config.tier3MinBankroll) return 'Tier 3';
  return 'Tier 4';
}

/**
 * Get base unit percentage for tier
 */
export function getUnitPercentForTier(tier: BankrollTier, config: BankrollConfig = DEFAULT_CONFIG): number {
  switch (tier) {
    case 'Tier 1': return config.tier1UnitPercent;
    case 'Tier 2': return config.tier2UnitPercent;
    case 'Tier 3': return config.tier3UnitPercent;
    case 'Tier 4': return config.tier4UnitPercent;
  }
}

/**
 * Calculate drawdown percentage from peak
 */
export function calculateDrawdown(current: number, peak: number): number {
  if (peak <= 0) return 0;
  return (peak - current) / peak;
}

/**
 * Get drawdown adjustment multiplier
 * Chapter 10: "Drawdown Survival"
 */
export function getDrawdownMultiplier(drawdownPercent: number, config: BankrollConfig = DEFAULT_CONFIG): number {
  if (drawdownPercent >= 0.30 && config.drawdown30Stop) return 0;  // Stop betting
  if (drawdownPercent >= 0.20) return 1 - config.drawdown20Reduction;  // 50% reduction
  if (drawdownPercent >= 0.10) return 1 - config.drawdown10Reduction;  // 25% reduction
  return 1;  // No reduction
}

/**
 * Calculate quarter-Kelly stake
 * Chapter 10: "The Turtle Position-Sizing System"
 */
export function calculateKellyStake(
  winProbability: number,
  decimalOdds: number,
  bankroll: number,
  unitSize: number,
  config: BankrollConfig = DEFAULT_CONFIG
): number {
  const b = decimalOdds - 1;
  if (b <= 0) return config.minUnitSize;
  
  // Full Kelly formula: (p * b - q) / b
  const q = 1 - winProbability;
  const fullKelly = (winProbability * b - q) / b;
  
  if (fullKelly <= 0) return config.minUnitSize;
  
  // Apply quarter-Kelly
  const quarterKelly = fullKelly * config.kellyFraction;
  
  // Convert to units
  const kellyUnits = (quarterKelly * bankroll) / unitSize;
  
  // Apply bounds
  return Math.max(config.minUnitSize, Math.min(config.maxUnitSize, kellyUnits));
}

/**
 * Calculate recommended stake for a bet
 * Incorporates: Kelly, signal strength, drawdown adjustment
 */
export interface StakeInput {
  winProbability: number;
  decimalOdds: number;
  bankroll: number;
  unitSize: number;
  signalScore?: number;      // From VIC signal engine
  drawdownPercent: number;
  config?: BankrollConfig;
}

export function calculateStake(input: StakeInput): number {
  const config = input.config || DEFAULT_CONFIG;
  
  // Base Kelly stake
  let stake = calculateKellyStake(
    input.winProbability,
    input.decimalOdds,
    input.bankroll,
    input.unitSize,
    config
  );
  
  // Apply drawdown adjustment
  const ddMultiplier = getDrawdownMultiplier(input.drawdownPercent, config);
  stake *= ddMultiplier;
  
  // Signal strength bonus (from Chapter 8 signal weights)
  if (input.signalScore !== undefined && input.signalScore > 0) {
    // High signal score (>0.04 CLV) gets 20% increase
    // Medium signal score (>0.03 CLV) gets 10% increase
    if (input.signalScore >= 0.04) {
      stake *= 1.2;
    } else if (input.signalScore >= 0.03) {
      stake *= 1.1;
    }
  }
  
  // Apply bounds again
  return Math.max(config.minUnitSize, Math.min(config.maxUnitSize, Math.round(stake * 4) / 4));
}

/**
 * Create initial bankroll state
 */
export function createBankrollState(
  initialBankroll: number,
  config: BankrollConfig = DEFAULT_CONFIG
): BankrollState {
  const tier = getBankrollTier(initialBankroll, config);
  const unitPercent = getUnitPercentForTier(tier, config);
  const unitSize = initialBankroll * unitPercent;
  
  return {
    totalBankroll: initialBankroll,
    currentUnits: initialBankroll / unitSize,
    startingBankroll: initialBankroll,
    peakBankroll: initialBankroll,
    drawdownPercent: 0,
    tier,
    unitSize,
    activeBets: 0,
    reservedUnits: 0,
    availableUnits: initialBankroll / unitSize
  };
}

/**
 * Update bankroll state after bet result
 */
export function updateBankrollAfterBet(
  state: BankrollState,
  bet: BetRecord,
  config: BankrollConfig = DEFAULT_CONFIG
): BankrollState {
  let newBankroll = state.totalBankroll;
  
  if (bet.result === 'win' && bet.profit !== undefined) {
    newBankroll += bet.profit * state.unitSize;
  } else if (bet.result === 'loss' && bet.stake > 0) {
    newBankroll -= bet.stake * state.unitSize;
  }
  // Push returns stake, no change
  
  const tier = getBankrollTier(newBankroll, config);
  const unitPercent = getUnitPercentForTier(tier, config);
  const newUnitSize = newBankroll * unitPercent;
  
  const drawdown = calculateDrawdown(newBankroll, Math.max(state.peakBankroll, newBankroll));
  const ddMultiplier = getDrawdownMultiplier(drawdown, config);
  
  return {
    ...state,
    totalBankroll: newBankroll,
    currentUnits: newBankroll / newUnitSize,
    peakBankroll: Math.max(state.peakBankroll, newBankroll),
    drawdownPercent: drawdown,
    tier,
    unitSize: newUnitSize,
    activeBets: bet.result ? state.activeBets - 1 : state.activeBets,
    reservedUnits: bet.result ? state.reservedUnits - bet.stake : state.reservedUnits,
    availableUnits: (newBankroll / newUnitSize) - state.reservedUnits
  };
}

/**
 * Check if a new bet is allowed
 */
export function canPlaceBet(
  state: BankrollState,
  stake: number,
  config: BankrollConfig = DEFAULT_CONFIG
): { allowed: boolean; reason?: string } {
  if (state.drawdownPercent >= 0.30 && config.drawdown30Stop) {
    return { allowed: false, reason: '30% drawdown reached — stop betting per Turtle Doctrine' };
  }
  
  if (state.activeBets >= config.maxActiveBets) {
    return { allowed: false, reason: `Max active bets (${config.maxActiveBets}) reached` };
  }
  
  if (state.reservedUnits + stake > config.maxExposure) {
    return { allowed: false, reason: `Max exposure (${config.maxExposure}u) would be exceeded` };
  }
  
  if (stake > state.availableUnits) {
    return { allowed: false, reason: `Insufficient units available (${state.availableUnits.toFixed(2)}u)` };
  }
  
  return { allowed: true };
}

/**
 * Get bankroll summary for display
 */
export function getBankrollSummary(state: BankrollState): Record<string, string | number> {
  const profitLoss = state.totalBankroll - state.startingBankroll;
  const profitLossPercent = (profitLoss / state.startingBankroll) * 100;
  
  return {
    tier: state.tier,
    bankroll: `$${state.totalBankroll.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
    unitSize: `$${state.unitSize.toFixed(2)}`,
    units: state.currentUnits.toFixed(2),
    availableUnits: state.availableUnits.toFixed(2),
    activeBets: state.activeBets,
    drawdown: `${(state.drawdownPercent * 100).toFixed(1)}%`,
    profitLoss: `${profitLoss >= 0 ? '+' : ''}$${profitLoss.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
    profitLossPercent: `${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(1)}%`,
    peakBankroll: `$${state.peakBankroll.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  };
}

/**
 * Calculate recommended unit size for parlay
 * Chapter 10: Parlay sizing should be 50% of single-bet unit
 */
export function calculateParlayUnit(
  baseUnit: number,
  numLegs: number
): number {
  // Reduce unit size based on parlay legs
  // 3-leg: 50% of base unit
  // 4-leg: 35% of base unit
  // 5-leg: 25% of base unit
  const multipliers: Record<number, number> = {
    3: 0.50,
    4: 0.35,
    5: 0.25
  };
  
  const multiplier = multipliers[numLegs] || 0.25;
  return Math.max(0.25, Math.round(baseUnit * multiplier * 4) / 4);
}
