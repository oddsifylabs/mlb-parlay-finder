/**
 * VIC MLB Props — Data Export Utility
 * 
 * Export formats: TXT, Markdown, PDF
 * Export types: Portfolio, CLV History, Bankroll History, Signal Performance
 */

// Inline type definitions (matching app/page.tsx types)
type SavedParlay = {
  id: string;
  savedAt: string;
  note?: string;
  legs: Array<{
    selection: string;
    event: string;
    market: string;
    price: number;
    edge: number;
    signals?: Array<{ type: string; weight: number }>;
  }>;
  americanOdds: number;
  estimatedProbability: number;
  expectedValue: number;
  score: number;
  openingLine?: number;
  closingLine?: number;
  clv?: number;
  result?: 'win' | 'loss' | 'push';
  profitLoss?: number;
};

type CLVSummary = {
  totalBets: number;
  avgCLV: number;
  positiveCLVPercent: number;
  cumulativeCLV: number;
};

type BankrollSummary = {
  tier: string;
  bankroll: string;
  unitSize: string;
  units: string;
  availableUnits: string;
  drawdown: string;
  profitLoss: string;
  profitLossPercent: string;
  peakBankroll: string;
};

export type ExportFormat = 'txt' | 'md' | 'pdf';
export type ExportType = 'portfolio' | 'clv' | 'bankroll' | 'signals';

export interface ExportOptions {
  format: ExportFormat;
  type: ExportType;
  includeDetails?: boolean;
  dateRange?: { start: string; end: string };
}

/**
 * Generate plain text export
 */
export function exportToTXT(data: any, type: ExportType): string {
  const timestamp = new Date().toISOString();
  const separator = '='.repeat(80);
  
  switch (type) {
    case 'portfolio':
      return generatePortfolioTXT(data, timestamp, separator);
    case 'clv':
      return generateCLVTXT(data, timestamp, separator);
    case 'bankroll':
      return generateBankrollTXT(data, timestamp, separator);
    case 'signals':
      return generateSignalsTXT(data, timestamp, separator);
    default:
      return '';
  }
}

function generatePortfolioTXT(parlays: SavedParlay[], timestamp: string, separator: string): string {
  let output = `${separator}\n`;
  output += `VIC MLB Props — Portfolio Export\n`;
  output += `Generated: ${timestamp}\n`;
  output += `${separator}\n\n`;
  
  output += `SUMMARY\n`;
  output += `Total Parlays: ${parlays.length}\n`;
  output += `Wins: ${parlays.filter(p => p.result === 'win').length}\n`;
  output += `Losses: ${parlays.filter(p => p.result === 'loss').length}\n`;
  output += `Pushes: ${parlays.filter(p => p.result === 'push').length}\n\n`;
  
  parlays.forEach((parlay, i) => {
    output += `${separator}\n`;
    output += `PARLAY #${i + 1}\n`;
    output += `${separator}\n`;
    output += `Saved: ${parlay.savedAt}\n`;
    output += `Legs: ${parlay.legs.length}\n`;
    output += `Odds: ${parlay.americanOdds > 0 ? '+' : ''}${parlay.americanOdds}\n`;
    output += `Est. Probability: ${(parlay.estimatedProbability * 100).toFixed(1)}%\n`;
    output += `EV: ${(parlay.expectedValue * 100).toFixed(1)}%\n`;
    output += `VIC Score: ${parlay.score.toFixed(1)}\n`;
    
    if (parlay.openingLine) {
      output += `Opening Line: ${parlay.openingLine > 0 ? '+' : ''}${parlay.openingLine}\n`;
    }
    if (parlay.closingLine) {
      output += `Closing Line: ${parlay.closingLine > 0 ? '+' : ''}${parlay.closingLine}\n`;
    }
    if (parlay.clv !== undefined) {
      output += `CLV: ${(parlay.clv * 100).toFixed(2)}%\n`;
    }
    if (parlay.result) {
      output += `Result: ${parlay.result.toUpperCase()}\n`;
    }
    if (parlay.profitLoss !== undefined) {
      output += `P/L: ${parlay.profitLoss >= 0 ? '+' : ''}${parlay.profitLoss.toFixed(2)}u\n`;
    }
    
    output += `\nLEGS:\n`;
    parlay.legs.forEach((leg: SavedParlay['legs'][0], j: number) => {
      output += `  ${j + 1}. ${leg.selection}\n`;
      output += `     Event: ${leg.event}\n`;
      output += `     Market: ${leg.market}\n`;
      output += `     Odds: ${leg.price > 0 ? '+' : ''}${leg.price}\n`;
      output += `     Edge: ${(leg.edge * 100).toFixed(1)}%\n`;
      
      if (leg.signals && leg.signals.length > 0) {
        output += `     Signals: ${leg.signals.map((s: { type: string }) => s.type).join(', ')}\n`;
      }
      output += '\n';
    });
    
    if (parlay.note) {
      output += `NOTES: ${parlay.note}\n`;
    }
    output += '\n';
  });
  
  return output;
}

