'use client';
import { useEffect, useMemo, useState } from 'react';
import { 
  TrendingUp, 
  History, 
  BarChart3, 
  Wallet, 
  Settings, 
  Search,
  Filter,
  Download,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Target,
  Zap,
  Shield,
  TrendingDown,
  Activity,
  DollarSign,
  Percent,
  Trophy,
  Flame,
  ArrowUpRight,
  Menu,
  X
} from 'lucide-react';

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

type Leg = { 
  id:string; 
  event:string; 
  market:string; 
  selection:string; 
  price:number; 
  impliedProbability:number; 
  fairProbability:number; 
  edge:number; 
  source?:string; 
  bookmakerKey?:string; 
  modelVersion?:string; 
  modelCategory?:string; 
  marketSoftness?:string; 
  evCeiling?:string; 
  clvConfidence?:'High'|'Medium'|'Low'; 
  kellyFraction?:number; 
  unitRecommendation?:number; 
  modelReasons?:string[]; 
  commenceTime?:string; 
  startStatus?:'green'|'yellow'|'red'|'started'|'unknown'; 
  minutesUntilStart?:number; 
  signals?:Signal[]; 
  signalScore?:number; 
  ticketMoneySplit?:{ticketPercentage:number;moneyPercentage:number;isSplitAction:boolean}; 
  clvData?:{openingLine?:number;currentLine?:number;closingLine?:number;clv?:number}; 
  weather?:{temperature:number;windSpeed:number;windDirection:'in'|'out'|'left'|'right'|'none';precipitation:number;condition:'clear'|'cloudy'|'rain'|'snow'|'storm'}; 
  lineupStatus?:'confirmed'|'projected'|'unknown'; 
  previousEdge?:number; 
};

type Parlay = { 
  legs: Leg[]; 
  americanOdds:number; 
  estimatedProbability:number; 
  expectedValue:number; 
  score:number; 
  mode?:Mode; 
  riskLabel?:'Low'|'Medium'|'High' 
};

type ApiResponse = { 
  generatedAt:string; 
  usingMockData:boolean; 
  status?:string; 
  modelVersion?:string; 
  mode?:Mode; 
  eventsFound?:number; 
  eventsScanned?:number; 
  eventsEligible?:number; 
  eventsFilteredOut?:number; 
  upcomingOnly?:boolean; 
  legsFound?:number; 
  marketsRequested?:string[]; 
  threeLegs:Parlay[]; 
  fourLegs:Parlay[]; 
  fiveLegs:Parlay[]; 
  error?:string 
};

type SavedParlay = Parlay & { 
  id: string; 
  savedAt: string; 
  note?: string; 
  openingLine?:number; 
  closingLine?:number; 
  clv?:number; 
  result?:'win'|'loss'|'push'; 
  signalTypes?:string[]; 
};

type SavedRecord = { 
  id: string; 
  savedAt: string; 
  note?: string; 
  parlay: Parlay 
};

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

const DEFAULT_MARKETS = ['pitcher_strikeouts','pitcher_outs','pitcher_walks','batter_hits','batter_total_bases','batter_hits_runs_rbis','batter_home_runs','batter_strikeouts','batter_stolen_bases','h2h','totals'];

function pct(n:number){ return `${(n*100).toFixed(1)}%`; }
function odds(n:number){ return n > 0 ? `+${n}` : `${n}`; }
function parlayKey(parlay: Parlay){ return parlay.legs.map(l => `${l.id}:${l.price}`).sort().join('|'); }

function modelBadges(leg: Leg){
  const parts = [];
  if (leg.modelCategory) parts.push(leg.modelCategory);
  if (leg.marketSoftness) parts.push(`Softness: ${leg.marketSoftness}`);
  if (leg.clvConfidence) parts.push(`CLV: ${leg.clvConfidence}`);
  if (leg.unitRecommendation !== undefined) parts.push(`Quarter-Kelly: ${leg.unitRecommendation.toFixed(2)}u`);
  return parts.join(' · ');
}

