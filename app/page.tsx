'use client';
import { useEffect, useState } from 'react';

type Leg = { id:string; event:string; market:string; selection:string; price:number; impliedProbability:number; fairProbability:number; edge:number };
type Parlay = { legs: Leg[]; americanOdds:number; estimatedProbability:number; expectedValue:number; score:number };
type ApiResponse = { generatedAt:string; usingMockData:boolean; threeLegs:Parlay[]; fiveLegs:Parlay[]; error?:string };

function pct(n:number){ return `${(n*100).toFixed(1)}%`; }
function odds(n:number){ return n > 0 ? `+${n}` : `${n}`; }

function ParlayCard({ parlay, rank }: { parlay: Parlay; rank: number }) {
  return <div className="card">
    <div className="cardHead"><b>#{rank} {parlay.legs.length}-leg parlay</b><span>{odds(parlay.americanOdds)}</span></div>
    <div className="metrics"><span>Est. hit: {pct(parlay.estimatedProbability)}</span><span>EV: {(parlay.expectedValue*100).toFixed(1)}%</span><span>Score: {parlay.score.toFixed(1)}</span></div>
    <ul>{parlay.legs.map(leg => <li key={leg.id}><b>{leg.selection}</b><br/><small>{leg.event} · {leg.market} · DK {odds(leg.price)} · edge {pct(leg.edge)}</small></li>)}</ul>
  </div>;
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [tab, setTab] = useState<'threeLegs'|'fiveLegs'>('threeLegs');
  useEffect(() => { fetch('/api/parlays').then(r => r.json()).then(setData); }, []);
  const parlays = data?.[tab] || [];
  return <main>
    <section className="hero"><h1>MLB Parlay Finder</h1><p>Ranks DraftKings MLB player props and game props into 3-leg and 5-leg parlay candidates.</p></section>
    {data?.usingMockData && <div className="warning">Mock data is active. Add ODDS_API_KEY in .env.local to pull live DraftKings MLB odds.</div>}
    {data?.error && <div className="warning">{data.error}</div>}
    <div className="tabs"><button className={tab==='threeLegs'?'active':''} onClick={()=>setTab('threeLegs')}>3-leg parlays</button><button className={tab==='fiveLegs'?'active':''} onClick={()=>setTab('fiveLegs')}>5-leg parlays</button></div>
    {!data ? <p>Loading...</p> : <div className="grid">{parlays.map((p,i)=><ParlayCard key={i} parlay={p} rank={i+1}/>)}</div>}
    <footer>This tool is informational only. Confirm every line in DraftKings before betting and avoid wagering more than you can afford to lose.</footer>
  </main>;
}
