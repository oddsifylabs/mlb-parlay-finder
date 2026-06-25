'use client';
import { useEffect, useMemo, useState } from 'react';

type Mode = 'safe' | 'balanced' | 'lowCorrelation' | 'aggressive';
type Tab = 'threeLegs' | 'fourLegs' | 'fiveLegs' | 'history' | 'clv' | 'bankroll';
type SignalType = 'STEAM' | 'RLM' | 'KEY_NUMBER' | 'LATE_SHARP' | 'LINE_FREEZE' | 'SYNC_JUICING';
type SignalStrength = 'High' | 'Medium' | 'Low';

interface Signal {
  type: SignalType;
  strength: SignalStrength;
  detectedAt: string;
  description: string;
  historicalCLV: number;
  sampleSize: number;
}

type Leg = { id:string; event:string; market:string; selection:string; price:number; impliedProbability:number; fairProbability:number; edge:number; source?:string; modelVersion?:string; modelCategory?:string; marketSoftness?:string; evCeiling?:string; clvConfidence?:'High'|'Medium'|'Low'; kellyFraction?:number; unitRecommendation?:number; modelReasons?:string[]; commenceTime?:string; startStatus?:'green'|'yellow'|'red'|'started'|'unknown'; minutesUntilStart?:number; signals?:Signal[]; signalScore?:number; ticketMoneySplit?:{ticketPercentage:number;moneyPercentage:number;isSplitAction:boolean}; clvData?:{openingLine?:number;currentLine?:number;closingLine?:number;clv?:number}; weather?:{temperature:number;windSpeed:number;windDirection:'in'|'out'|'left'|'right'|'none';precipitation:number;condition:'clear'|'cloudy'|'rain'|'snow'|'storm'}; lineupStatus?:'confirmed'|'projected'|'unknown'; previousEdge?:number; };
type Parlay = { legs: Leg[]; americanOdds:number; estimatedProbability:number; expectedValue:number; score:number; mode?:Mode; riskLabel?:'Low'|'Medium'|'High' };
type ApiResponse = { generatedAt:string; usingMockData:boolean; status?:string; modelVersion?:string; mode?:Mode; eventsFound?:number; eventsScanned?:number; eventsEligible?:number; eventsFilteredOut?:number; upcomingOnly?:boolean; legsFound?:number; marketsRequested?:string[]; threeLegs:Parlay[]; fourLegs:Parlay[]; fiveLegs:Parlay[]; error?:string };
type SavedParlay = Parlay & { id: string; savedAt: string; note?: string; openingLine?:number; closingLine?:number; clv?:number; result?:'win'|'loss'|'push'; signalTypes?:string[]; };
type SavedRecord = { id: string; savedAt: string; note?: string; parlay: Parlay };

interface BankrollSummary {
  tier: string;
  bankroll: string | number;
  unitSize: string | number;
  units: string | number;
  availableUnits: string | number;
  activeBets: number;
  drawdown: string;
  profitLoss: string;
  profitLossPercent: string;
  peakBankroll: string | number;
}

interface CLVSummary {
  totalBets: number;
  avgCLV: number;
  positiveCLVPercent: number;
  cumulativeCLV: number;
}

type Filters = {
  minLegEdge: number;
  minParlayEv: number;
  minScore: number;
  search: string;
};

const MARKET_GROUPS = {
  pitcher: [
    ['pitcher_strikeouts', 'Pitcher Ks'],
    ['pitcher_outs', 'Pitcher outs'],
    ['pitcher_hits_allowed', 'Pitcher hits allowed'],
    ['pitcher_earned_runs', 'Pitcher earned runs'],
    ['pitcher_walks', 'Pitcher walks'],
    ['pitcher_record_a_win', 'Pitcher win']
  ],
  hitter: [
    ['batter_hits', 'Batter hits'],
    ['batter_total_bases', 'Total bases'],
    ['batter_hits_runs_rbis', 'H+R+RBI'],
    ['batter_rbis', 'RBIs'],
    ['batter_runs_scored', 'Runs scored'],
    ['batter_home_runs', 'Home runs'],
    ['batter_singles', 'Singles'],
    ['batter_doubles', 'Doubles'],
    ['batter_walks', 'Batter walks'],
    ['batter_strikeouts', 'Batter strikeouts'],
    ['batter_stolen_bases', 'Stolen bases']
  ],
  game: [
    ['h2h', 'Moneyline'],
    ['spreads', 'Run line'],
    ['totals', 'Game total']
  ]
} as const;