function startLabel(leg: Leg){
  if (!leg.commenceTime) return '';
  const text = new Date(leg.commenceTime).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const mins = leg.minutesUntilStart;
  const status = leg.startStatus ? leg.startStatus.toUpperCase() : 'UNKNOWN';
  return mins !== undefined ? `${text} · ${status} · ${mins}m` : `${text} · ${status}`;
}

function modeLabel(mode: Mode){
  return ({ 
    safe: 'Safe', 
    balanced: 'Balanced', 
    lowCorrelation: 'Low Correlation', 
    aggressive: 'Aggressive' 
  })[mode];
}

function getBookmakerLabel(key?: string) {
  if (!key) return 'DK';
  if (key === 'fanduel') return 'FD';
  if (key === 'betmgm') return 'MGM';
  return 'DK';
}

function signalBadge(signal: Signal){
  const colorClass = {
    STEAM: 'steam',
    RLM: 'rlm',
    KEY_NUMBER: 'keynumber',
    LATE_SHARP: 'latesharp',
    LINE_FREEZE: 'linefreeze',
    SYNC_JUICING: 'syncjuicing'
  }[signal.type];
  return <span key={signal.type} className={`signal-badge ${colorClass}`}>{signal.type}</span>;
}

function vicScoreBreakdown(leg: Leg){
  const edgeScore = Math.min(40, Math.round(leg.edge * 400));
  const clvScore = ({ High: 25, Medium: 18, Low: 10 }[leg.clvConfidence || 'Medium']);
  const softnessScore = ({ 'Very High': 20, High: 15, Medium: 10, Low: 5 }[leg.marketSoftness || 'Medium']);
  const diversificationScore = Math.min(15, Math.round(leg.edge * 100));
  const signalBonus = leg.signals ? Math.min(20, leg.signals.length * 5) : 0;
  
  return [
    ['Edge Detection', edgeScore, 40],
    ['CLV Potential', clvScore, 25],
    ['Market Softness', softnessScore, 20],
    ['Diversification', Math.round(diversificationScore), 15],
    ['Signal Bonus', signalBonus, 20]
  ] as const;
}

function ParlayCard({ parlay, rank, onSave, saved }: { 
  parlay: Parlay; 
  rank?: number; 
  onSave?: (p: Parlay)=>void; 
  saved?: boolean 
}) {
  const hasSignals = parlay.legs.some(l => l.signals && l.signals.length > 0);
  
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          {rank ? `#${rank} ` : ''}{parlay.legs.length}-leg parlay
        </div>
        <div className="card-odds">{odds(parlay.americanOdds)}</div>
      </div>
      
      {hasSignals && (
        <div className="signal-bar">
          {parlay.legs.flatMap(l => l.signals || []).slice(0, 3).map(s => signalBadge(s))}
        </div>
      )}
      
      <div className="metrics">
        <span className="metric metric-primary">
          <Target size={12} />
          Hit: {pct(parlay.estimatedProbability)}
        </span>
        <span className="metric metric-secondary">
          <TrendingUp size={12} />
          EV: {(parlay.expectedValue*100).toFixed(1)}%
        </span>
        <span className="metric metric-highlight">
          <Trophy size={12} />
          VIC: {parlay.score.toFixed(1)}
        </span>
        <span className="metric">
          <Shield size={12} />
          {parlay.mode ? modeLabel(parlay.mode) : 'Balanced'}
        </span>
        <span className="metric">
          <AlertCircle size={12} />
          {parlay.riskLabel || 'Medium'}
        </span>
      </div>
      
      <ul className="legs-list">
        {parlay.legs.map(leg => (
          <li key={leg.id} className="leg-item">
            <div className="leg-selection">{leg.selection}</div>
            <div className="leg-details">
              <span className="leg-bookmaker">
                {getBookmakerLabel(leg.bookmakerKey)}
              </span>
              {odds(leg.price)} · edge {pct(leg.edge)} · true {pct(leg.fairProbability)} vs implied {pct(leg.impliedProbability)}
              <br/>
              {leg.event} · {leg.market}
              {startLabel(leg) && <><br/>{startLabel(leg)}</>}
              {modelBadges(leg) && <><br/>{modelBadges(leg)}</>}
            </div>
          </li>
        ))}
      </ul>
      
      <details className="score-breakdown">
        <summary>VIC Score Breakdown</summary>
        {vicScoreBreakdown(parlay.legs[0]).map(([label, value, max]) => (
          <div key={label} className="score-row">
            <span>{label}</span>
            <b>{value}/{max}</b>
          </div>
        ))}
      </details>
      
      {onSave && (
        <button 
          className="btn btn-primary save-btn" 
          onClick={() => onSave(parlay)} 
          disabled={saved}
        >
          {saved ? <><CheckCircle2 size={16} /> Saved</> : <><Save size={16} /> Save to Portfolio</>}
        </button>
      )}
    </div>
  );
}

