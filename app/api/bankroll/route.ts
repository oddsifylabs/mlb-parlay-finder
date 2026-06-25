import { NextResponse } from 'next/server';
import { 
  getLatestBankrollSnapshot, 
  getBankrollHistory, 
  saveBankrollSnapshot,
  getCLVSummary 
} from '../../../lib/db/history';
import { 
  createBankrollState, 
  updateBankrollAfterBet, 
  getBankrollSummary,
  calculateStake,
  canPlaceBet,
  calculateParlayUnit,
  type BankrollState,
  type BankrollConfig 
} from '../../../lib/bankroll';

const DEFAULT_BANKROLL = parseFloat(process.env.DEFAULT_BANKROLL || '5000');

function getBankrollState(): BankrollState {
  const latest = getLatestBankrollSnapshot();
  
  if (!latest) {
    return createBankrollState(DEFAULT_BANKROLL);
  }
  
  return {
    totalBankroll: latest.totalBankroll,
    currentUnits: latest.totalBankroll / latest.unitSize,
    startingBankroll: latest.totalBankroll - latest.profitLoss,
    peakBankroll: latest.totalBankroll / (1 - latest.drawdownPercent),
    drawdownPercent: latest.drawdownPercent,
    tier: latest.tier as BankrollState['tier'],
    unitSize: latest.unitSize,
    activeBets: latest.activeBets,
    reservedUnits: 0,  // Would need to calculate from active bets
    availableUnits: (latest.totalBankroll / latest.unitSize) - latest.activeBets
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'summary';
    
    if (action === 'summary') {
      const state = getBankrollState();
      const summary = getBankrollSummary(state);
      const clvSummary = getCLVSummary();
      
      return NextResponse.json({
        state,
        summary,
        clvSummary,
        canBet: canPlaceBet(state, 1)
      });
    }
    
    if (action === 'history') {
      const days = parseInt(searchParams.get('days') || '30');
      const history = getBankrollHistory(days);
      return NextResponse.json({ history });
    }
    
    if (action === 'calculate_stake') {
      const { winProbability, decimalOdds, signalScore } = JSON.parse(
        searchParams.get('params') || '{}'
      );
      
      const state = getBankrollState();
      const stake = calculateStake({
        winProbability,
        decimalOdds,
        bankroll: state.totalBankroll,
        unitSize: state.unitSize,
        signalScore,
        drawdownPercent: state.drawdownPercent
      });
      
      return NextResponse.json({ stake, unitSize: state.unitSize, dollarStake: stake * state.unitSize });
    }
    
    if (action === 'parlay_unit') {
      const { baseUnit, numLegs } = JSON.parse(
        searchParams.get('params') || '{}'
      );
      
      const parlayUnit = calculateParlayUnit(baseUnit, numLegs);
      return NextResponse.json({ parlayUnit });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, data } = body;
    
    if (action === 'snapshot') {
      const state = getBankrollState();
      const record = {
        id: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        totalBankroll: state.totalBankroll,
        unitSize: state.unitSize,
        tier: state.tier,
        drawdownPercent: state.drawdownPercent,
        activeBets: state.activeBets,
        profitLoss: state.totalBankroll - state.startingBankroll
      };
      
      saveBankrollSnapshot(record);
      return NextResponse.json({ success: true, record });
    }
    
    if (action === 'update_bankroll') {
      const { newBankroll } = data;
      const state = getBankrollState();
      const updated = updateBankrollAfterBet(
        state,
        { id: '', date: new Date().toISOString(), event: '', selection: '', odds: 0, stake: 0, ...data }
      );
      
      const record = {
        id: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        totalBankroll: updated.totalBankroll,
        unitSize: updated.unitSize,
        tier: updated.tier,
        drawdownPercent: updated.drawdownPercent,
        activeBets: updated.activeBets,
        profitLoss: updated.totalBankroll - state.startingBankroll
      };
      
      saveBankrollSnapshot(record);
      return NextResponse.json({ success: true, record });
    }
    
    if (action === 'check_bet') {
      const { stake } = data;
      const state = getBankrollState();
      const check = canPlaceBet(state, stake);
      return NextResponse.json(check);
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
