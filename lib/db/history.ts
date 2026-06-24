import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export type SavedParlayRecord = {
  id: string;
  savedAt: string;
  note: string;
  parlay: unknown;
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
        parlay_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_saved_parlays_saved_at ON saved_parlays(saved_at DESC);
    `);
  }
  return db;
}

export function listSavedParlays(): SavedParlayRecord[] {
  const rows = getDb().prepare(`
    SELECT id, saved_at AS savedAt, note, parlay_json AS parlayJson
    FROM saved_parlays
    ORDER BY saved_at DESC
    LIMIT 250
  `).all() as Array<{ id: string; savedAt: string; note: string; parlayJson: string }>;

  return rows.map(row => ({
    id: row.id,
    savedAt: row.savedAt,
    note: row.note,
    parlay: JSON.parse(row.parlayJson)
  }));
}

export function saveParlay(id: string, parlay: unknown, note = '') {
  const savedAt = new Date().toISOString();
  getDb().prepare(`
    INSERT OR REPLACE INTO saved_parlays (id, saved_at, note, parlay_json)
    VALUES (?, ?, ?, ?)
  `).run(id, savedAt, note, JSON.stringify(parlay));
  return { id, savedAt, note, parlay };
}

export function deleteSavedParlay(id: string) {
  getDb().prepare('DELETE FROM saved_parlays WHERE id = ?').run(id);
}

export function clearSavedParlays() {
  getDb().prepare('DELETE FROM saved_parlays').run();
}
