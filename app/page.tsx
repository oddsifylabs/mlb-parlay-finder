'use client';
import { useEffect, useMemo, useState } from 'react';

type Leg = { id:string; event:string; market:string; selection:string; price:number; impliedProbability:number; fairProbability:number; edge:number; source?:string; commenceTime?:string; startStatus?:'green'|'yellow'|'red'|'started'|'unknown'; minutesUntilStart?:number };
type Parlay = { legs: Leg[]; americanOdds:number; estimatedProbability:number; expectedValue:number; score:number };
type ApiResponse = { generatedAt:string; usingMockData:boolean; status?:string; eventsFound?:number; eventsScanned?:number; eventsEligible?:number; eventsFilteredOut?:number; upcomingOnly?:boolean; legsFound?:number; marketsRequested?:string[]; threeLegs:Parlay[]; fiveLegs:Parlay[]; error?:string };
type SavedParlay = Parlay & { id: string; savedAt: string; note?: string };
type SavedRecord = { id: string; savedAt: string; note?: string; parlay: Parlay };

type Filters = {
  minLegEdge: number;
  minParlayEv: number;
  minScore: number;
  market: string;
  search: string;
};


function pct(n:number){ return `${(n*100).toFixed(1)}%`; }
function odds(n:number){ return n > 0 ? `+${n}` : `${n}`; }
function parlayKey(parlay: Parlay){ return parlay.legs.map(l => `${l.id}:${l.price}`).sort().join('|'); }
function startLabel(leg: Leg){
  if (!leg.commenceTime) return '';
  const text = new Date(leg.commenceTime).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const mins = leg.minutesUntilStart;
  const status = leg.startStatus ? leg.startStatus.toUpperCase() : 'UNKNOWN';
  return mins !== undefined ? `Starts ${text} · ${status} · ${mins} min` : `Starts ${text} · ${status}`;
}