function generateCLVTXT(summary: CLVSummary & { history: any[] }, timestamp: string, separator: string): string {
  let output = `${separator}\n`;
  output += `VIC MLB Props — CLV Tracker Export\n`;
  output += `Generated: ${timestamp}\n`;
  output += `${separator}\n\n`;
  
  output += `SUMMARY\n`;
  output += `Total Bets: ${summary.totalBets}\n`;
  output += `Average CLV: ${(summary.avgCLV * 100).toFixed(2)}%\n`;
  output += `Positive CLV: ${summary.positiveCLVPercent.toFixed(1)}%\n`;
  output += `Cumulative CLV: ${(summary.cumulativeCLV * 100).toFixed(2)}%\n\n`;
  
  output += `HISTORY\n`;
  output += `${separator}\n`;
  
  summary.history.forEach((row, i) => {
    output += `${i + 1}. ${row.event} — ${row.selection}\n`;
    output += `   Date: ${new Date(row.savedAt).toLocaleDateString()}\n`;
    output += `   Open: ${row.openingLine > 0 ? '+' : ''}${row.openingLine}\n`;
    output += `   Close: ${row.closingLine > 0 ? '+' : ''}${row.closingLine}\n`;
    output += `   CLV: ${(row.clv * 100).toFixed(2)}%\n`;
    if (row.result) output += `   Result: ${row.result}\n`;
    output += '\n';
  });
  
  return output;
}

function generateBankrollTXT(data: any, timestamp: string, separator: string): string {
  let output = `${separator}\n`;
  output += `VIC MLB Props — Bankroll Report\n`;
  output += `Generated: ${timestamp}\n`;
  output += `${separator}\n\n`;
  
  if (data.summary) {
    output += `CURRENT STATUS\n`;
    output += `Tier: ${data.summary.tier}\n`;
    output += `Bankroll: ${data.summary.bankroll}\n`;
    output += `Unit Size: ${data.summary.unitSize}\n`;
    output += `Units: ${data.summary.units}u\n`;
    output += `Available: ${data.summary.availableUnits}u\n`;
    output += `Drawdown: ${data.summary.drawdown}\n`;
    output += `P/L: ${data.summary.profitLoss} (${data.summary.profitLossPercent})\n`;
    output += `Peak: ${data.summary.peakBankroll}\n\n`;
  }
  
  if (data.history && data.history.length > 0) {
    output += `HISTORY\n`;
    data.history.forEach((snapshot: any, i: number) => {
      output += `${i + 1}. ${new Date(snapshot.timestamp).toLocaleDateString()}\n`;
      output += `   Bankroll: $${snapshot.totalBankroll.toLocaleString()}\n`;
      output += `   Unit Size: $${snapshot.unitSize.toFixed(2)}\n`;
      output += `   Tier: ${snapshot.tier}\n`;
      output += `   Drawdown: ${(snapshot.drawdownPercent * 100).toFixed(1)}%\n`;
      output += `   P/L: $${(snapshot.profitLoss).toLocaleString()}\n\n`;
    });
  }
  
  return output;
}

function generateSignalsTXT(data: any[], timestamp: string, separator: string): string {
  let output = `${separator}\n`;
  output += `VIC MLB Props — Signal Performance Export\n`;
  output += `Generated: ${timestamp}\n`;
  output += `${separator}\n\n`;
  
  data.forEach((signal, i) => {
    output += `${signal.signalType}\n`;
    output += `  Total Bets: ${signal.totalBets}\n`;
    output += `  Wins: ${signal.wins}\n`;
    output += `  Losses: ${signal.losses}\n`;
    output += `  Pushes: ${signal.pushes}\n`;
    output += `  Win Rate: ${((signal.wins / signal.totalBets) * 100).toFixed(1)}%\n`;
    output += `  Avg CLV: ${(signal.avgCLV * 100).toFixed(2)}%\n`;
    output += `  ROI: ${(signal.roi * 100).toFixed(2)}%\n\n`;
  });
  
  return output;
}