function CLVDashboard({ 
  summary, 
  history 
}: { 
  summary: CLVSummary; 
  history: Array<{
    id: string; 
    savedAt: string; 
    event: string; 
    selection: string; 
    openingLine: number; 
    closingLine: number; 
    clv: number; 
    result?: 'win' | 'loss' | 'push'
  }> 
}) {
  async function exportData(format: 'txt' | 'md' | 'pdf') {
    window.open(`/api/export?type=clv&format=${format}`, '_blank');
  }
  
  return (
    <div className="clv-dashboard">
      <div className="dashboard-header">
        <h2 className="dashboard-title">
          <BarChart3 size={24} style={{ marginRight: 8 }} />
          CLV Tracker
        </h2>
        <div className="export-buttons">
          <button className="btn btn-secondary export-btn" onClick={() => exportData('txt')}>TXT</button>
          <button className="btn btn-secondary export-btn" onClick={() => exportData('md')}>MD</button>
          <button className="btn btn-secondary export-btn" onClick={() => exportData('pdf')}>PDF</button>
        </div>
      </div>
      
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontStyle: 'italic' }}>
        "The CLV tab is the most important metric. Not P&L. CLV. Because P&L is noisy."
      </p>
      
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{summary.totalBets}</div>
          <div className="metric-label">Total Bets</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{(summary.avgCLV * 100).toFixed(2)}%</div>
          <div className="metric-label">Avg CLV</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{summary.positiveCLVPercent.toFixed(1)}%</div>
          <div className="metric-label">Positive CLV</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{(summary.cumulativeCLV * 100).toFixed(2)}%</div>
          <div className="metric-label">Cumulative CLV</div>
        </div>
      </div>
      
      <div className="data-table-wrapper">
        <h3 style={{ color: 'var(--text-primary)', marginBottom: 12 }}>Recent CLV Performance</h3>
        {history.length === 0 ? (
          <div className="empty-state">
            <p style={{ color: 'var(--text-secondary)' }}>No CLV data yet. Save parlays to start tracking.</p>
          </div>
        ) : (
          <table className="data-table">
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

function BankrollDashboard({ 
  summary, 
  state 
}: { 
  summary: BankrollSummary | null; 
  state: any 
}) {
  async function exportData(format: 'txt' | 'md' | 'pdf') {
    window.open(`/api/export?type=bankroll&format=${format}`, '_blank');
  }
  
  if (!summary) {
    return (
      <div className="bankroll-dashboard">
        <div className="empty-state">
          <Wallet size={48} className="empty-state-icon" />
          <h3 className="empty-state-title">Bankroll Tracker</h3>
          <p className="empty-state-text">Loading bankroll data...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bankroll-dashboard">
      <div className="dashboard-header">
        <h2 className="dashboard-title">
          <Wallet size={24} style={{ marginRight: 8 }} />
          Bankroll Management
        </h2>
        <div className="export-buttons">
          <button className="btn btn-secondary export-btn" onClick={() => exportData('txt')}>TXT</button>
          <button className="btn btn-secondary export-btn" onClick={() => exportData('md')}>MD</button>
          <button className="btn btn-secondary export-btn" onClick={() => exportData('pdf')}>PDF</button>
        </div>
      </div>
      
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontStyle: 'italic' }}>
        "Turtle Position-Sizing: Quarter-Kelly with drawdown protection. Law 3: Protect your bankroll."
      </p>
      
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{summary.tier}</div>
          <div className="metric-label">Tier</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">${summary.bankroll}</div>
          <div className="metric-label">Bankroll</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">${summary.unitSize}</div>
          <div className="metric-label">Unit Size</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{summary.units}u</div>
          <div className="metric-label">Total Units</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{summary.availableUnits}u</div>
          <div className="metric-label">Available</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{summary.activeBets}</div>
          <div className="metric-label">Active Bets</div>
        </div>
      </div>
      
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="metric-card">
          <div className="metric-value" style={{ color: summary.profitLoss.startsWith('-') ? 'var(--danger)' : 'var(--success)' }}>
            {summary.profitLoss.startsWith('-') ? '' : '+'}{summary.profitLoss}
          </div>
          <div className="metric-label">P&L</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: summary.profitLossPercent.startsWith('-') ? 'var(--danger)' : 'var(--success)' }}>
            {summary.profitLossPercent}
          </div>
          <div className="metric-label">Return</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--warning)' }}>{summary.drawdown}</div>
          <div className="metric-label">Drawdown</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">${summary.peakBankroll}</div>
          <div className="metric-label">Peak Bankroll</div>
        </div>
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  function scanMarkets() {
    setIsLoading(true);
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
    fetch(`/api/parlays?${params.toString()}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setIsLoading(false));
  }

  useEffect(() => { 
    loadHistory();
    loadCLVData();
    loadBankrollData();
    scanMarkets();
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
    if (tab === 'clv' || tab === 'bankroll') return [];
    
    const source = tab === 'threeLegs' ? data?.threeLegs || [] : tab === 'fourLegs' ? data?.fourLegs || [] : data?.fiveLegs || [];
    return source.filter(p => {
      const avgEdge = p.legs.reduce((sum, l) => sum + l.edge, 0) / p.legs.length;
      const passesEv = (p.expectedValue * 100) >= filters.minParlayEv;
      const passesScore = p.score >= filters.minScore;
      const passesEdge = avgEdge >= filters.minLegEdge;
      const passesSearch = !filters.search || p.legs.some(l => l.selection.toLowerCase().includes(filters.search.toLowerCase()));
      return passesEv && passesScore && passesEdge && passesSearch;
    });
  }, [data, tab, filters]);

  const navItems = [
    { id: 'threeLegs', label: '3-Leg Parlays', icon: TrendingUp, count: data?.threeLegs.length },
    { id: 'fourLegs', label: '4-Leg Parlays', icon: TrendingUp, count: data?.fourLegs.length },
    { id: 'fiveLegs', label: '5-Leg Parlays', icon: TrendingUp, count: data?.fiveLegs.length },
    { id: 'history', label: 'VIC Portfolio', icon: History, count: history.length },
    { id: 'clv', label: 'CLV Tracker', icon: BarChart3 },
    { id: 'bankroll', label: 'Bankroll', icon: Wallet },
  ];

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-section">
          <div className="sidebar-label">Builder</div>
          {navItems.slice(0, 3).map(item => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => { setTab(item.id as Tab); setSidebarOpen(false); }}
            >
              <item.icon size={20} />
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span className="nav-badge">{item.count}</span>
              )}
            </button>
          ))}
        </div>
        
        <div className="sidebar-section">
          <div className="sidebar-label">Tracking</div>
          {navItems.slice(3).map(item => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => { setTab(item.id as Tab); setSidebarOpen(false); }}
            >
              <item.icon size={20} />
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span className="nav-badge">{item.count}</span>
              )}
            </button>
          ))}
        </div>
        
        <div style={{ marginTop: 'auto' }}>
          <div className="sidebar-section">
            <div className="sidebar-label">Settings</div>
            <button className="nav-item">
              <Settings size={20} />
              Preferences
            </button>
          </div>
        </div>
      </aside>

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <button 
            className="btn btn-secondary" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ display: 'none' }}
          >
            <Menu size={20} />
          </button>
          <div className="logo">
            <div className="logo-icon">
              <Zap size={20} />
            </div>
            VIC MLB Props
          </div>
          <div className="status-badge">
            <span className="status-dot"></span>
            {data?.usingMockData ? 'Mock Data' : 'Live Odds'}
          </div>
        </div>
        
        <div className="header-right">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {data?.eventsFound || 0} events · {data?.legsFound || 0} legs
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Hero */}
        <div className="hero">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h1 className="hero-title">
                {tab === 'threeLegs' && '3-Leg Parlays'}
                {tab === 'fourLegs' && '4-Leg Parlays'}
                {tab === 'fiveLegs' && '5-Leg Parlays'}
                {tab === 'history' && 'VIC Portfolio'}
                {tab === 'clv' && 'CLV Tracker'}
                {tab === 'bankroll' && 'Bankroll Management'}
              </h1>
              <p className="hero-subtitle">
                {tab === 'history' && 'Your saved +EV parlays with CLV tracking'}
                {tab === 'clv' && 'Track your closing line value performance'}
                {tab === 'bankroll' && 'Turtle Doctrine position-sizing system'}
                {tab !== 'history' && tab !== 'clv' && tab !== 'bankroll' && 'Value • Information • Closing Line Edge'}
              </p>
            </div>
            {tab !== 'history' && tab !== 'clv' && tab !== 'bankroll' && (
              <button 
                className="btn btn-primary" 
                onClick={scanMarkets}
                disabled={isLoading}
                style={{ 
                  padding: '12px 24px', 
                  fontSize: 14,
                  fontWeight: 700,
                  minWidth: 160
                }}
              >
                {isLoading ? (
                  <>
                    <Activity size={18} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Search size={18} style={{ marginRight: 8 }} />
                    Scan Markets
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* CLV Dashboard */}
        {tab === 'clv' && clvSummary && (
          <CLVDashboard summary={clvSummary} history={clvHistory} />
        )}

        {/* Bankroll Dashboard */}
        {tab === 'bankroll' && (
          <BankrollDashboard summary={bankrollSummary} state={bankrollState} />
        )}

        {/* History Tab */}
        {tab === 'history' && (
          <div>
            <div className="history-bar" style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: 24,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 16,
              padding: 16
            }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                <History size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                {history.length} saved parlay{history.length !== 1 ? 's' : ''}
              </div>
              {history.length > 0 && (
                <button className="btn btn-secondary" onClick={clearHistory}>Clear History</button>
              )}
            </div>
            
            {history.length === 0 ? (
              <div className="empty-state">
                <Save size={48} className="empty-state-icon" />
                <h3 className="empty-state-title">No Saved Parlays</h3>
                <p className="empty-state-text">Save parlays from the builder tabs to track them here.</p>
              </div>
            ) : (
              <div className="grid">
                {history.map((parlay, i) => (
                  <ParlayCard key={parlay.id} parlay={parlay} rank={i + 1} saved />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Builder Tabs */}
        {tab !== 'history' && tab !== 'clv' && tab !== 'bankroll' && (
          <>
            {/* Filters */}
            <div className="filters">
              <div className="filter-group">
                <label className="filter-label">Search Players</label>
                <input
                  className="filter-input"
                  type="text"
                  placeholder="Search..."
                  value={filters.search}
                  onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                  style={{ paddingLeft: 36, backgroundImage: 'none' }}
                />
              </div>
              <div className="filter-group">
                <label className="filter-label">Min Edge per Leg</label>
                <input
                  className="filter-input"
                  type="range"
                  min="0"
                  max="20"
                  step="0.5"
                  value={filters.minLegEdge}
                  onChange={e => setFilters(f => ({ ...f, minLegEdge: Number(e.target.value) }))}
                />
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{filters.minLegEdge}%</div>
              </div>
              <div className="filter-group">
                <label className="filter-label">Min Parlay EV</label>
                <input
                  className="filter-input"
                  type="range"
                  min="-50"
                  max="200"
                  step="5"
                  value={filters.minParlayEv}
                  onChange={e => setFilters(f => ({ ...f, minParlayEv: Number(e.target.value) }))}
                />
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{filters.minParlayEv}%</div>
              </div>
              <div className="filter-group">
                <label className="filter-label">Min VIC Score</label>
                <input
                  className="filter-input"
                  type="range"
                  min="-1000"
                  max="500"
                  step="10"
                  value={filters.minScore}
                  onChange={e => setFilters(f => ({ ...f, minScore: Number(e.target.value) }))}
                />
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{filters.minScore}</div>
              </div>
            </div>

            {/* Market Filters */}
            <div className="market-filters">
              <div className="market-toolbar">
                <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>Markets:</span>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => setGroup('pitcher')}
                >
                  Pitcher
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => setGroup('hitter')}
                >
                  Hitter
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => setGroup('game')}
                >
                  Game
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => setSelectedMarkets(DEFAULT_MARKETS)}
                >
                  Reset
                </button>
              </div>
              
              <div className="market-group">
                <div className="market-group-title">Pitcher</div>
                <div className="market-chips">
                  {MARKET_GROUPS.pitcher.map(([key, label]) => (
                    <label key={key} className={`chip ${selectedMarkets.includes(key) ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedMarkets.includes(key)}
                        onChange={() => toggleMarket(key)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="market-group">
                <div className="market-group-title">Hitter</div>
                <div className="market-chips">
                  {MARKET_GROUPS.hitter.map(([key, label]) => (
                    <label key={key} className={`chip ${selectedMarkets.includes(key) ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedMarkets.includes(key)}
                        onChange={() => toggleMarket(key)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="market-group">
                <div className="market-group-title">Game</div>
                <div className="market-chips">
                  {MARKET_GROUPS.game.map(([key, label]) => (
                    <label key={key} className={`chip ${selectedMarkets.includes(key) ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedMarkets.includes(key)}
                        onChange={() => toggleMarket(key)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Parlay Grid */}
            {parlays.length === 0 ? (
              <div className="empty-state">
                <AlertCircle size={48} className="empty-state-icon" />
                <h3 className="empty-state-title">No Parlays Found</h3>
                <p className="empty-state-text">
                  Try adjusting your filters or selecting more markets.
                </p>
              </div>
            ) : (
              <div className="grid">
                {parlays.map((parlay, i) => (
                  <ParlayCard 
                    key={parlay.legs.map(l => l.id).join('|')} 
                    parlay={parlay} 
                    rank={i + 1}
                    onSave={saveParlay}
                    saved={history.some(p => p.id === parlayKey(parlay))}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-left">
          <span>© 2026 Oddsify Labs</span>
          <span>•</span>
          <span>Turtle Doctrine Edition</span>
        </div>
        <div className="footer-right">
          <span>v1.0.0</span>
          <span>•</span>
          <span style={{ color: 'var(--success)' }}>
            <CheckCircle2 size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            System Operational
          </span>
        </div>
      </footer>
    </div>
  );
}