const DEFAULT_MARKETS = ['pitcher_strikeouts','pitcher_outs','pitcher_walks','batter_hits','batter_total_bases','batter_hits_runs_rbis','batter_home_runs','h2h','totals'];

function pct(n:number){ return `${(n*100).toFixed(1)}%`; }
function odds(n:number){ return n > 0 ? `+${n}` : `${n}`; }
function parlayKey(parlay: Parlay){ return parlay.legs.map(l => `${l.id}:${l.price}`).sort().join('|'); }

function modelBadges(leg: Leg){
  const parts = [];
  if (leg.modelCategory) parts.push(leg.modelCategory);
  if (leg.marketSoftness) parts.push(`Softness: ${leg.marketSoftness}`);
  if (leg.clvConfidence) parts.push(`CLV: ${leg.clvConfidence}`);
  if (leg.unitRecommendation !== undefined) parts.push(`Quarter-Kelly: ${leg.unitRecommendation.toFixed(2)}u per $100 bankroll`);
  return parts.join(' · ');
}

function startLabel(leg: Leg){
  if (!leg.commenceTime) return '';
  const text = new Date(leg.commenceTime).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const mins = leg.minutesUntilStart;
  const status = leg.startStatus ? leg.startStatus.toUpperCase() : 'UNKNOWN';
  return mins !== undefined ? `Starts ${text} · ${status} · ${mins} min` : `Starts ${text} · ${status}`;
}

function modeLabel(mode: Mode){
  if (mode === 'safe') return 'Conservative';
  if (mode === 'lowCorrelation') return 'Portfolio Mode';
  if (mode === 'aggressive') return 'High EV';
  return 'Standard';
}

function signalBadge(signal: Signal) {
  const colors: Record<SignalType, string> = {
    STEAM: 'steam',
    RLM: 'rlm',
    KEY_NUMBER: 'keynumber',
    LATE_SHARP: 'latesharp',
    LINE_FREEZE: 'linefreeze',
    SYNC_JUICING: 'syncjuicing'
  };
  return (
    <span key={signal.type} className={`signal-badge ${colors[signal.type]}`}>
      {signal.type} <small>({signal.historicalCLV > 0 ? '+' : ''}{(signal.historicalCLV * 100).toFixed(1)}% CLV)</small>
    </span>
  );
}

// Turtle Doctrine VIC Score breakdown - Chapter 8 weights
function vicScoreBreakdown(leg: Leg) {
  // Aligned with Chapter 8 signal weights
  const edgeWeight = 40;      // Edge detection
  const clvWeight = 25;       // CLV potential
  const softnessWeight = 20;  // Market softness
  const diversificationWeight = 15;  // Diversification
  
  const edgeScore = Math.min(edgeWeight, Math.max(0, Math.round(leg.edge * 400)));
  const clvScore = leg.clvConfidence === 'High' ? clvWeight : leg.clvConfidence === 'Medium' ? 15 : 8;
  const softnessScore = leg.marketSoftness === 'Very High' ? softnessWeight : leg.marketSoftness === 'High' ? 15 : leg.marketSoftness === 'Medium' ? 10 : 5;
  const diversificationScore = leg.event.includes('@') ? diversificationWeight : diversificationWeight * 0.6;
  
  // Signal bonus
  const signalBonus = leg.signals && leg.signals.length > 0 
    ? leg.signals.reduce((sum, s) => sum + (s.strength === 'High' ? 10 : s.strength === 'Medium' ? 6 : 3), 0)
    : 0;
  
  return [
    ['Edge Detection', edgeScore, edgeWeight],
    ['CLV Potential', clvScore, clvWeight],
    ['Market Softness', softnessScore, softnessWeight],
    ['Diversification', Math.round(diversificationScore), diversificationWeight],
    ['Signal Bonus', signalBonus, 20]
  ] as const;
}