/**
 * Generate Markdown export
 */
export function exportToMarkdown(data: any, type: ExportType): string {
  const timestamp = new Date().toISOString();
  
  switch (type) {
    case 'portfolio':
      return generatePortfolioMD(data, timestamp);
    case 'clv':
      return generateCLVMD(data, timestamp);
    case 'bankroll':
      return generateBankrollMD(data, timestamp);
    case 'signals':
      return generateSignalsMD(data, timestamp);
    default:
      return '';
  }
}

function generatePortfolioMD(parlays: SavedParlay[], timestamp: string): string {
  let md = `# VIC MLB Props — Portfolio Export\n\n`;
  md += `**Generated:** ${timestamp}\n\n`;
  
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Parlays | ${parlays.length} |\n`;
  md += `| Wins | ${parlays.filter(p => p.result === 'win').length} |\n`;
  md += `| Losses | ${parlays.filter(p => p.result === 'loss').length} |\n`;
  md += `| Pushes | ${parlays.filter(p => p.result === 'push').length} |\n\n`;
  
  parlays.forEach((parlay, i) => {
    md += `---\n\n`;
    md += `## Parlay #${i + 1}\n\n`;
    md += `| Property | Value |\n`;
    md += `|----------|-------|\n`;
    md += `| Saved | ${new Date(parlay.savedAt).toLocaleString()} |\n`;
    md += `| Legs | ${parlay.legs.length} |\n`;
    md += `| Odds | ${parlay.americanOdds > 0 ? '+' : ''}${parlay.americanOdds} |\n`;
    md += `| Est. Probability | ${(parlay.estimatedProbability * 100).toFixed(1)}% |\n`;
    md += `| EV | ${(parlay.expectedValue * 100).toFixed(1)}% |\n`;
    md += `| VIC Score | ${parlay.score.toFixed(1)} |\n`;
    
    if (parlay.openingLine) md += `| Opening Line | ${parlay.openingLine > 0 ? '+' : ''}${parlay.openingLine} |\n`;
    if (parlay.closingLine) md += `| Closing Line | ${parlay.closingLine > 0 ? '+' : ''}${parlay.closingLine} |\n`;
    if (parlay.clv !== undefined) md += `| CLV | ${(parlay.clv * 100).toFixed(2)}% |\n`;
    if (parlay.result) md += `| Result | **${parlay.result.toUpperCase()}** |\n`;
    if (parlay.profitLoss !== undefined) md += `| P/L | ${parlay.profitLoss >= 0 ? '+' : ''}${parlay.profitLoss.toFixed(2)}u |\n`;
    
    md += `\n### Legs\n\n`;
    parlay.legs.forEach((leg: SavedParlay['legs'][0], j: number) => {
      md += `${j + 1}. **${leg.selection}**\n`;
      md += `   - Event: ${leg.event}\n`;
      md += `   - Market: ${leg.market}\n`;
      md += `   - Odds: ${leg.price > 0 ? '+' : ''}${leg.price}\n`;
      md += `   - Edge: ${(leg.edge * 100).toFixed(1)}%\n`;
      
      if (leg.signals && leg.signals.length > 0) {
        md += `   - Signals: ${leg.signals.map((s: { type: string }) => s.type).join(', ')}\n`;
      }
    });
    
    if (parlay.note) md += `\n**Notes:** ${parlay.note}\n`;
    md += '\n';
  });
  
  return md;
}

function generateCLVMD(summary: CLVSummary & { history: any[] }, timestamp: string): string {
  let md = `# VIC MLB Props — CLV Tracker Export\n\n`;
  md += `**Generated:** ${timestamp}\n\n`;
  
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Bets | ${summary.totalBets} |\n`;
  md += `| Average CLV | ${(summary.avgCLV * 100).toFixed(2)}% |\n`;
  md += `| Positive CLV | ${summary.positiveCLVPercent.toFixed(1)}% |\n`;
  md += `| Cumulative CLV | ${(summary.cumulativeCLV * 100).toFixed(2)}% |\n\n`;
  
  md += `## History\n\n`;
  md += `| Date | Event | Selection | Open | Close | CLV | Result |\n`;
  md += `|------|-------|-----------|------|-------|-----|--------|\n`;
  
  summary.history.forEach((row: any) => {
    md += `| ${new Date(row.savedAt).toLocaleDateString()} | ${row.event} | ${row.selection} | `;
    md += `${row.openingLine > 0 ? '+' : ''}${row.openingLine} | `;
    md += `${row.closingLine > 0 ? '+' : ''}${row.closingLine} | `;
    md += `${row.clv > 0 ? '+' : ''}${(row.clv * 100).toFixed(2)}% | `;
    md += `${row.result || '—'} |\n`;
  });
  
  return md;
}

