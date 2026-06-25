import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export type SavedParlayRecord = {
  id: string;
  savedAt: string;
  note: string;
  parlay: unknown;
  // CLV tracking fields (Turtle Doctrine Chapter 7, 10)
  openingLine?: number;
  closingLine?: number;
  clv?: number;
  result?: 'win' | 'loss' | 'push';
  profitLoss?: number;  // In units
  signalTypes?: string[];  // Detected VIC signals
};

export type BankrollRecord = {
  id: string;
  timestamp: string;
  totalBankroll: number;
  unitSize: number;
  tier: string;
  drawdownPercent: number;
  activeBets: number;
  profitLoss: number;  // Since season start
};

export type CLVRecord = {
  id: string;
  savedAt: string;
  event: string;
  selection: string;
  openingLine: number;
  closingLine: number;
  clv: number;
  result?: 'win' | 'loss' | 'push';
};

export type SignalPerformanceRecord = {
  signalType: string;
  totalBets: number;
  wins: number;
  losses: number;
  pushes: number;
  avgCLV: number;
  roi: number;
};

function dataDir(): string {
  const configured = process.env.SQLITE_DATA_DIR;
  const dir = configured ? path.resolve(configured) : path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dbPath(): string {
  return process.env.SQLITE_DB_PATH ? path.resolve(process.env.SQLITE_DB_PATH) : path.join(dataDir(), 'mlb-parlay-finder.sqlite');
}

let db: Database.Database | null = null;

export function getDb() {
  if (!db) {
    db = new Database(dbPath());
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE IF NOT EXISTS saved_parlays (
        id TEXT PRIMARY KEY,
        saved_at TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        parlay_json TEXT NOT NULL,
        opening_line REAL,
        closing_line REAL,
        clv REAL,
        result TEXT CHECK(result IN ('win', 'loss', 'push')),
        profit_loss REAL,
        signal_types TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_saved_parlays_saved_at ON saved_parlays(saved_at DESC);
      CREATE INDEX IF NOT EXISTS idx_saved_parlays_result ON saved_parlays(result);
      CREATE INDEX IF NOT EXISTS idx_saved_parlays_clv ON saved_parlays(clv);
      
      CREATE TABLE IF NOT EXISTS bankroll_snapshots (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        total_bankroll REAL NOT NULL,
        unit_size REAL NOT NULL,
        tier TEXT NOT NULL,
        drawdown_percent REAL NOT NULL,
        active_bets INTEGER NOT NULL,
        profit_loss REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bankroll_snapshots_timestamp ON bankroll_snapshots(timestamp DESC);
      
      CREATE TABLE IF NOT EXISTS clv_tracking (
        id TEXT PRIMARY KEY,
        saved_at TEXT NOT NULL,
        event TEXT NOT NULL,
        selection TEXT NOT NULL,
        opening_line REAL NOT NULL,
        closing_line REAL NOT NULL,
        clv REAL NOT NULL,
        result TEXT CHECK(result IN ('win', 'loss', 'push'))
      );
      CREATE INDEX IF NOT EXISTS idx_clv_tracking_saved_at ON clv_tracking(saved_at DESC);
      CREATE INDEX IF NOT EXISTS idx_clv_tracking_clv ON clv_tracking(clv);
    `);
  }
  return db;
}

export function listSavedParlays(): SavedParlayRecord[] {
  const rows = getDb().prepare(`
    SELECT id, saved_at AS savedAt, note, parlay_json AS parlayJson, opening_line AS openingLine, closing_line AS closingLine, clv, result, profit_loss AS profitLoss, signal_types AS signalTypes
    FROM saved_parlays
    ORDER BY saved_at DESC
    LIMIT 250
  `).all() as Array<{ id: string; savedAt: string; note: string; parlayJson: string; openingLine?: number; closingLine?: number; clv?: number; result?: 'win'|'loss'|'push'; profitLoss?: number; signalTypes?: string }>;

  return rows.map(row => ({
    id: row.id,
    savedAt: row.savedAt,
    note: row.note,
    parlay: JSON.parse(row.parlayJson),
    openingLine: row.openingLine,
    closingLine: row.closingLine,
    clv: row.clv,
    result: row.result,
    profitLoss: row.profitLoss,
    signalTypes: row.signalTypes ? JSON.parse(row.signalTypes) : undefined
  }));
}

export function deleteSavedParlay(id: string) {
  getDb().prepare('DELETE FROM saved_parlays WHERE id = ?').run(id);
}

export function clearSavedParlays() {
  getDb().prepare('DELETE FROM saved_parlays').run();
}

// CLV Tracking functions (Turtle Doctrine Chapter 7, 10)

export function saveCLVRecord(record: CLVRecord) {
  getDb().prepare(`
    INSERT OR REPLACE INTO clv_tracking (id, saved_at, event, selection, opening_line, closing_line, clv, result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(record.id, record.savedAt, record.event, record.selection, record.openingLine, record.closingLine, record.clv, record.result || null);
}

export function getCLVHistory(limit = 100): CLVRecord[] {
  const rows = getDb().prepare(`
    SELECT id, saved_at AS savedAt, event, selection, opening_line AS openingLine, closing_line AS closingLine, clv, result
    FROM clv_tracking
    ORDER BY saved_at DESC
    LIMIT ?
  `).all(limit) as Array<{ id: string; savedAt: string; event: string; selection: string; openingLine: number; closingLine: number; clv: number; result?: 'win' | 'loss' | 'push' }>;
  
  return rows;
}

export function getCLVSummary(): { totalBets: number; avgCLV: number; positiveCLVPercent: number; cumulativeCLV: number } {
  const row = getDb().prepare(`
    SELECT 
      COUNT(*) as totalBets,
      AVG(clv) as avgCLV,
      SUM(CASE WHEN clv > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as positiveCLVPercent,
      SUM(clv) as cumulativeCLV
    FROM clv_tracking
  `).get() as { totalBets: number; avgCLV: number; positiveCLVPercent: number; cumulativeCLV: number };
  
  return row || { totalBets: 0, avgCLV: 0, positiveCLVPercent: 0, cumulativeCLV: 0 };
}

export function getSignalPerformance(): SignalPerformanceRecord[] {
  const rows = getDb().prepare(`
    SELECT 
      signal_type as signalType,
      COUNT(*) as totalBets,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN result = 'push' THEN 1 ELSE 0 END) as pushes,
      AVG(clv) as avgCLV,
      AVG(profit_loss) as roi
    FROM saved_parlays
    WHERE signal_types IS NOT NULL AND signal_types != '[]'
    GROUP BY signal_type
  `).all() as Array<{ signalType: string; totalBets: number; wins: number; losses: number; pushes: number; avgCLV: number; roi: number }>;
  
  return rows;
}

// Bankroll tracking functions

export function saveBankrollSnapshot(record: BankrollRecord) {
  getDb().prepare(`
    INSERT OR REPLACE INTO bankroll_snapshots (id, timestamp, total_bankroll, unit_size, tier, drawdown_percent, active_bets, profit_loss)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(record.id, record.timestamp, record.totalBankroll, record.unitSize, record.tier, record.drawdownPercent, record.activeBets, record.profitLoss);
}

export function getBankrollHistory(days = 30): BankrollRecord[] {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = getDb().prepare(`
    SELECT id, timestamp, total_bankroll AS totalBankroll, unit_size AS unitSize, tier, drawdown_percent AS drawdownPercent, active_bets AS activeBets, profit_loss AS profitLoss
    FROM bankroll_snapshots
    WHERE timestamp >= ?
    ORDER BY timestamp DESC
  `).all(cutoff) as Array<{ id: string; timestamp: string; totalBankroll: number; unitSize: number; tier: string; drawdownPercent: number; activeBets: number; profitLoss: number }>;
  
  return rows.reverse();  // Chronological order
}

export function getLatestBankrollSnapshot(): BankrollRecord | null {
  const row = getDb().prepare(`
    SELECT id, timestamp, total_bankroll AS totalBankroll, unit_size AS unitSize, tier, drawdown_percent AS drawdownPercent, active_bets AS activeBets, profit_loss AS profitLoss
    FROM bankroll_snapshots
    ORDER BY timestamp DESC
    LIMIT 1
  `).get() as { id: string; timestamp: string; totalBankroll: number; unitSize: number; tier: string; drawdownPercent: number; activeBets: number; profitLoss: number } | undefined;
  
  return row || null;
}

// Enhanced parlay save with CLV fields

export function saveParlay(id: string, parlay: unknown, note = '', openingLine?: number, signalTypes?: string[]) {
  const savedAt = new Date().toISOString();
  getDb().prepare(`
    INSERT OR REPLACE INTO saved_parlays (id, saved_at, note, parlay_json, opening_line, signal_types)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, savedAt, note, JSON.stringify(parlay), openingLine || null, signalTypes ? JSON.stringify(signalTypes) : null);
  return { id, savedAt, note, parlay, openingLine, signalTypes };
}

export function updateParlayResult(id: string, result: 'win' | 'loss' | 'push', closingLine?: number, profitLoss?: number) {
  const updates: string[] = ['result = ?'];
  const params: any[] = [result];
  
  if (closingLine !== undefined) {
    updates.push('closing_line = ?');
    params.push(closingLine);
    // Calculate CLV
    const row = getDb().prepare('SELECT opening_line FROM saved_parlays WHERE id = ?').get(id) as { opening_line?: number } | undefined;
    if (row?.opening_line !== undefined && closingLine !== undefined) {
      const clv = (closingLine - row.opening_line) / row.opening_line;
      updates.push('clv = ?');
      params.push(clv);
    }
  }
  
  if (profitLoss !== undefined) {
    updates.push('profit_loss = ?');
    params.push(profitLoss);
  }
  
  updates.push('saved_at = ?');
  params.push(new Date().toISOString());
  
  params.push(id);
  
  getDb().prepare(`UPDATE saved_parlays SET ${updates.join(', ')} WHERE id = ?`).run(...params);
}
