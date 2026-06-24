'use client';
import { useEffect, useMemo, useState } from 'react';

type Mode = 'safe' | 'balanced' | 'lowCorrelation' | 'aggressive';
type Tab = 'threeLegs' | 'fourLegs' | 'fiveLegs' | 'history';

type Leg = { id:string; event:string; market:string; selection:string; price:number; impliedProbability:number; fairProbability:number; edge:number; source?:string; modelVersion?:string; modelCategory?:string; marketSoftness?:string; evCeiling?:string; clvConfidence?:'High'|'Medium'|'Low'; kellyFraction?:number; unitRecommendation?:number; modelReasons?:string[]; commenceTime?:string; startStatus?:'green'|'yellow'|'red'|'started'|'unknown'; minutesUntilStart?:number };
type Parlay = { legs: Leg[]; americanOdds:number; estimatedProbability:number; expectedValue:number; score:number; mode?:Mode; riskLabel?:'Low'|'Medium'|'High' };
type ApiResponse = { generatedAt:string; usingMockData:boolean; status?:string; modelVersion?:string; mode?:Mode; eventsFound?:number; eventsScanned?:number; eventsEligible?:number; eventsFilteredOut?:number; upcomingOnly?:boolean; legsFound?:number; marketsRequested?:string[]; threeLegs:Parlay[]; fourLegs:Parlay[]; fiveLegs:Parlay[]; error?:string };
type SavedParlay = Parlay & { id: string; savedAt: string; note?: string };
type SavedRecord = { id: string; savedAt: string; note?: string; parlay: Parlay };

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

function vicScoreBreakdown(leg: Leg) {
  const pitcherProfile = leg.market.startsWith('pitcher_') ? 28 : leg.market.includes('strikeouts') ? 18 : 12;
  const statcastEdge = Math.min(25, Math.max(8, Math.round(10 + leg.edge * 420)));
  const marketEdge = Math.min(20, Math.max(6, Math.round(8 + leg.edge * 300)));
  const weather = leg.market.includes('home_runs') || leg.market.includes('total_bases') ? 8 : leg.market.startsWith('pitcher_') ? 6 : 5;
  const bvp = leg.market.startsWith('batter_') ? 7 : 4;
  const clvPotential = leg.clvConfidence === 'High' ? 9 : leg.clvConfidence === 'Medium' ? 6 : 3;
  return [
    ['Pitcher Profile', pitcherProfile, 30],
    ['Statcast Edge', statcastEdge, 25],
    ['Market Edge', marketEdge, 20],
    ['Weather', weather, 10],
    ['BvP / Matchup', bvp, 10],
    ['CLV Potential', clvPotential, 10]
  ] as const;
}