function generateBankrollMD(data: any, timestamp: string): string {
  let md = `# VIC MLB Props — Bankroll Report\n\n`;
  md += `**Generated:** ${timestamp}\n\n`;
  
  if (data.summary) {
    md += `## Current Status\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Tier | ${data.summary.tier} |\n`;
    md += `| Bankroll | ${data.summary.bankroll} |\n`;
    md += `| Unit Size | ${data.summary.unitSize} |\n`;
    md += `| Units | ${data.summary.units}u |\n`;
    md += `| Available | ${data.summary.availableUnits}u |\n`;
    md += `| Drawdown | ${data.summary.drawdown} |\n`;
    md += `| P/L | ${data.summary.profitLoss} (${data.summary.profitLossPercent}) |\n`;
    md += `| Peak | ${data.summary.peakBankroll} |\n\n`;
  }
  
  if (data.history && data.history.length > 0) {
    md += `## History\n\n`;
    md += `| Date | Bankroll | Unit Size | Tier | Drawdown | P/L |\n`;
    md += `|------|----------|-----------|------|----------|-----|\n`;
    
    data.history.forEach((snapshot: any) => {
      md += `| ${new Date(snapshot.timestamp).toLocaleDateString()} | `;
      md += `$${snapshot.totalBankroll.toLocaleString()} | `;
      md += `$${snapshot.unitSize.toFixed(2)} | `;
      md += `${snapshot.tier} | `;
      md += `${(snapshot.drawdownPercent * 100).toFixed(1)}% | `;
      md += `$${snapshot.profitLoss.toLocaleString()} |\n`;
    });
  }
  
  return md;
}

function generateSignalsMD(data: any[], timestamp: string): string {
  let md = `# VIC MLB Props — Signal Performance Export\n\n`;
  md += `**Generated:** ${timestamp}\n\n`;
  
  md += `| Signal Type | Total | Wins | Losses | Pushes | Win % | Avg CLV | ROI |\n`;
  md += `|-------------|-------|------|--------|--------|-------|---------|-----|\n`;
  
  data.forEach(signal => {
    md += `| ${signal.signalType} | `;
    md += `${signal.totalBets} | `;
    md += `${signal.wins} | `;
    md += `${signal.losses} | `;
    md += `${signal.pushes} | `;
    md += `${((signal.wins / signal.totalBets) * 100).toFixed(1)}% | `;
    md += `${(signal.avgCLV * 100).toFixed(2)}% | `;
    md += `${(signal.roi * 100).toFixed(2)}% |\n`;
  });
  
  return md;
}

/**
 * Generate PDF export (simplified text-based PDF)
 */