function ParlayCard({ parlay, rank, onSave, saved }: { parlay: Parlay; rank?: number; onSave?: (p: Parlay)=>void; saved?: boolean }) {
  const hasSignals = parlay.legs.some(l => l.signals && l.signals.length > 0);
  
  return <div className="card">
    <div className="cardHead">
      <b>{rank ? `#${rank} ` : ''}{parlay.legs.length}-leg parlay</b>
      <span>{odds(parlay.americanOdds)}</span>
    </div>
    
    {hasSignals && (
      <div className="signalBar">
        {parlay.legs.flatMap(l => l.signals || []).slice(0, 3).map(s => signalBadge(s))}
      </div>
    )}
    
    <div className="metrics">
      <span>Est. hit: {pct(parlay.estimatedProbability)}</span>
      <span>EV: {(parlay.expectedValue*100).toFixed(1)}%</span>
      <span>VIC Score: {parlay.score.toFixed(1)}</span>
      <span>Mode: {parlay.mode ? modeLabel(parlay.mode) : 'Balanced'}</span>
      <span>Risk: {parlay.riskLabel || 'Medium'}</span>
    </div>
    
    <ul>{parlay.legs.map(leg => <li key={leg.id}>
      <b>{leg.selection}</b><br/>
      <small>
        {leg.event} · {leg.market} · DK {odds(leg.price)} · edge {pct(leg.edge)} · true {pct(leg.fairProbability)} vs implied {pct(leg.impliedProbability)}
        {leg.ticketMoneySplit?.isSplitAction && (
          <><br/>📊 Split Action: {Math.round(leg.ticketMoneySplit.ticketPercentage)}% tickets / {Math.round(leg.ticketMoneySplit.moneyPercentage)}% money</>
        )}
        {startLabel(leg) ? <><br/>{startLabel(leg)}</> : null}
        {leg.weather && (
          <><br/>🌤️ {leg.weather.temperature}°F · Wind {leg.weather.windSpeed}mph {leg.weather.windDirection !== 'none' ? leg.weather.windDirection : ''}</>
        )}
        {leg.lineupStatus && leg.lineupStatus !== 'unknown' && (
          <><br/>📋 Lineup: {leg.lineupStatus}</>
        )}
        {modelBadges(leg) ? <><br/>{modelBadges(leg)}</> : null}
      </small>
      <details className="scoreBreakdown">
        <summary>VIC Score breakdown (Chapter 8)</summary>
        {vicScoreBreakdown(leg).map(([label, value, max]) => <div className="scoreRow" key={label}><span>{label}</span><b>{value}/{max}</b></div>)}
        {leg.signals && leg.signals.length > 0 && (
          <div className="signalList">
            <b>Detected Signals:</b>
            {leg.signals.map(s => <div key={s.type} className="signalItem">{s.type}: {s.description}</div>)}
          </div>
        )}
      </details>
      {leg.modelReasons?.length ? <div className="reasons">{leg.modelReasons.slice(0,3).map(reason => <span key={reason}>{reason}</span>)}</div> : null}
    </li>)}</ul>
    {onSave && <button className="saveBtn" onClick={() => onSave(parlay)} disabled={saved}>{saved ? 'Saved' : 'Save to VIC Portfolio'}</button>}
  </div>;
}