function ParlayCard({ parlay, rank, onSave, saved }: { parlay: Parlay; rank?: number; onSave?: (p: Parlay)=>void; saved?: boolean }) {
  return <div className="card">
    <div className="cardHead"><b>{rank ? `#${rank} ` : ''}{parlay.legs.length}-leg parlay</b><span>{odds(parlay.americanOdds)}</span></div>
    <div className="metrics"><span>Est. hit: {pct(parlay.estimatedProbability)}</span><span>EV: {(parlay.expectedValue*100).toFixed(1)}%</span><span>VIC Score: {parlay.score.toFixed(1)}</span><span>Mode: {parlay.mode ? modeLabel(parlay.mode) : 'Balanced'}</span><span>Risk: {parlay.riskLabel || 'Medium'}</span></div>
    <ul>{parlay.legs.map(leg => <li key={leg.id}>
      <b>{leg.selection}</b><br/>
      <small>{leg.event} · {leg.market} · DK {odds(leg.price)} · edge {pct(leg.edge)} · true {pct(leg.fairProbability)} vs implied {pct(leg.impliedProbability)}{startLabel(leg) ? <><br/>{startLabel(leg)}</> : null}{modelBadges(leg) ? <><br/>{modelBadges(leg)}</> : null}</small>
      <details className="scoreBreakdown">
        <summary>VIC Score breakdown</summary>
        {vicScoreBreakdown(leg).map(([label, value, max]) => <div className="scoreRow" key={label}><span>{label}</span><b>{value}/{max}</b></div>)}
      </details>
      {leg.modelReasons?.length ? <div className="reasons">{leg.modelReasons.slice(0,3).map(reason => <span key={reason}>{reason}</span>)}</div> : null}
    </li>)}</ul>
    {onSave && <button className="saveBtn" onClick={() => onSave(parlay)} disabled={saved}>{saved ? 'Saved' : 'Save to history'}</button>}
  </div>;
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
  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    const res = await fetch('/api/history', { cache: 'no-store' });
    const json = await res.json();
    const rows: SavedRecord[] = json.saved || [];
    setHistory(rows.map(row => ({ ...row.parlay, id: row.id, savedAt: row.savedAt, note: row.note })));
  }

  async function saveParlay(parlay: Parlay) {
    const key = parlayKey(parlay);
    if (history.some(p => p.id === key)) return;
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: key, parlay })
    });
    await loadHistory();
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
    const base = tab === 'history' ? history : data?.[tab] || [];
    const query = filters.search.trim().toLowerCase();
    return base.filter(parlay => {
      if (upcomingOnly && !parlay.legs.every(leg => !leg.commenceTime || new Date(leg.commenceTime).getTime() > Date.now())) return false;
      if (parlay.expectedValue * 100 < filters.minParlayEv) return false;
      if (parlay.score < filters.minScore) return false;
      if (!parlay.legs.every(leg => leg.edge * 100 >= filters.minLegEdge)) return false;
      if (selectedMarkets.length && !parlay.legs.some(leg => selectedMarkets.includes(leg.market))) return false;
      if (query && !parlay.legs.some(leg => `${leg.selection} ${leg.event} ${leg.market}`.toLowerCase().includes(query))) return false;
      return true;
    });
  }, [data, tab, history, filters, upcomingOnly, selectedMarkets]);

  const savedKeys = new Set(history.map(p => p.id));

  return <main>
    <section className="hero"><div className="brandLine">Oddsify Labs · VIC Framework</div><h1>VIC MLB Props</h1><p>Player Prop Intelligence + Parlay Builder</p><p className="heroSub">Find value before the market moves. Built on Value • Information • Closing Line Edge.</p></section>
    <nav className="topNav"><span className="active">Dashboard</span><span>Props</span><span>Parlays</span><span>Portfolio</span><span>Settings</span></nav>
    {data && <div className={data.usingMockData ? 'warning' : 'status'}>{data.status || (data.usingMockData ? 'Using mock data' : 'Live odds loaded')}{data.modelVersion ? <><br/><small>Model: {data.modelVersion} · Builder: {modeLabel(mode)}</small></> : null}{!data.usingMockData && <><br/><small>Events found: {data.eventsFound ?? 0} · Upcoming eligible: {data.eventsEligible ?? 0} · Filtered out: {data.eventsFilteredOut ?? 0} · Events scanned: {data.eventsScanned ?? 0} · +EV DraftKings legs: {data.legsFound ?? 0}</small></>}</div>}
    {data?.error && <div className="warning">{data.error}</div>}

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

    {!data && tab !== 'history' ? <p>Loading...</p> : parlays.length === 0 ? <p className="empty">No parlays match these filters.</p> : <div className="grid">{parlays.map((p,i)=><ParlayCard key={`${parlayKey(p)}-${i}`} parlay={p} rank={i+1} onSave={tab === 'history' ? undefined : saveParlay} saved={savedKeys.has(parlayKey(p))}/>)}</div>}
    <footer>VIC MLB Props is informational only. Confirm every line in DraftKings before betting and avoid wagering more than you can afford to lose.</footer>
  </main>;
}