export async function exportToPDF(data: any, type: ExportType): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];
  
  doc.on('data', chunk => chunks.push(chunk));
  
  const timestamp = new Date().toISOString();
  
  // Title
  doc.fontSize(20).text('VIC MLB Props', { align: 'center' });
  doc.fontSize(14).text(`Export: ${type.charAt(0).toUpperCase() + type.slice(1)}`, { align: 'center' });
  doc.fontSize(10).text(`Generated: ${timestamp}`, { align: 'center' });
  doc.moveDown(2);
  
  // Content based on type
  switch (type) {
    case 'portfolio':
      generatePortfolioPDF(doc, data);
      break;
    case 'clv':
      generateCLVPDF(doc, data);
      break;
    case 'bankroll':
      generateBankrollPDF(doc, data);
      break;
    case 'signals':
      generateSignalsPDF(doc, data);
      break;
  }
  
  doc.end();
  
  return new Promise((resolve) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

function generatePortfolioPDF(doc: any, parlays: SavedParlay[]) {
  doc.fontSize(14).text('Summary', { underline: true });
  doc.fontSize(10);
  doc.text(`Total Parlays: ${parlays.length}`);
  doc.text(`Wins: ${parlays.filter(p => p.result === 'win').length}`);
  doc.text(`Losses: ${parlays.filter(p => p.result === 'loss').length}`);
  doc.text(`Pushes: ${parlays.filter(p => p.result === 'push').length}`);
  doc.moveDown();
  
  parlays.forEach((parlay, i) => {
    if (doc.y > 700) doc.addPage();
    
    doc.fontSize(12).text(`Parlay #${i + 1}`, { underline: true });
    doc.fontSize(10);
    doc.text(`Legs: ${parlay.legs.length}`);
    doc.text(`Odds: ${parlay.americanOdds > 0 ? '+' : ''}${parlay.americanOdds}`);
    doc.text(`Est. Probability: ${(parlay.estimatedProbability * 100).toFixed(1)}%`);
    doc.text(`VIC Score: ${parlay.score.toFixed(1)}`);
    
    if (parlay.result) doc.text(`Result: ${parlay.result.toUpperCase()}`);
    if (parlay.clv !== undefined) doc.text(`CLV: ${(parlay.clv * 100).toFixed(2)}%`);
    if (parlay.profitLoss !== undefined) doc.text(`P/L: ${parlay.profitLoss >= 0 ? '+' : ''}${parlay.profitLoss.toFixed(2)}u`);
    
    doc.moveDown();
    doc.fontSize(11).text('Legs:', { underline: true });
    doc.fontSize(10);
    
    parlay.legs.forEach((leg: SavedParlay['legs'][0], j: number) => {
      doc.text(`${j + 1}. ${leg.selection} (${leg.event}) — ${leg.price > 0 ? '+' : ''}${leg.price}`);
    });
    
    doc.moveDown(2);
  });
}

function generateCLVPDF(doc: any, summary: any) {
  doc.fontSize(14).text('Summary', { underline: true });
  doc.fontSize(10);
  doc.text(`Total Bets: ${summary.totalBets}`);
  doc.text(`Average CLV: ${(summary.avgCLV * 100).toFixed(2)}%`);
  doc.text(`Positive CLV: ${summary.positiveCLVPercent.toFixed(1)}%`);
  doc.text(`Cumulative CLV: ${(summary.cumulativeCLV * 100).toFixed(2)}%`);
  doc.moveDown(2);
  
  doc.fontSize(12).text('History', { underline: true });
  doc.fontSize(10);
  
  (summary.history || []).slice(0, 50).forEach((row: any, i: number) => {
    if (doc.y > 700) doc.addPage();
    doc.text(`${i + 1}. ${row.event} — ${row.selection}`);
    doc.text(`   CLV: ${(row.clv * 100).toFixed(2)}% | Result: ${row.result || '—'}`);
    doc.moveDown(0.5);
  });
}

function generateBankrollPDF(doc: any, data: any) {
  if (data.summary) {
    doc.fontSize(14).text('Current Status', { underline: true });
    doc.fontSize(10);
    doc.text(`Tier: ${data.summary.tier}`);
    doc.text(`Bankroll: ${data.summary.bankroll}`);
    doc.text(`Unit Size: ${data.summary.unitSize}`);
    doc.text(`Drawdown: ${data.summary.drawdown}`);
    doc.text(`P/L: ${data.summary.profitLoss} (${data.summary.profitLossPercent})`);
    doc.moveDown(2);
  }
  
  if (data.history && data.history.length > 0) {
    doc.fontSize(12).text('History', { underline: true });
    doc.fontSize(10);
    
    data.history.forEach((snapshot: any, i: number) => {
      if (doc.y > 700) doc.addPage();
      doc.text(`${i + 1}. ${new Date(snapshot.timestamp).toLocaleDateString()}`);
      doc.text(`   Bankroll: $${snapshot.totalBankroll.toLocaleString()} | Tier: ${snapshot.tier} | DD: ${(snapshot.drawdownPercent * 100).toFixed(1)}%`);
      doc.moveDown(0.5);
    });
  }
}

function generateSignalsPDF(doc: any, data: any[]) {
  data.forEach(signal => {
    if (doc.y > 700) doc.addPage();
    
    doc.fontSize(12).text(signal.signalType, { underline: true });
    doc.fontSize(10);
    doc.text(`Total Bets: ${signal.totalBets}`);
    doc.text(`Wins: ${signal.wins} | Losses: ${signal.losses} | Pushes: ${signal.pushes}`);
    doc.text(`Win Rate: ${((signal.wins / signal.totalBets) * 100).toFixed(1)}%`);
    doc.text(`Avg CLV: ${(signal.avgCLV * 100).toFixed(2)}%`);
    doc.text(`ROI: ${(signal.roi * 100).toFixed(2)}%`);
    doc.moveDown(2);
  });
}
