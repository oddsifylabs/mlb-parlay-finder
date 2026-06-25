import { NextResponse } from 'next/server';
import { exportToTXT, exportToMarkdown, exportToPDF, type ExportType, type ExportFormat } from '../../../lib/export';
import { listSavedParlays, getCLVSummary, getCLVHistory, getSignalPerformance, getBankrollHistory, getLatestBankrollSnapshot } from '../../../lib/db/history';
import { createBankrollState, getBankrollSummary } from '../../../lib/bankroll';

/**
 * Export API Endpoint
 * 
 * GET /api/export?type=portfolio|clv|bankroll|signals&format=txt|md|pdf
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ExportType | null;
    const format = searchParams.get('format') as ExportFormat | null;
    
    if (!type || !format) {
      return NextResponse.json({ 
        error: 'Missing required parameters',
        required: ['type', 'format'],
        validTypes: ['portfolio', 'clv', 'bankroll', 'signals'],
        validFormats: ['txt', 'md', 'pdf']
      }, { status: 400 });
    }
    
    let data: any;
    
    // Fetch data based on type
    switch (type) {
      case 'portfolio':
        data = listSavedParlays();
        break;
      case 'clv':
        const summary = getCLVSummary();
        const history = getCLVHistory(100);
        data = { ...summary, history };
        break;
      case 'bankroll':
        const latest = getLatestBankrollSnapshot();
        const state = latest 
          ? {
              totalBankroll: latest.totalBankroll,
              currentUnits: latest.totalBankroll / latest.unitSize,
              startingBankroll: latest.totalBankroll - latest.profitLoss,
              peakBankroll: latest.totalBankroll / (1 - latest.drawdownPercent),
              drawdownPercent: latest.drawdownPercent,
              tier: latest.tier as 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4',
              unitSize: latest.unitSize,
              activeBets: latest.activeBets,
              reservedUnits: 0,
              availableUnits: (latest.totalBankroll / latest.unitSize) - latest.activeBets
            }
          : createBankrollState(parseFloat(process.env.DEFAULT_BANKROLL || '5000'));
        const bankrollSummary = getBankrollSummary(state);
        const bankrollHistory = getBankrollHistory(30);
        data = { summary: bankrollSummary, state, history: bankrollHistory };
        break;
      case 'signals':
        data = getSignalPerformance();
        break;
      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
    
    // Generate export based on format
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `vic-${type}-${timestamp}`;
    
    switch (format) {
      case 'txt': {
        const content = exportToTXT(data, type);
        return new NextResponse(content, {
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': `attachment; filename="${filename}.txt"`
          }
        });
      }
      
      case 'md': {
        const content = exportToMarkdown(data, type);
        return new NextResponse(content, {
          headers: {
            'Content-Type': 'text/markdown',
            'Content-Disposition': `attachment; filename="${filename}.md"`
          }
        });
      }
      
      case 'pdf': {
        const buffer = await exportToPDF(data, type);
        // Convert Node Buffer to web-compatible ArrayBuffer
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
        return new NextResponse(arrayBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}.pdf"`
          }
        });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }
  } catch (err) {
    console.error('Export error:', err);
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Export failed',
      stack: err instanceof Error ? err.stack : undefined
    }, { status: 500 });
  }
}