function ParlayCard({ parlay, rank, onSave, saved }: { parlay: Parlay; rank?: number; onSave?: (p: Parlay)=>void; saved?: boolean }) {
  return <div className="card">
    <div className="cardHead"><b>{rank ? `#${rank} ` : ''}{parlay.legs.length}-leg parlay</b><span>{odds(parlay.americanOdds)}</span></div>
    <div className="metrics"><span>Est. hit: {pct(parlay.estimatedProbability)}</span><span>EV: {(parlay.expectedValue*100).toFixed(1)}%</span><span>Score: {parlay.score.toFixed(1)}</span></div>
    <ul>{parlay.legs.map(leg => <li key={leg.id}><b>{leg.selection}</b><br/><small>{leg.event} · {leg.market} · DK {odds(leg.price)} · edge {pct(leg.edge)}{startLabel(leg) ? <><br/>{startLabel(leg)}</> : null}</small></li>)}</ul>
    {onSave && <button className="saveBtn" onClick={() => onSave(parlay)} disabled={saved}>{saved ? 'Saved' : 'Save to history'}</button>}
  </div>;
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [tab, setTab] = useState<'threeLegs'|'fiveLegs'|'history'>('threeLegs');
  const [history, setHistory] = useState<SavedParlay[]>([]);
  const [filters, setFilters] = useState<Filters>({ minLegEdge: 0, minParlayEv: -25, minScore: -999, market: 'all', search: '' });
  const [upcomingOnly, setUpcomingOnly] = useState(true);

  useEffect(() => {
    setData(null);
    fetch(`/api/parlays?upcomingOnly=${upcomingOnly ? '1' : '0'}`).then(r => r.json()).then(setData);
  }, [upcomingOnly]);
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

  const availableMarkets = useMemo(() => {
    const parlays = [...(data?.threeLegs || []), ...(data?.fiveLegs || [])];
    return Array.from(new Set(parlays.flatMap(p => p.legs.map(l => l.market)))).sort();
  }, [data]);

  const parlays = useMemo(() => {
    const base = tab === 'history' ? history : data?.[tab] || [];
    const query = filters.search.trim().toLowerCase();
    return base.filter(parlay => {
      if (upcomingOnly && !parlay.legs.every(leg => !leg.commenceTime || new Date(leg.commenceTime).getTime() > Date.now())) return false;
      if (parlay.expectedValue * 100 < filters.minParlayEv) return false;
      if (parlay.score < filters.minScore) return false;
      if (!parlay.legs.every(leg => leg.edge * 100 >= filters.minLegEdge)) return false;
      if (filters.market !== 'all' && !parlay.legs.some(leg => leg.market === filters.market)) return false;
      if (query && !parlay.legs.some(leg => `${leg.selection} ${leg.event} ${leg.market}`.toLowerCase().includes(query))) return false;
      return true;
    });
  }, [data, tab, history, filters, upcomingOnly]);

  const savedKeys = new Set(history.map(p => p.id));

  return <main>
    <section className="hero"><h1>MLB Parlay Finder</h1><p>Ranks DraftKings MLB player props and game props into 3-leg and 5-leg parlay candidates.</p></section>
    {data && <div className={data.usingMockData ? 'warning' : 'status'}>{data.status || (data.usingMockData ? 'Using mock data' : 'Live odds loaded')}{!data.usingMockData && <><br/><small>Events found: {data.eventsFound ?? 0} · Upcoming eligible: {data.eventsEligible ?? 0} · Filtered out: {data.eventsFilteredOut ?? 0} · Events scanned: {data.eventsScanned ?? 0} · +EV DraftKings legs: {data.legsFound ?? 0}</small></>}</div>}
    {data?.error && <div className="warning">{data.error}</div>}

    <div className="tabs">
      <button className={tab==='threeLegs'?'active':''} onClick={()=>setTab('threeLegs')}>3-leg parlays</button>
      <button className={tab==='fiveLegs'?'active':''} onClick={()=>setTab('fiveLegs')}>5-leg parlays</button>
      <button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>History ({history.length})</button>
    </div>

    <section className="filters">
      <label className="checkFilter"><input type="checkbox" checked={upcomingOnly} onChange={e=>setUpcomingOnly(e.target.checked)}/> Upcoming games only</label>
      <label>Min leg edge %<input type="number" value={filters.minLegEdge} onChange={e=>setFilters({...filters, minLegEdge: Number(e.target.value)})}/></label>
      <label>Min parlay EV %<input type="number" value={filters.minParlayEv} onChange={e=>setFilters({...filters, minParlayEv: Number(e.target.value)})}/></label>
      <label>Min score<input type="number" value={filters.minScore} onChange={e=>setFilters({...filters, minScore: Number(e.target.value)})}/></label>
      <label>Market<select value={filters.market} onChange={e=>setFilters({...filters, market: e.target.value})}><option value="all">All markets</option>{availableMarkets.map(m => <option key={m} value={m}>{m}</option>)}</select></label>
      <label>Search<input placeholder="player, team, market" value={filters.search} onChange={e=>setFilters({...filters, search: e.target.value})}/></label>
    </section>

    {tab === 'history' && <div className="historyBar"><span>Saved parlays are stored in SQLite on this USB/project folder.</span><button onClick={clearHistory}>Clear history</button></div>}

    {!data && tab !== 'history' ? <p>Loading...</p> : parlays.length === 0 ? <p className="empty">No parlays match these filters.</p> : <div className="grid">{parlays.map((p,i)=><ParlayCard key={`${parlayKey(p)}-${i}`} parlay={p} rank={i+1} onSave={tab === 'history' ? undefined : saveParlay} saved={savedKeys.has(parlayKey(p))}/>)}</div>}
    <footer>This tool is informational only. Confirm every line in DraftKings before betting and avoid wagering more than you can afford to lose.</footer>
  </main>;
}