function CLVDashboard({ summary, history }: { summary: CLVSummary; history: Array<{ id: string; savedAt: string; event: string; selection: string; openingLine: number; closingLine: number; clv: number; result?: 'win' | 'loss' | 'push' }> }) {
  return (
    <div className="clvDashboard">
      <h2>CLV Tracker — Chapter 7</h2>
      <p className="clvIntro">"The CLV tab is the most important graph in VIC. Not the P&L graph. The CLV graph. Because P&L is noisy."</p>
      
      <div className="clvMetrics">
        <div className="clvMetric">
          <b>{summary.totalBets}</b>
          <small>Total Bets</small>
        </div>
        <div className="clvMetric">
          <b>{(summary.avgCLV * 100).toFixed(2)}%</b>
          <small>Avg CLV</small>
        </div>
        <div className="clvMetric">
          <b>{summary.positiveCLVPercent.toFixed(1)}%</b>
          <small>Positive CLV</small>
        </div>
        <div className="clvMetric">
          <b>{(summary.cumulativeCLV * 100).toFixed(2)}%</b>
          <small>Cumulative CLV</small>
        </div>
      </div>
      
      <div className="clvHistory">
        <h3>Recent CLV Performance</h3>
        {history.length === 0 ? (
          <p className="empty">No CLV data yet. Save parlays to start tracking.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Event</th>
                <th>Selection</th>
                <th>Open</th>
                <th>Close</th>
                <th>CLV</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 20).map(row => (
                <tr key={row.id} className={row.clv > 0 ? 'positive' : row.clv < 0 ? 'negative' : ''}>
                  <td>{new Date(row.savedAt).toLocaleDateString()}</td>
                  <td>{row.event}</td>
                  <td>{row.selection}</td>
                  <td>{row.openingLine > 0 ? `+${row.openingLine}` : row.openingLine}</td>
                  <td>{row.closingLine > 0 ? `+${row.closingLine}` : row.closingLine}</td>
                  <td>{row.clv > 0 ? '+' : ''}{(row.clv * 100).toFixed(2)}%</td>
                  <td>{row.result || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function BankrollDashboard({ summary, state }: { summary: BankrollSummary; state: any }) {
  return (
    <div className="bankrollDashboard">
      <h2>Bankroll Tracker — Chapter 10</h2>
      <p className="bankrollIntro">"The Turtle Position-Sizing System: Bankroll tiers, drawdown adjustments, quarter-Kelly staking."</p>
      
      <div className="bankrollCards">
        <div className="bankrollCard">
          <b>Tier</b>
          <span className="tier">{summary.tier}</span>
        </div>
        <div className="bankrollCard">
          <b>Bankroll</b>
          <span>{summary.bankroll}</span>
        </div>
        <div className="bankrollCard">
          <b>Unit Size</b>
          <span>{summary.unitSize}</span>
        </div>
        <div className="bankrollCard">
          <b>Units</b>
          <span>{summary.units}u</span>
        </div>
        <div className="bankrollCard">
          <b>Available</b>
          <span>{summary.availableUnits}u</span>
        </div>
        <div className="bankrollCard">
          <b>Drawdown</b>
          <span className={parseFloat(summary.drawdown) > 20 ? 'warning' : ''}>{summary.drawdown}</span>
        </div>
        <div className="bankrollCard">
          <b>P/L</b>
          <span className={summary.profitLoss.startsWith('+') ? 'positive' : 'negative'}>{summary.profitLoss}</span>
        </div>
        <div className="bankrollCard">
          <b>Peak</b>
          <span>{summary.peakBankroll}</span>
        </div>
      </div>
      
      <div className="bankrollGuidance">
        <h3>Turtle Doctrine Position Sizing</h3>
        <ul>
          <li><b>Tier 1</b> ($10k+): 1% unit size</li>
          <li><b>Tier 2</b> ($5k+): 1.5% unit size</li>
          <li><b>Tier 3</b> ($2k+): 2% unit size</li>
          <li><b>Tier 4</b> ($500+): 2.5% unit size</li>
        </ul>
        <p><i>At 10% drawdown: reduce units by 25%. At 20%: reduce by 50%. At 30%: stop betting.</i></p>
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [tab, setTab] = useState<Tab>('threeLegs');
  const [history, setHistory] = useState<SavedParlay[]>([]);
  const [filters, setFilters] = useState<Filters>({ minLegEdge: 0, minParlayEv: -25, minScore: -999, search: '' });
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [includeAlternates, setIncludeAlternates] = useState(false);
  const [mode, setMode] = useState<Mode>('balanced');
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(DEFAULT_MARKETS);
  const [clvSummary, setCLVSummary] = useState<CLVSummary | null>(null);
  const [clvHistory, setCLVHistory] = useState<any[]>([]);
  const [bankrollSummary, setBankrollSummary] = useState<BankrollSummary | null>(null);
  const [bankrollState, setBankrollState] = useState<any>(null);

  useEffect(() => {
    setData(null);
    const apiMarkets = includeAlternates
      ? Array.from(new Set([...selectedMarkets, ...selectedMarkets.map(m => `${m}_alternate`)]))
      : selectedMarkets;
    const params = new URLSearchParams({
      upcomingOnly: upcomingOnly ? '1' : '0',
      alternates: includeAlternates ? '1' : '0',
      mode,
      markets: apiMarkets.join(',')
    });
    fetch(`/api/parlays?${params.toString()}`).then(r => r.json()).then(setData);
  }, [upcomingOnly, includeAlternates, mode, selectedMarkets]);
  
  useEffect(() => { 
    loadHistory();
    loadCLVData();
    loadBankrollData();
  }, []);

  async function loadHistory() {
    const res = await fetch('/api/history', { cache: 'no-store' });
    const json = await res.json();
    const rows: SavedRecord[] = json.saved || [];
    setHistory(rows.map(row => ({ ...row.parlay, id: row.id, savedAt: row.savedAt, note: row.note })));
  }
  
  async function loadCLVData() {
    try {
      const summaryRes = await fetch('/api/clv?action=summary');
      const summaryData = await summaryRes.json();
      setCLVSummary(summaryData.summary);
      
      const historyRes = await fetch('/api/clv?action=history&limit=100');
      const historyData = await historyRes.json();
      setCLVHistory(historyData.history || []);
    } catch (err) {
      console.error('Failed to load CLV data:', err);
    }
  }
  
  async function loadBankrollData() {
    try {
      const res = await fetch('/api/bankroll?action=summary');
      const bankrollData = await res.json();
      setBankrollSummary(bankrollData.summary);
      setBankrollState(bankrollData.state);
    } catch (err) {
      console.error('Failed to load bankroll data:', err);
    }
  }

  async function saveParlay(parlay: Parlay) {
    const key = parlayKey(parlay);
    if (history.some(p => p.id === key)) return;
    
    // Extract signal types from legs
    const signalTypes = Array.from(new Set(parlay.legs.flatMap(l => l.signals?.map(s => s.type) || [])));
    
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        id: key, 
        parlay,
        openingLine: parlay.americanOdds,
        signalTypes
      })
    });
    await loadHistory();
    await loadCLVData();
  }

  async function clearHistory() {
    if (!confirm('Clear saved parlay history?')) return;
    await fetch('/api/history', { method: 'DELETE' });
    setHistory([]);
  }

  function toggleMarket(market: string) {
    setSelectedMarkets(current => current.includes(market) ? current.filter(m => m !== market) : [...current, market]);
  }

  function setGroup(group: keyof typeof MARKET_GROUPS) {
    setSelectedMarkets(MARKET_GROUPS[group].map(([key]) => key));
  }

  const parlays = useMemo(() => {
    if (tab === 'clv' || tab === 'bankroll') return [];  // These tabs use separate data
    const base: Parlay[] = tab === 'history' ? history : (tab === 'threeLegs' ? data?.threeLegs : tab === 'fourLegs' ? data?.fourLegs : tab === 'fiveLegs' ? data?.fiveLegs : []) || [];
    const query = filters.search.trim().toLowerCase();
    return base.filter((parlay: Parlay) => {
      if (upcomingOnly && !parlay.legs.every((leg: Leg) => !leg.commenceTime || new Date(leg.commenceTime).getTime() > Date.now())) return false;
      if (parlay.expectedValue * 100 < filters.minParlayEv) return false;
      if (parlay.score < filters.minScore) return false;
      if (!parlay.legs.every((leg: Leg) => leg.edge * 100 >= filters.minLegEdge)) return false;
      if (selectedMarkets.length && !parlay.legs.some((leg: Leg) => selectedMarkets.includes(leg.market))) return false;
      if (query && !parlay.legs.some((leg: Leg) => `${leg.selection} ${leg.event} ${leg.market}`.toLowerCase().includes(query))) return false;
      return true;
    });
  }, [data, tab, history, filters, upcomingOnly, selectedMarkets]);

  const savedKeys = new Set(history.map(p => p.id));

  return <main>
    <section className="hero">
      <div className="brandLine">Oddsify Labs · VIC Framework</div>
      <h1>VIC MLB Props</h1>
      <p>Player Prop Intelligence + Parlay Builder</p>
      <p className="heroSub">Find value before the market moves. Built on Value • Information • Closing Line Edge.</p>
    </section>
    
    <nav className="topNav">
      <span className={tab !== 'clv' && tab !== 'bankroll' ? 'active' : ''} onClick={() => setTab('threeLegs')}>Signals</span>
      <span onClick={() => setTab('clv')}>CLV Tracker</span>
      <span onClick={() => setTab('bankroll')}>Bankroll</span>
      <span className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>VIC Portfolio</span>
      <span>Settings</span>
    </nav>
    
    {data && <div className={data.usingMockData ? 'warning' : 'status'}>
      {data.status || (data.usingMockData ? 'Using mock data' : 'Live odds loaded')}
      {data.modelVersion ? <><br/><small>Model: {data.modelVersion} · Builder: {modeLabel(mode)}</small></> : null}
      {!data.usingMockData && <><br/><small>Events found: {data.eventsFound ?? 0} · Upcoming eligible: {data.eventsEligible ?? 0} · Filtered out: {data.eventsFilteredOut ?? 0} · Events scanned: {data.eventsScanned ?? 0} · +EV DraftKings legs: {data.legsFound ?? 0}</small></>}
    </div>}
    {data?.error && <div className="warning">{data.error}</div>}
    
    {tab === 'clv' ? (
      clvSummary ? <CLVDashboard summary={clvSummary} history={clvHistory} /> : <p>Loading CLV data...</p>
    ) : tab === 'bankroll' ? (
      bankrollSummary ? <BankrollDashboard summary={bankrollSummary} state={bankrollState} /> : <p>Loading bankroll data...</p>
    ) : (
      <>
        <div className="tabs">
          <button className={tab==='threeLegs'?'active':''} onClick={()=>setTab('threeLegs')}>3-leg</button>
          <button className={tab==='fourLegs'?'active':''} onClick={()=>setTab('fourLegs')}>4-leg</button>
          <button className={tab==='fiveLegs'?'active':''} onClick={()=>setTab('fiveLegs')}>5-leg</button>
          <button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>VIC Portfolio ({history.length})</button>
        </div>

        <section className="builderModes">
          <button className={mode==='safe'?'active':''} onClick={()=>setMode('safe')}><b>Conservative</b><small>Higher edge, more CLV, diversified</small></button>
          <button className={mode==='balanced'?'active':''} onClick={()=>setMode('balanced')}><b>Standard</b><small>Best overall VIC Score</small></button>
          <button className={mode==='lowCorrelation'?'active':''} onClick={()=>setMode('lowCorrelation')}><b>Portfolio Mode</b><small>One leg per game when possible</small></button>
          <button className={mode==='aggressive'?'active':''} onClick={()=>setMode('aggressive')}><b>High EV</b><small>Allows more upside/plus-money legs</small></button>
        </section>

        <section className="filters">
          <label className="checkFilter"><input type="checkbox" checked={upcomingOnly} onChange={e=>setUpcomingOnly(e.target.checked)}/> Upcoming games only</label>
          <label className="checkFilter"><input type="checkbox" checked={includeAlternates} onChange={e=>setIncludeAlternates(e.target.checked)}/> Include alternate props</label>
          <label>Min leg edge %<input type="number" value={filters.minLegEdge} onChange={e=>setFilters({...filters, minLegEdge: Number(e.target.value)})}/></label>
          <label>Min parlay EV %<input type="number" value={filters.minParlayEv} onChange={e=>setFilters({...filters, minParlayEv: Number(e.target.value)})}/></label>
          <label>Min score<input type="number" value={filters.minScore} onChange={e=>setFilters({...filters, minScore: Number(e.target.value)})}/></label>
          <label>Search<input placeholder="player, team, market" value={filters.search} onChange={e=>setFilters({...filters, search: e.target.value})}/></label>
        </section>

        <section className="marketFilters">
          <div className="marketToolbar">
            <b>Prop market filters</b>
            <span>{selectedMarkets.length} selected</span>
            <button onClick={()=>setSelectedMarkets([])}>Clear</button>
            <button onClick={()=>setSelectedMarkets(DEFAULT_MARKETS)}>Core</button>
            <button onClick={()=>setGroup('pitcher')}>Pitcher only</button>
            <button onClick={()=>setGroup('hitter')}>Hitter only</button>
            <button onClick={()=>setGroup('game')}>Game only</button>
          </div>
          {Object.entries(MARKET_GROUPS).map(([group, markets]) => <div className="marketGroup" key={group}>
            <h3>{group}</h3>
            <div className="marketChips">{markets.map(([key, label]) => <label key={key} className={selectedMarkets.includes(key) ? 'chip active' : 'chip'}><input type="checkbox" checked={selectedMarkets.includes(key)} onChange={()=>toggleMarket(key)}/>{label}</label>)}</div>
          </div>)}
        </section>

        {tab === 'history' && <div className="historyBar"><span>VIC Portfolio entries are stored in SQLite on this USB/project folder.</span><button onClick={clearHistory}>Clear history</button></div>}

        {!data && tab !== 'history' ? <p>Loading...</p> : parlays.length === 0 ? <p className="empty">No parlays match these filters.</p> : <div className="grid">{parlays.map((p: Parlay, i: number) => <ParlayCard key={`${parlayKey(p)}-${i}`} parlay={p} rank={i+1} onSave={tab === 'history' ? undefined : saveParlay} saved={savedKeys.has(parlayKey(p))}/>)}</div>}
      </>
    )}
    
    <footer>VIC MLB Props is informational only. Confirm every line in DraftKings before betting and avoid wagering more than you can afford to lose.</footer>
  </main>;
}
